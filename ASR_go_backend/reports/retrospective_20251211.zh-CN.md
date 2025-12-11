# 高并发负载测试问题复盘与解决方案报告

> **语言切换**: [English](retrospective_20251211.md) | [简体中文](retrospective_20251211.zh-CN.md)


**日期**: 2025-12-11
**项目**: ASR Go Backend (Katydid)
**测试目标**: 500路并发音频流实时语音识别

---

## 1. 摘要

本次测试旨在验证 Go Backend 在 500 路高并发下的稳定性。测试初期遭遇了持续的 0% 成功率，导致后端多次崩溃。经过深入排查，共发现并修复了 **4 个关键致死 Bug**。修复后，系统在 10 路并发下保持 100% 成功率，在 500 路并发下后端服务稳定运行（吞吐量受限于下游 Python Worker 算力，出现排队超时，但服务本身未崩溃），达到了预期的架构稳定性目标。

---

## 2. 故障排查详细复盘

本次调试经历了四个阶段的失败，分别对应系统架构、配置管理、跨语言协作、代码质量四个层面的问题。

### 🚨 故障一：Redis 连接爆炸 (The "Too Many Open Files" Panic)

*   **现象**: 
    *   在启动 500 路负载测试后，Go 后端瞬间崩溃。
    *   错误日志显示 `panic: too many open files`，堆栈跟踪指向 Redis `Subscribe` 调用。
*   **根因分析**:
    *   **架构设计缺陷**: 原始的 `ProcessChunk` 逻辑是 **"同步模式"**。即：每收到一个 WebSocket 音频分片（Chunk），后端就向 Redis 发起一个新的 `Subscribe` 请求等待结果。
    *   **计算**: 500 用户 x 1分钟音频 (约 300 chunks) = **150,000 次订阅操作**。
    *   即使 Go 协程轻量，但底层的 TCP 连接和文件句柄被瞬间耗尽，导致系统崩溃。
*   **解决方案**:
    *   **架构重构 -> 异步消费者模型 (Async Consumer)**。
    *   **优化后逻辑**: 
        1.  WebSocket 建立连接时，**只订阅一次** Redis 结果频道。
        2.  收到音频分片时，仅执行 `RPush` (Fire-and-Forget)，不等待，不阻塞。
        3.  单独的后台协程持续从 Redis 读取结果并推回 WebSocket。
    *   **效果**: Redis 订阅数恒定为 500（每用户 1 个），与音频时长无关。

### ⛔ 故障二：连接数限制 (Connection Refused)

*   **现象**: 
    *   修复 Redis 问题后，压测脚本显示绝大多数连接失败（`Connect call failed`）。
    *   只有极少数（约 5 个）用户能成功连接。
*   **根因分析**:
    *   **配置失误**: 检查 `config.yaml` 发现 `MAX_CONNECTIONS` 被设为了 `1000`，但实际运行时日志显示 **MaxConnections: 5**。
    *   追查发现可能是之前的开发环境热加载配置或环境变量残留导致的默认值覆盖。
*   **解决方案**:
    *   强制更新 `config.yaml` 并通过环境变量 `MAX_CONNECTIONS=2000` 启动后端，确保容量充足。

### 🐛 故障三：Python Worker 崩溃 (Log Level Error)

*   **现象**: 
    *   后端连接成功，但所有任务都超时，没有结果返回。
    *   检查 Python Worker 日志，发现 Worker 启动即退出。
    *   报错：`ValueError: Level 'debug' does not exist`。
*   **根因分析**:
    *   **跨语言/库兼容性**: Go 后端传递的环境变量 `LOG_LEVEL` 为小写 `"debug"`。Python 使用的 `loguru` 库在于 `pydantic` 配置加载时，严格要求日志级别为大写（如 `"DEBUG"`），否则抛出异常。
*   **解决方案**:
    *   修改 `ASR_server/src/utils/logger.py`，在加载配置时强制执行 `.upper()` 转换，增强了系统的鲁棒性。

### 💥 故障四：Go 后端死锁/崩溃 (Double Unlock Panic)

*   **现象**: 
    *   前三个问题修复后，小规模测试跑了一半再次崩溃。
    *   错误日志：`fatal error: sync: unlock of unlocked mutex`。
*   **根因分析**:
    *   **代码质量 (低级错误)**: 在 `WaitAndMerge` 函数中，为了处理复杂的并发状态，手动管理了 `Mutex`。在一次代码调整中，意外地连续写了两次 `state.mu.Unlock()`。
    *   Go 的 `sync.Mutex` 不允许对未锁定的锁进行解锁，直接导致 Runtime Panic。
*   **解决方案**:
    *   代码审查定位到 `internal/service/session.go:247`，删除多余的解锁代码。

---

## 3. 测试结果总结

### 3.1 小规模验证 (10 User)
*   **并发数**: 10
*   **成功率**: 100% (10/10)
*   **平均 RTF**: < 1.0 (实时)
*   **结论**: 逻辑修复验证通过，系统功能正常。

### 3.2 大规模压测 (500 User)
*   **并发数**: 500
*   **成功率**: 22.6% (113/500)
*   **失败原因**: 全是超时 (Timeout)。
    *   后端服务 **未崩溃**。
    *   Redis **未崩溃**。
    *   瓶颈在于单台 **Python Worker 的处理速度**。500 路并发音频流远超单核/单进程模型的处理能力，导致大量任务在 Redis 队列中排队直至超时。
*   **结论**: 后端架构已稳定，可承载高并发连接。要提高业务成功率，必须横向扩展 Python Worker 节点。

---

## 4. 后续优化建议

1.  **水平扩展 Worker**: 使用 Docker Swarm 或 K8s 部署多副本 `ASR_server/stream_worker`，基于 Redis 队列深度自动扩缩容。
2.  **限流保护**: 目前 Go 后端虽能抗住连接，但无法感知 Worker 的压力。建议在 Redis 队列长度过大时，Go 网关主动拒绝新连接 (503 Service Unavailable)，保护现有任务。
3.  **代码规范**: 引入 `golangci-lint` 并在 CI 流程中强制检查，避免 Double Unlock 这种低级错误进入主分支。
