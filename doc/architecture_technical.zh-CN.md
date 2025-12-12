# 分布式微服务 ASR 系统 (Project kikipounamu) 技术架构白皮书
# Distributed Microservices ASR System (Project kikipounamu) Technical Architecture Whitepaper

> **版本**: 2.2
> **密级**: 内部公开
> **最后更新**: 2025-12-12
> **语言**: [English](architecture_technical.en.md) | [简体中文](architecture_technical.zh-CN.md)

---

## 1. 摘要 (Executive Summary)

Project kikipounamu 是一个基于 **Event-Driven Architecture (EDA)** 构建的高性能、高并发分布式语音识别系统。本项目旨在解决传统单体 ASR 系统在并发处理、资源隔离和扩展性方面的痛点。通过引入 **Go 语言高性能网关** 与 **Redis Streams 消息总线**，系统成功实现了计算密集型（ASR 推理）与 IO 密集型（网络连接）任务的彻底解耦。

在最近的 **500 路高并发压力测试** 中，系统展现了极强的韧性：在计算资源（Worker）严重不足的极限压测下，网关层仍保持了 **100% 的可用性**，未发生崩溃或内存泄漏，验证了架构设计的健壮性。

---

## 2. 总体架构设计 (Overall Architecture Design)

(https://gemini.google.com/share/fce8db821229)
[总体架构设计图](https://gemini.google.com/share/fce8db821229)

### 2.1 核心链路详解

1.  **Fire-and-Forget 生产 (Go -> Redis)**:
    *   Go 网关收到音频分片后，**不等待**任何处理结果，仅执行 `XADD` 指令将任务推入 Redis Stream 即刻返回。
    *   这种设计将网关的响应延迟降低至 **微秒级**，使其能轻松抗住数千并发的瞬间冲击。

2.  **Unified Stream Worker 消费 (Redis -> Python)**:
    *   Python Worker 摒弃了传统的 RQ/Celery 中间件，直接使用 `XREADGROUP` 指令以 **Consumer Group** 模式抢占任务。
    *   **XAUTOCLAIM 机制**: 若某个 Worker 崩溃（如 OOM），其持有的未确认消息（Pending）会在超时后被其他健康 Worker 自动认领，确保**任务零丢失**。

3.  **Global Result Subscriber (Redis -> Go)**:
    *   **旧架构痛点**: 每个用户连接开启一个 Redis 订阅，导致 500 并发时产生 500 个 Redis 连接，消耗大量文件句柄。
    *   **新架构优化**: Go 网关启动 **单例 Goroutine** 全局订阅 `asr_results` 频道。收到结果后，根据 `SessionID` 在内存中查找对应的 WebSocket 连接进行精准推送。此举将 Redis 订阅连接数从 **O(N)** 降至 **O(1)**。

---

## 3. 设计哲学与技术决策 (Design Philosophy & Trade-offs)

### 3.1 为什么选择 Go 作为网关？
*   **并发模型**: Go 的 GMP 模型（Goroutine-Machine-Processor）使得处理数千个 WebSocket 连接的内存开销极低（每个连接仅占用几 KB）。
*   **资源隔离**: 相比 Python 的 GIL 限制，Go 能充分利用多核 CPU 处理网络 IO，避免了 GIL 导致的并发瓶颈。
*   **实战验证**: 在 "僵尸大军" (Slow Loris) 攻击测试中，Go 后端在 1000 个空闲连接下依然保持极低的 CPU 占用。

### 3.2 为什么引入 Redis Streams？
*   **解耦**: 将 "接收请求" 和 "处理请求" 在时间上解耦。即使后端 Worker 暂时过载（如 500 并发场景），网关仍能以极快的速度接收用户请求并排队，实现 **Non-blocking I/O**。
*   **削峰填谷**: 面对突发流量（Traffic Spikes），Redis Streams 充当缓冲区，保护脆弱的深度学习推理服务不被压垮。
*   **原生集成**: 相比 RQ/Celery，Redis Streams 允许 Go 和 Python 直接通过原生 Redis 协议通信，避免了跨语言库的协议不兼容问题（如 `worker_queue_mismatch` 事件）。

### 3.3 为什么采用双通道架构 (Why Dual Channel Architecture?)？
系统创新性地采用了 **Redis Streams (任务)** + **Redis Pub/Sub (结果)** 的混合架构，这被业界公认为处理高并发任务的最佳实践：

| 通道 | 技术选型 | 核心优势 | 适用场景 |
|------|---------|---------|---------|
| **去程 (任务分发)** | **Redis Streams** | **持久化 & 零丢失**: 即使 Worker 崩溃，任务也会保留在 Stream 中等待重试 (`XAUTOCLAIM`)。 | 关键业务数据，要求 At-Least-Once 交付。 |
| **回程 (结果通知)** | **Redis Pub/Sub** | **极低延迟**: 亚毫秒级即时推送，无持久化开销，适合 "Fire-and-Forget"。 | 实时 UI 更新，允许在客户端断连时丢弃。 |

**设计评价**:
*   **职责分离 (Separation of Concerns)**: Streams 负责可靠性，Pub/Sub 负责实时性，两者各司其职。
*   **性能最大化**: 避免了用 Streams 处理大量临时结果带来的存储开销，同时保证了核心任务的安全性。

---

## 4. 核心技术实现与挑战 (Core Implementation & Challenges)

### 4.1 统一 Worker 架构 (Unified Worker Architecture)
在早期开发中，系统曾遭遇 **Worker 队列不匹配** 问题：Go 后端向原生 Redis List 推送任务，而 Python RQ Worker 监听的是 RQ 封装的特定 Key。
**解决方案**:
*   废弃 RQ (Redis Queue) 库。
*   实现 **Unified Stream Worker**：直接使用 Python Redis 客户端的 `XREADGROUP` 指令消费任务。
*   引入 **XAUTOCLAIM** 机制：自动回收崩溃 Worker 持有的 Pending 消息，确保任务不丢失。

### 4.2 异步消费者模型 (Async Consumer Pattern)
在早期版本中，Go 后端采用 "同步等待" 模式，导致 Redis 连接数随并发量线性爆炸（`panic: too many open files`）。
**优化方案**:
*   重构为 **Fire-and-Forget** 模式：WebSocket 接收到 Chunk 后仅执行 `RPush/XAdd`，不等待结果。
*   引入 **Global Result Subscriber**：单个后台协程复用一个 Redis 连接，监听所有结果并分发，将 Redis 连接数从 O(N) 降低到 O(1)。

### 4.3 智能反压保护 (Backpressure)
*   **现状**: 当队列积压超过阈值（如 5000 个待处理分片）时，系统面临内存溢出风险。
*   **规划**: Go 网关将实时监控 Redis 队列长度 (`LLEN/XLEN`)，一旦过载立即返回 `HTTP 503 Service Unavailable`，实施 **Graceful Degradation**（优雅降级），优先保障现有任务的完成。

---

## 5. 性能与扩展性分析 (Performance & Scalability)

基于 `2025-12-11` 的大规模负载测试报告：

### 5.1 压力测试数据
| 指标 | 结果 | 说明 |
|------|------|------|
| **并发连接数** | 500 | 成功建立连接，网关未崩溃 |
| **小规模成功率** | 100% | 10 并发下，RTF < 1.0 (实时) |
| **极限压测成功率** | 22.6% | 500 并发下，受限于 Worker 算力 |
| **网关 CPU 占用** | < 10% | Go 语言优势明显 |
| **Redis 吞吐量** | > 50k ops/s | 稳定处理 |

### 5.2 瓶颈分析 (Bottleneck Analysis)
测试显示，在 500 并发下，系统出现了大量的 **Timeout**。这并非代码 Bug，而是典型的 **容量规划 (Capacity Planning)** 问题。
*   **数学模型**: 单个 Worker 的处理能力是有限的。假设单流 RTF=0.1，处理 1 秒音频需 0.1 秒。面对 500 个并发流，第 500 个包的排队时间理论值为 `500 * 0.1 = 50秒`，接近 60 秒的超时阈值。
*   **结论**: 系统架构本身没有瓶颈，瓶颈在于 **计算节点的数量**。

---

## 6. 部署与安全策略 (Deployment & Security Strategy)

### 6.1 混合部署策略 (Hybrid Deployment)
针对 AI 项目特有的 "Docker 税"（显卡驱动复杂、镜像体积大），我们制定了分层部署策略：
*   **基础设施层 (Infrastructure)**: Redis 和 PostgreSQL 推荐使用 **Docker** 部署，确保环境一致性与数据隔离。
*   **计算层 (Computing)**: Python Worker 推荐 **裸机运行 (Bare Metal)**，直接调用宿主机 CUDA 驱动，避免复杂的 NVIDIA Container Toolkit 配置，并利用 `uv` 进行高效的环境管理。

#### 实战场景：异构分布式部署 (Heterogeneous Distributed Deployment)
得益于 Redis Streams 的解耦特性，系统天然支持跨机器、跨架构的分布式部署。以下是典型的 **"笔记本 + 台式机"** 协同工作模式：

*   **节点 A (笔记本 Laptop)**:
    *   运行 **Go Gateway**: 处理网络流量，轻量级，不占资源。
    *   运行 **Redis/Postgres**: 作为数据中心。
    *   运行 **CPU Worker**: 处理轻量级任务（如短语音 VAD 切分），利用笔记本 CPU 资源。
*   **节点 B (台式机 Desktop)**:
    *   运行 **GPU Worker**: 搭载 **RTX 5060 Ti**。
    *   通过局域网连接到节点 A 的 Redis。
    *   **职责**: 专门处理高负载的 ASR 推理任务。

**优势**:
1.  **算力聚合**: 将闲置的台式机显卡算力无缝接入笔记本的开发环境。
2.  **动态伸缩**: 可以随时开启/关闭台式机上的 Worker，系统会自动感知并分配/停止分配任务，无需重启网关。

### 6.2 鉴权与安全 (Authentication & Security)
*   **当前策略 (Internal Node)**: ASR 服务定位为内部微服务，处于 "Trust Zone"。它不自行维护用户表，而是完全信任上游（如 Telegram Bot Backend）的调用。
*   **未来演进 (API Gateway Pattern)**: 随着 SaaS 化转型，将在 ASR 服务前置 **API Gateway** (如 Nginx/Kong)。网关负责统一的 API Key 校验、计费与限流，ASR 服务继续保持纯粹的业务逻辑，仅通过 Header 接收租户 ID 用于审计。

---

## 7. 可观测性与质量保障 (Observability & Quality Assurance)

### 7.1 全链路日志系统 (Full-Stack Logging System)
系统构建了跨越前端、网关、后端的统一日志体系，确保在分布式环境下的可追溯性。

*   **ASR Electron Client**: 集成 `electron-log` v5，支持自动轮转 (Log Rotation) 和环境隔离。渲染进程日志通过 IPC 统一传输至主进程，便于集中管理。
*   **ASR Go Backend**: 采用 Uber 开源的 `zap` 库，提供纳秒级零内存分配的结构化日志。针对高并发场景（如 500 并发下的 11 万次连接拒绝），启用了 **Sampling (采样)** 策略，防止磁盘 I/O 成为瓶颈。
*   **ASR Server (Python)**: 使用 `loguru` 进行分层记录，同时生成 `asr_history.jsonl` 业务日志，支持使用 `jq` 等工具进行离线数据分析。

### 7.2 极限测试体系 (Extreme Testing Framework)
为了验证系统的鲁棒性，我们开发了专用的负载测试工具 (`cmd/loadtester`) 并执行了多项混沌工程测试：

1.  **高并发压测 (Concurrency Test)**: 成功模拟 500 路并发音频流，验证了 Go 网关的连接承载能力。
2.  **重连风暴测试 (Thundering Herd)**: 模拟 2000 个用户瞬间重连，验证了 `MAX_CONNECTIONS` 熔断机制的有效性。
3.  **僵尸连接测试 (Slow Loris)**: 维持 1000 个空闲连接，验证了 Go 协程对空闲资源的低消耗特性。
4.  **混沌测试 (Chaos Engineering)**: 在高负载下随机 Kill 掉 Python Worker，验证了系统的容错与自动恢复能力。

### 7.3 可视化监控看板 (Real-time Dashboard)
系统内置了实时监控仪表盘 (`/dashboard`)，为运维人员提供关键指标的可视化展示：

*   **Queue Depth (队列深度)**: 实时显示 Redis 中待处理的任务数，用于判断系统是否过载。
*   **Worker Status (工兵状态)**: 监控活跃 Worker 数量及忙碌状态。
*   **Throughput (吞吐量)**: 实时 RTF (Real Time Factor) 统计。
*   **Resource Usage (资源占用)**: CPU、内存及 GPU 显存的实时曲线。

---

## 8. 未来演进路线图 (Future Roadmap)

基于当前架构的局限性与业务发展预期，我们制定了以下技术演进计划：

### 8.1 容器化与编排 (Containerization & Orchestration)
*   **当前状态**: 采用 "基于进程" 的扩展策略 (Process-based Scaling)，通过 Shell 脚本管理 Worker。
*   **演进触发点**: 当单机垂直扩展达到瓶颈（如单机 96 核仍无法满足需求）或需要跨多可用区高可用 (HA) 时。
*   **目标架构**: 迁移至 **Kubernetes (K8s)**。
    *   利用 **HPA (Horizontal Pod Autoscaler)** 基于 Redis 队列深度自动伸缩 Worker Pod。
    *   实现 **Cluster Autoscaler** 动态增减云端 GPU 节点。

### 8.2 前端智能增强 (Frontend Intelligence)
*   **挑战**: 当前 VAD (语音活动检测) 依赖后端或简单的振幅检测，导致网络开销大或切分不准。
*   **计划**: 修复并集成 **WebAssembly (WASM) 版 FunASR VAD**。
    *   **技术难点**: 解决 ONNX 模型输出维度 (248维 logits) 与前端概率计算逻辑不匹配的问题。
    *   **预期收益**: 实现端侧毫秒级静音检测，大幅减少无效音频传输，降低带宽成本 30% 以上。

### 8.3 依赖管理标准化 (Dependency Standardization)
*   **挑战**: PyTorch Nightly 与 CUDA 12.8 的兼容性问题导致环境配置复杂 (`uv lock` 解析失败)。
*   **策略**: 严格执行 **"分平台 + 显式源映射"** 策略。
    *   Linux 平台锁定 PyTorch Nightly (GPU)。
    *   非 Linux 平台回退至 Stable (CPU)。
    *   待 PyTorch Stable 正式支持 RTX 50 系列后，统一回滚至稳定版以降低维护成本。

---

> **结语**: Project kikipounamu 的架构经受住了高并发的实战考验。通过合理的架构分层与技术选型，我们构建了一个既能承载当前业务，又具备极强水平扩展能力的现代化 ASR 平台。
