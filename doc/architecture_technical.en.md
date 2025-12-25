# Enterprise-grade Distributed Microservices Streaming Segmented Batch ASR System (Project kikipounamu) Technical Architecture Whitepaper

> **Version**: 2.2
> **Classification**: Internal Public
> **Last Updated**: 2025-12-12
> **Language**: [English](architecture_technical.en.md) | [简体中文](architecture_technical.zh-CN.md)

---

## 1. Executive Summary

Project kikipounamu is a high-performance, high-concurrency **Enterprise-grade Distributed Microservices Streaming Segmented Batch ASR System** built on **Event-Driven Architecture (EDA)**. This project aims to address the pain points of traditional monolithic ASR systems regarding concurrent processing, resource isolation, and scalability. By introducing a **Go language high-performance gateway** and **Redis Streams message bus**, the system successfully decouples compute-intensive (ASR inference) tasks from IO-intensive (network connection) tasks.

> **ASR (Automatic Speech Recognition)** refers to the technology that converts spoken language into text. In short, this project is designed for speech-to-text conversion.

In recent **500-concurrency load tests**, the system demonstrated strong resilience: even under extreme stress with insufficient compute resources (Workers), the gateway layer maintained **100% availability** without crashing or memory leaks, validating the robustness of the architectural design.

---

## 2. Overall Architecture Design

(https://gemini.google.com/share/fce8db821229)
[Architecture Diagram](https://gemini.google.com/share/fce8db821229)

### 2.1 Core Flow

1.  **Fire-and-Forget Production (Go -> Redis)**:
    *   Upon receiving an audio chunk, the Go gateway **does not wait** for any processing result. It simply executes the `XADD` command to push the task into the Redis Stream and returns immediately.
    *   This design reduces gateway response latency to the **microsecond level**, allowing it to easily withstand sudden bursts of thousands of concurrent requests.

2.  **Unified Stream Worker Consumption (Redis -> Python)**:
    *   The Python Worker abandons traditional RQ/Celery middleware and directly uses the `XREADGROUP` command to claim tasks in **Consumer Group** mode.
    *   **XAUTOCLAIM Mechanism**: If a Worker crashes (e.g., OOM), its held unacknowledged messages (Pending) will be automatically claimed by other healthy Workers after a timeout, ensuring **zero task loss**.

3.  **Global Result Subscriber (Redis -> Go)**:
    *   **Legacy Pain Point**: Each user connection opening a Redis subscription caused 500 Redis connections for 500 concurrent users, consuming massive file handles.
    *   **New Architecture Optimization**: The Go gateway starts a **singleton Goroutine** to globally subscribe to the `asr_results` channel. Upon receiving a result, it looks up the corresponding WebSocket connection in memory based on `SessionID` for precise push. This reduces Redis subscription connections from **O(N)** to **O(1)**.

---

## 3. Design Philosophy & Trade-offs

### 3.1 Why Go for the Gateway?
*   **Concurrency Model**: Go's GMP model (Goroutine-Machine-Processor) keeps memory overhead for handling thousands of WebSocket connections extremely low (a few KB per connection).
*   **Resource Isolation**: Unlike Python's GIL limitations, Go fully utilizes multi-core CPUs for network IO, avoiding GIL-induced concurrency bottlenecks.
*   **Proven Reliability**: In "Slow Loris" attack tests, the Go backend maintained extremely low CPU usage even with 1000 idle connections.

### 3.2 Why Redis Streams?
*   **Decoupling**: Decouples "receiving requests" from "processing requests" in time. Even if backend Workers are temporarily overloaded (e.g., 500 concurrency scenario), the gateway can still queue user requests at high speed, achieving **Non-blocking I/O**.
*   **Peak Shaving**: Acts as a buffer during traffic spikes, protecting fragile deep learning inference services from being overwhelmed.
*   **Native Integration**: Compared to RQ/Celery, Redis Streams allows Go and Python to communicate directly via native Redis protocols, avoiding cross-language library incompatibility issues (e.g., `worker_queue_mismatch` events).

### 3.3 Why Dual Channel Architecture?
The system innovatively uses a hybrid architecture of **Redis Streams (Task)** + **Redis Pub/Sub (Result)**, recognized as a best practice for high-concurrency tasks:

| Channel | Technology | Core Advantage | Use Case |
|---------|------------|----------------|----------|
| **Outbound (Task Dispatch)** | **Redis Streams** | **Persistence & Zero Loss**: Tasks remain in Stream waiting for retry (`XAUTOCLAIM`) even if Workers crash. | Critical business data requiring At-Least-Once delivery. |
| **Inbound (Result Notification)** | **Redis Pub/Sub** | **Ultra-low Latency**: Sub-millisecond instant push, no persistence overhead, suitable for "Fire-and-Forget". | UI displays update, acceptable to drop if client disconnects. |

**Design Evaluation**:
*   **Separation of Concerns**: Streams for reliability, Pub/Sub for low-latency response.
*   **Maximized Performance**: Avoids storage overhead of processing massive temporary results with Streams, while ensuring safety of core tasks.

---

## 4. Core Implementation & Challenges

### 4.1 Unified Worker Architecture
In early development, the system faced **Worker Queue Mismatch** issues: Go backend pushed tasks to a native Redis List, while Python RQ Worker listened to a specific Key wrapped by RQ.
**Solution**:
*   Deprecated RQ (Redis Queue) library.
*   Implemented **Unified Stream Worker**: Directly consumes tasks using `XREADGROUP` command via Python Redis client.
*   Introduced **XAUTOCLAIM**: Automatically recycles Pending messages from crashed Workers to ensure no task loss.

### 4.2 Async Consumer Pattern
In early versions, the Go backend used a "Synchronous Wait" pattern, causing Redis connections to explode linearly with concurrency (`panic: too many open files`).
**Optimization**:
*   Refactored to **Fire-and-Forget**: WebSocket Chunk execution only performs `RPush/XAdd` and does not wait for results.
*   Introduced **Global Result Subscriber**: A single background coroutine reuses one Redis connection to listen to all results and dispatch them, reducing Redis connections from O(N) to O(1).

### 4.3 Intelligent Backpressure
*   **Current Status**: When the queue backlog exceeds a threshold (e.g., 5000 pending chunks), the system faces OOM risks.
*   **Plan**: The Go gateway will monitor Redis queue length (`LLEN/XLEN`) continuously. Once overloaded, it will immediately return `HTTP 503 Service Unavailable`, implementing **Graceful Degradation** to prioritize completing existing tasks.

---

## 5. Performance & Scalability Analysis

Based on the `2025-12-11` large-scale load test report:

### 5.1 Stress Test Data
| Metric | Result | Note |
|--------|--------|------|
| **Connections** | 500 | Successfully established, Gateway did not crash |
| **Small-scale Success Rate** | 100% | At 10 concurrency, RTF < 1.0 (High-speed processing) |
| **Extreme Test Success Rate** | 22.6% | At 500 concurrency, limited by Worker compute power |
| **Gateway CPU Usage** | < 10% | Go language advantage is significant |
| **Redis Throughput** | > 50k ops/s | Stable processing |

### 5.2 Bottleneck Analysis
Testing showed massive **Timeouts** at 500 concurrency. This is not a code bug but a typical **Capacity Planning** issue.
*   **Mathematical Model**: Single Worker processing power is finite. Assuming single stream RTF=0.1, processing 1 second of audio takes 0.1s. With 500 concurrent streams, the wait time for the 500th packet is theoretically `500 * 0.1 = 50s`, approaching the 60s timeout threshold. Since this project utilizes **Streaming Segmented Batch Processing**, this queuing effect is inherent under extreme concurrency.
*   **Conclusion**: There is no bottleneck in the system architecture; the bottleneck lies in the **quantity of computing nodes**. This project is positioned as "Streaming Segmented Batch Processing" rather than "Instantaneous Synchronous Transcription," a trade-off that preserves system throughput under high pressure.

---

## 6. Deployment & Security Strategy

### 6.1 Hybrid Deployment
Addressing the "Docker Tax" (complex GPU drivers, large image sizes) for AI projects, I defined a tiered deployment strategy:
*   **Infrastructure**: Redis and PostgreSQL recommended running in **Docker** for consistency and isolation.
*   **Computing**: Python Worker recommended running on **Bare Metal**, directly calling host CUDA drivers to avoid complex NVIDIA Container Toolkit configuration, utilizing `uv` for efficient environment management.

#### Scenario: Heterogeneous Distributed Deployment
Leveraging Redis Streams decoupling, the system naturally supports cross-machine, cross-architecture distributed deployment. Typical **"Laptop + Desktop"** synergy:

*   **Node A (Laptop)**:
    *   Runs **Go Gateway**: Handles network traffic, lightweight.
    *   Runs **Redis/PostgreSQL**: Data center.
    *   Runs **CPU Worker**: Handles lightweight tasks.
*   **Node B (Desktop)**:
    *   Runs **GPU Worker**: Equipped with **RTX 5060 Ti**.
    *   Connects to Node A's Redis via LAN.
    *   **Role**: Dedicated to high-load ASR inference tasks.

**Advantages**:
1.  **Compute Aggregation**: Seamlessly integrates idle desktop GPU power into the laptop dev environment.
2.  **Dynamic Scaling**: Workers on the desktop can be started/stopped at any time; the system automatically detects and distributes tasks without restarting the gateway.

### 6.2 Authentication & Security
*   **Current Policy (Internal Node)**: ASR service is positioned as an internal microservice within the "Trust Zone". It trusts upstream calls (e.g., Telegram Bot Backend) and does not maintain a user table.
*   **Future Evolution (API Gateway Pattern)**: For SaaS transformation, an **API Gateway** (e.g., Nginx/Kong) will be placed in front. The gateway handles API Key validation, billing, and rate limiting, while the ASR service remains pure business logic, receiving tenant IDs via Headers for auditing.

---

## 7. Observability & Quality Assurance

### 7.1 Full-Stack Logging System
Built a unified logging system across Frontend, Gateway, and Backend for distributed traceability.

*   **ASR Electron Client**: Integrates `electron-log` v5, supports Log Rotation and environment isolation. Renderer logs transmitted via IPC to Main process for centralized management.
*   **ASR Go Backend**: Uses Uber's `zap` library for nanosecond-level zero-allocation structured logging. Enabled **Sampling** for high concurrency (e.g., 110k connection refusals under 500 concurrency) to prevent disk I/O bottlenecks.
*   **ASR Server (Python)**: Uses `loguru` for tiered logging and generates `asr_history.jsonl` business logs, supporting offline analysis with tools like `jq`.

### 7.2 Extreme Testing Framework
Developed dedicated load testing tools (`cmd/loadtester`) and executed Chaos Engineering tests:

1.  **Concurrency Test**: Simulated 500 concurrent audio streams, validating Go gateway connection capacity.
2.  **Thundering Herd Test**: Simulated 2000 users reconnecting instantly, validating `MAX_CONNECTIONS` circuit breaker.
3.  **Slow Loris Test**: Maintained 1000 idle connections, validating Go coroutine efficiency.
4.  **Chaos Engineering**: Randomly killed Python Workers under load, validating fault tolerance and auto-recovery.

### 7.3 Dashboard
Built-in monitoring dashboard (`/dashboard`) provides key metrics:

*   **Queue Depth**: Dynamic Redis task count to judge system overload.
*   **Worker Status**: Monitor active/busy Worker count.
*   **Throughput**: RTF (Real Time Factor) stats.
*   **Resource Usage**: CPU, Memory, and GPU VRAM dynamic curves.

---

## 8. Future Roadmap

Based on current limitations and business expectations:

### 8.1 Containerization & Orchestration
*   **Current**: "Process-based Scaling" via Shell scripts.
*   **Trigger**: When single-machine vertical scaling hits limits (e.g., 96 cores insufficient) or multi-AZ HA is needed.
*   **Goal**: Migrate to **Kubernetes (K8s)**.
    *   Use **HPA (Horizontal Pod Autoscaler)** scaling based on Redis queue depth.
    *   Implement **Cluster Autoscaler** for dynamic cloud GPU nodes.

### 8.2 Frontend Intelligence



### 8.3 Dependency Standardization
*   **Challenge**: PyTorch Nightly vs CUDA 12.8 compatibility (`uv lock` failures).
*   **Strategy**: Strict **"Platform + Explicit Mapping"**.
    *   Linux: Lock to PyTorch Nightly (GPU).
    *   Non-Linux: Fallback to Stable (CPU).
    *   Unified rollback to Stable once PyTorch officially supports RTX 50 series.

---

> **Conclusion**: Project kikipounamu's architecture has withstood high-concurrency combat tests. Through rational layering and technology selection, I have built a modern ASR platform capable of supporting current business while possessing strong horizontal scalability.
