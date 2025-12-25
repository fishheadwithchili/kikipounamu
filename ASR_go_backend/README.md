# ASR Go Backend (High Concurrency Scheduling Service)

> **Languages**: [English](README.md) | [简体中文](README.zh-CN.md)

> [!NOTE]
> This project is designed for high-performance ASR (Automatic Speech Recognition) scheduling.

This is a high-performance ASR backend scheduling service developed in **Go**. It acts as a bridge between the frontend and the underlying Python ASR inference service, providing full-duplex WebSocket streaming, concurrent task scheduling, and data persistence.

## 🌟 Core Features

*   **⚡ High Concurrency Architecture**: Based on the **Async Producer-Consumer Model**, the Go gateway handles connection maintenance, while Python Workers handle computation, decoupled via Redis.
*   **📡 Full-duplex Communication**: **WebSocket**-based full-duplex communication supporting streaming audio upload and result pushing.
*   **🚀 Extreme Performance**: The Go backend single node easily supports **500+ concurrent** connections, supporting horizontal scaling of Workers to improve throughput.
*   **🗄️ Data Persistence**: Integrated **PostgreSQL** to fully record session history, audio chunk details, and recognition results.
*   **🛡️ Robust Design**:
    *   Connection pool management to prevent resource exhaustion.
    *   Graceful shutdown and automatic error recovery.
    *   Complete concurrency safety mechanisms (non-blocking).

## 🏗️ Architecture

This project adopts the **Async Producer-Consumer Model**, achieving complete decoupling between the gateway layer and the computing layer.

*   **Gateway (Go Backend)**:
    *   **Role**: High-performance gateway responsible for connection maintenance, protocol conversion, and data forwarding.
    *   **Mechanism**: Receive audio slice -> `XADD` to Redis Stream -> Return immediately. **Does not block** waiting for inference results.
    *   **Performance**: In load tests, CPU usage remains extremely stable when maintaining 500 concurrent connections on a single node.
*   **Message Broker (Redis)**:
    *   **Role**: Infinite capacity Buffer and message bus.
    *   **Mechanism**: Uses Pub/Sub to achieve dynamic precise pushing of results to specific WebSocket sessions.
*   **Worker (Python ASR)**:
    *   **Role**: Pure computing node (Stateless).
    *   **Mechanism**: Consumer Group processing from Redis Stream -> Inference -> Publish result.
    *   **Scalability**: Supports seamless **Horizontal Scaling**. If 500 concurrent streams cause queuing, simply start more Worker containers to linearly improve processing capability.

## 🛠️ Tech Stack

*   **Language**: Go 1.24.5
*   **Web Framework**: Gin
*   **WebSocket**: Gorilla WebSocket
*   **Database**: PostgreSQL 14.20 (pgx driver)
*   **Configuration**: Environment Variables

## 🚀 Deployment & Startup

### 1. Prerequisites

Ensure the server has installed:
*   **Go** (1.24.5)
*   **PostgreSQL** (14.20)
*   **FFmpeg** (Included in PATH)

### 2. Database Configuration

Create a database named `root` (or other name) and ensure user permissions.

```bash
# Example: Create database (command line)
createdb -U postgres root
```

*Note: The system will automatically create the required `asr_sessions` and `asr_chunks` tables.*

### 3. Install Dependencies

```bash
go mod tidy
```

### 4. Configuration (Environment Variables)

You can configure the service via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `8080` | Service listening port |
| `FUNASR_ADDR` | `localhost:8000` | Underlying Python ASR_server address |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `5432` | Database port |
| `DB_USER` | `root` | Database username |
| `DB_PASSWORD` | `123456` | Database password |
| `DB_NAME` | `root` | Database name |

### 5. Start Service

> **Windows Users**: Please use the `scripts/start_backend.ps1` script described in the [Windows 11 Deployment Guide](../doc/WIN11_DEPLOYMENT_GUIDE.en.md).

```bash
# 1. Start PostgreSQL
sudo service postgresql start

# 2. Ensure database exists
sudo -u postgres createdb root

# 3. Set env vars and start service
export DB_USER=root
export DB_PASSWORD=123456
export DB_NAME=root

go run cmd/server/main.go
```

Or build and run:

```bash
go build -o asr-backend cmd/server/main.go
./asr-backend
```

## 🚀 Performance & Scalability

Based on the 2025-12-11 large-scale **Load Test Report** (see `reports/`):

*   **High Concurrency**: Passed stress tests under **500 concurrent channels**. The Go backend service remained 100% stable with no crashes or memory leaks.
*   **Bottleneck Analysis**:
    *   System throughput bottleneck lies in **Python Worker computing power**.
    *   Go backend acts only as a traffic entry point with extremely low resource consumption.
    *   When concurrency > Worker processing capability, tasks queue in Redis, RTF increases temporarily, but the service **does not refuse connections** and does not crash.
*   **Stability Enhancements**:
    *   Fixed Redis "Too Many Open Files" issue (via connection pool optimization).
    *   Fixed concurrent race condition deadlocks.
    *   Verified graceful degradation capability under extreme pressure.

## 🔌 API Documentation

### 1. WebSocket (Streaming Recognition)

*   **URL**: `ws://<server_ip>:8080/ws/asr`
*   **Protocol**:
    *   **Client Sends**:
        *   `{"action": "start", "session_id": "uuid"}`: Start session
        *   `{"action": "chunk", "session_id": "...", "chunk_index": 0, "audio_data": "base64..."}`: Send audio chunk (WebM/WAV)
        *   `{"action": "finish", "session_id": "..."}`: End session
    *   **Server Returns**:
        *   `{"type": "ack", "status": "session_started", ...}`
        *   `{"type": "chunk_result", "chunk_index": 0, "text": "Result text"}`
        *   `{"type": "final_result", "text": "Complete result text"}`

### 2. REST API (Management & Query)

*   `GET /api/v1/health`: Health check (Includes DB, Redis, AI Service status)
*   `GET /api/v1/history?limit=50`: Get recent history sessions
*   `GET /api/v1/session/:id`: Get specific session details
*   `DELETE /api/v1/session/:id`: Delete session
*   `GET /api/v1/stats`: Get service stats (Proxy to AI Service)
*   `GET /api/v1/asr/queue/status`: Get queue status (Proxy to AI Service)

## 📂 Directory Structure

```
.
├── cmd/
│   └── server/         # Entry point
├── internal/
│   ├── config/         # Configuration
│   ├── db/             # Database operations (PostgreSQL)
│   ├── handler/        # HTTP and WebSocket handlers
│   ├── service/        # Core business logic (Session, ASR scheduling)
│   └── model/          # Data models
└── go.mod
```

## 🧪 Load Testing System

This project includes a high-performance load testing tool built-in to simulate high concurrent WebSocket requests and test system stability.
**New Feature**: The test tool integrates a smart **Spin Loop Retry Mechanism**, which automatically waits and retries when high concurrent connections are temporarily refused, simulating real client behavior and avoiding invalid flood attacks.

### 1. Build/Run Test Tool

Tool located in `cmd/loadtester/`.

```bash
# Run test
go run cmd/loadtester/main.go [options]
```

### 2. Common Arguments

*   `-c <int>`: Concurrent connections (Default `500`, i.e., high concurrency stress test mode)
*   `-d <duration>`: Test duration (e.g., `30s`, `5m`, `30m`, `1h`)
*   `-mode <string>`: Audio length mode
    *   `short`: Use default short audio (Recommended for high concurrency)
    *   `medium`: Auto-generate and use 30 min audio (Function/Stability test)
    *   `long`: Auto-generate and use 1 hour audio (Extreme stability test)
*   `-server <addr>`: Target backend address (Default `localhost:8080`)

### 3. Usage Examples

**High Concurrency Short Audio Stress Test (500 Concurrency):**
```bash
go run cmd/loadtester/main.go -mode short -c 500 -d 1m
```

**Long Audio Stability Test (Single Connection 1 Hour):**
```bash
go run cmd/loadtester/main.go -mode long -c 1 -d 1h
```

**A `loadtest_report.md` will be generated after the test.**

> [!NOTE]
> When running long audio tests, the tool uses ffmpeg to generate temporary large files and cleans them up after testing. Ensure ffmpeg is installed.
