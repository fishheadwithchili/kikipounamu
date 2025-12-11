# 复盘：Worker 队列协议不匹配导致任务卡顿问题

**日期**: 2025-12-12  
**状态**: 已解决  
**组件**: ASR Server (Python), ASR Go Backend

## 1. 问题描述

系统启动后，虽然所有服务状态看似正常：
- Go Backend (ASR 分发器) 运行中。
- Worker 进程 (通过 `./scripts/start_workers.sh` 启动) 运行中。
- 前端音频任务却永久停留在 "Processing" (处理中) 状态，无法完成。

## 2. 排查路径

### 初始症状
- Worker 日志显示启动成功: `Worker worker-1: started...`
- Go Backend 日志显示 Redis 连接成功。
- 但是，Worker 窗口中没有任何*任务执行*的日志。

### 诊断步骤
1.  **检查 RQ (Redis Queue) 状态**:
    ```bash
    rq info --url redis://localhost:6379/0
    ```
    输出: `0 queues, 0 jobs total`。Worker 处于空闲 (`idle`) 状态。

2.  **检查 Redis 原生 Key**:
    既然 RQ 为空，我们检查数据是否进入了 Redis 的其他位置。
    ```bash
    redis-cli KEYS "*"
    redis-cli LLEN asr_chunk_queue
    ```
    输出: `asr_chunk_queue` 中有积压的任务项 (长度 > 0)。

3.  **代码分析**:
    - **Go Backend**: 设置为使用原生 `RPUSH` 推送到 `asr_chunk_queue`。
      ```go
      redisCli.RPush(ctx, "asr_chunk_queue", taskJSON)
      ```
    - **start_workers.sh**: 启动的是标准 `rq` worker，监听 `rq:queue:asr-queue`。
    - **stream_worker.py**: 设置为使用 `BLPOP` 监听 `asr_chunk_queue`。

## 3. 根本原因：两种“方言”的 Worker

系统遗留了两套并行且互不兼容的 Worker 实现：

| 特性 | **RQ Worker** (运行中) | **Stream Worker** (未运行) |
| :--- | :--- | :--- |
| **启动脚本** | `./scripts/start_workers.sh` | `python src/worker/stream_worker.py` |
| **协议/库** | Python `RQ` 库 | 原生 Redis (`BLPOP`) |
| **监听队列** | `rq:queue:asr-queue` | `asr_chunk_queue` |
| **任务来源** | 期待 Python `rq.enqueue` | Go Backend `RPUSH` |

形象地说，Go Backend 是在往 **A邮箱** (`asr_chunk_queue`) 投递信件，而你启动的工人却一直在死守 **B邮箱** (`rq:queue:asr-queue`)。

## 4. 解决方案

1.  **停止 RQ Workers**: 它们与当前的 Go Backend 实现不兼容。
2.  **启动 Stream Worker**: 手动启动正确的 Worker：
    ```bash
    python3 src/worker/stream_worker.py
    ```
    启动后瞬间消化了 `asr_chunk_queue` 中的积压任务。
3.  **标准化**: 创建了新脚本 `./scripts/start_stream_worker.sh`，确保未来启动正确的 Worker。

## 5. 经验总结 (Key Learnings)

1.  **队列不匹配是静默的**: 即使监听了错误的队列，Worker 也会报告“健康”和“空闲”。必须仔细验证 Redis 中的*队列名称*是否与代码中*消费的队列名*一致。
2.  **混合架构的风险**: 当混合使用不同语言（Go 生产 + Python 消费）时，像 `RQ` 或 `Celery` 这样的标准库通常有特定的协议封装，生产者语言必须完美复刻其协议才能通信。在这种跨语言 IPC 场景下，使用原生的 Redis 原语（List/Stream）通常更安全、更简单。
