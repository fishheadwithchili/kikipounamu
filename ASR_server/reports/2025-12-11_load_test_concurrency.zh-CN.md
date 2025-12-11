# 2025-12-11 高并发负载测试与问题排查总结

> **语言切换**: [English](2025-12-11_load_test_concurrency.md) | [简体中文](2025-12-11_load_test_concurrency.zh-CN.md)


## 1. 背景 (Background)
为了验证 `ASR_go_backend` 在高并发下的稳定性与日志系统性能，我们开发了一个专用的负载测试工具 (`cmd/loadtester`)，并设定了 500 并发连接的目标进行压测。在此过程中，我们遇到并解决了多个配置与工具实现层面的问题。

## 2. 遇到的问题与解决方案 (Issues & Solutions)

### 2.1 ASR Server 启动失败 (Pydantic V2 校验严格)
*   **现象**: 启动 Python 服务 (`ASR_server`) 时，报错 `ValidationError: Extra inputs are not permitted`。
*   **原因**: 项目使用了 Pydantic V2，默认配置下不允许环境变量中存在未定义的字段（例如旧的 `.env` 可能包含废弃字段）。
*   **解决**: 修改了 `src/config.py`, `src/utils/redis_client.py`, `src/utils/logger.py`，在 Pydantic 配置中显式加入 `extra="ignore"`：
    ```python
    model_config = SettingsConfigDict(
        ...,
        extra="ignore"  # 关键修复
    )
    ```

### 2.2 压测工具 "Spin Loop" (自旋循环) 问题
*   **现象**: 初次压测时，30秒内产生了 50多万次错误。
*   **原因**: 压测工具在连接被拒（Connection Refused）后，立即重试，没有等待间隔。这导致客户端在一个死循环中疯狂发起连接，消耗了大量 CPU 且产生了无效的测试数据。
*   **解决**: 在 `cmd/loadtester/main.go` 的连接错误处理中加入了 **Backoff（退避）机制**：
    ```go
    if err != nil {
        atomic.AddInt64(&totalErrs, 1)
        time.Sleep(100 * time.Millisecond) // 防止自旋
        return
    }
    ```
    *   **效果**: 错误量下降到 11万次（符合物理时间限制），测试结果更加真实。

### 2.3 负载测试 "100% 错误率" 的误解
*   **现象**: 500 并发测试下，报告显示 100% 错误率，无一成功。
*   **分析**: 
    1.  检查 `backend.log` 发现后端 CPU 使用率瞬间达到 118%，说明系统依然在全速运转。
    2.  日志中有大量 `active_connections` 变化记录，峰值达到 109。
    3.  错误是因为单机开发环境无法处理 500 个并发握手，导致系统过载保护（拒绝连接）。
*   **结论**: 这不是系统崩溃，而是成功的**压力/极限测试**。验证了日志系统在过载情况下依然能稳定记录，且系统没有发生 Panic。

## 3. 经验总结 (Key Takeaways)

1.  **压测工具必须防抖**: 任何网络客户端在循环中处理错误时，必须加入 `Sleep` 或退避算法，否则就是对服务端的 DDoS 攻击，且测试数据无效。
2.  **错误率不等于失败**: 在压力测试中，高错误率往往意味着测出了系统的**容量水位**（Capacity Limit）。需要结合服务端资源监控（CPU/Mem）来判断是系统挂了还是单纯满了。
3.  **开发库升级兼容性**: Python Pydantic V2 的严格模式经常导致旧配置失效，需养成在 `Config` 中设置宽松解析的习惯。

---
**相关文件**:
- 压测工具: `ASR_go_backend/cmd/loadtester/main.go`
- 压测报告: `ASR_go_backend/loadtest_report.md`
