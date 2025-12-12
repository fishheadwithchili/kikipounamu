# ASR Load Test Report

> **Languages**: [English](2025-12-11_load_test_failure.md) | [简体中文](2025-12-11_load_test_failure.zh-CN.md)

**Date:** 2025-12-11T21:55:00+13:00
**Mode:** Short (High Concurrency Short Audio Mode)
**Concurrency:** 500
**Duration:** 30s
**Audio Source:** /home/tiger/Projects/kikipounamu/ASR_server/tests/resources/test_audio_short.wav

## Test Result Overview
- **Total Attempted Sessions:** ~111,510
- **Success Sessions:** 0
- **Errors:** ~111,510 (100% Error Rate)
- **Peak Active Connections:** 109 (Confirmed from backend logs)

## Dashboard Monitoring Data (At 30s)
- **Backend CPU Usage:** 118.59% (Multi-core full load, indicating system is struggling to process requests)
- **Backend Memory Usage:** 27.81 MB

## Core Observations & Analysis
1.  **System Reached Limit**: Backend CPU instantaneously spiked to >100%, indicating the **Logging System** and **Network Protocol Stack** were working normally under high concurrency and recorded a large amount of data.
2.  **Connection Refused & Disconnected**: Although the test client reported 100% errors, backend logs show the system actually **accepted and processed some connections** (peak about 109), but due to concurrency far exceeding single node capacity (500 concurrency), many connections were forcibly closed by the system or timed out by the client.
3.  **Log System Verified**: Backend logs (`backend.log`) successfully recorded high-frequency connection establishment and disconnection events (`❌ WebSocket Connection Disconnected {"active_connections": ...}`), proving Zap logging library remains stable under high load without blocking or crashing.
4.  **Spin Loop Mitigation**: The test tool added a retry wait mechanism, reducing error volume from 500k to 110k, avoiding valid flood attacks.

## Improvement Suggestions
1.  **Architecture Optimization**: 500 concurrency is stressful for a single node Python/Go hybrid architecture. Suggest fronting with Nginx Load Balance or adding backend nodes.
2.  **System Tuning**: Suggest increasing `ulimit -n` and TCP connection queue parameters (`net.core.somaxconn`) in production environment.
3.  **Application Layer Rate Limiting**: Add queuing or rate limiting mechanisms in Go backend to avoid service unavailability caused by too many simultaneous connections.

# Deep Retrospective & Architecture Evolution (2025-12-11 Update)

> Based on deep discussion with User, detailed analysis of the root cause of this load test failure was conducted, and the future architecture evolution direction was determined.

## 1. Root Cause Deep Analysis

### 1.1 Why 100% Error?
**Surface Cause**: Test report shows `Connection Refused` or 503 Service Unavailable.
**Root Cause**: **Man-made Connection Wall (Hardcoded Limit)**.
- `MaxConnections = 100` in code.
- Test concurrency 500.
- Result: 100 people enter, 400 refused. Refused ones (clients) retry frantically, causing 110k refusal records in 30 seconds.

### 1.2 Why CPU Spiked to 118%?
**Misconception**: Thought Python was struggling to recognize audio.
**Truth**: **Go Backend was struggling to write logs**.
- 110k requests refused means about 3700 `logger.Warn` per second.
- Entire CPU was busy with: TCP 3-way handshake -> Check counter -> Format Zap log -> Write to disk -> Close connection.
- Real business logic (audio recognition) barely ran.

### 1.3 Architecture Bottleneck: Blocking WorkerPool
Current Go code uses a `WorkerPool` (size=4) to process requests.
- **Flow**: Client -> Go Worker -> HTTP POST -> Python Server (Waiting...) -> Go Worker Released.
- **Problem**: Go Worker became Python's "hostage". Python processes slowly, Go Worker has to wait. After Workers are exhausted, main thread cannot process new requests.
- **Analogy**: Bank hall (Go) has only 4 windows (Worker). Clerk calls HQ (Python) to verify info, call takes 10 minutes. During this, the clerk can do nothing, customers behind can only stare.

---

## 2. Architecture Evolution Decision

### 2.1 Core Decision: De-Workerization (Go -> Redis)
**User Question**: Since Python processing capability is limited (only 2 Workers), what's the use of Go being fast?
**Answer**:
- **"Bank Hall" Theory**: Go's role is to let users **come in and sit down** (queue), not shut them out.
- **New Architecture**:
  - **Go**: No longer does Worker, only acts as **Gateway**. Receive request -> Throw into Redis Queue -> Return queue number. Time: 0.1ms.
  - **Redis**: Acts as infinite capacity reservoir.
  - **Python**: Take tasks from Redis at its own pace.
- **Benefit**: Go is no longer dragged down by Python's speed, can easily withstand 1000+ concurrent connections, main consumption is only keeping WebSocket heartbeats.

### 2.2 Short-term Stopgap (Action Items)
Before Redis architecture refactoring, to let existing system pass test:
1.  **Increase Parameters**: `MaxConnections` from 100 -> 1000.
2.  **Expand Buffer**: `WorkerPool` from 4 -> 200 (Utilize Go goroutine cheap feature, exchange quantity for time).
3.  **Log Downgrade**: Enable Zap Sampling to prevent disk I/O from becoming bottleneck.

---

## 3. Learning & Thinking
- **Long-term Consideration**: Don't artificially limit concurrency at gateway layer just because backend processing is slow. Gateway's duty is **Max Throughput** and **Peak Shaving**.
- **About Logs**: In high concurrency scenarios, logging itself can become the biggest performance killer. Sampling or dynamic downgrade mechanisms must be in place.
