# ASR FastAPI Microservice

> **Languages**: [English](README.md) | [简体中文](README.zh-CN.md)

> [!NOTE]
> This documentation is automatically translated from the [Chinese version](README.zh-CN.md). In case of discrepancies, the Chinese version prevails.

High-performance Speech Recognition REST API Service based on FunASR.

## ✨ Features

- 🚀 **Asynchronous Processing** - Redis Streams for high-concurrency tasks
- 📡 **RESTful API** - 9 complete API endpoints
- 🔥 **High Performance** - GPU acceleration, RTF < 0.05
- 📊 **Auto Management** - Automatic file cleanup, history maintenance
- 📝 **Complete Logging** - Layered logging + JSON Lines business logs
- 🧪 **Test Coverage** - Unit tests covering all interfaces

## 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│       Redis (Streams + Cache)           │
│       Port: 6379                        │
└─────▲───────▲───────────────────────────┘
      │       │
      ▼       ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ FastAPI  │ │UniWorker │ │UniWorker │
│  :8000   │ │  (1)     │ │  (N)     │
└──────────┘ └──────────┘ └──────────┘
```

## 🌐 Distributed & Dynamic Scaling

This project natively supports **Distributed Deployment** and **Dynamic Horizontal Scaling**, key advantages of the separated frontend-backend architecture.

### 1. Dynamic Scaling (Scale Up/Down)
You can instantly launch dozens of Workers to process massive tasks in parallel with simple configuration:

```bash
# Modify scripts/start_unified_worker.sh or via environment variable
export WORKER_COUNT=10  # Start 10 unified workers
./scripts/start_unified_worker.sh
```

### 2. Distributed Cluster
Workers do not need to run on the same machine as the API! You can run Workers on multiple GPU servers as long as they connect to the same Redis:

*   **Server A (API)**: Runs only `uvicorn`, responsible for quickly responding to user requests.
*   **Server B (GPU)**: Runs `scripts/start_unified_worker.sh`, connected to Redis on A.
*   **Server C (GPU)**: Runs `scripts/start_unified_worker.sh`, connected to Redis on A.

This architecture allows you to add compute nodes infinitely as business grows without modifying a single line of code.

## 📦 Project Structure

```
ASR_server/
├── src/
│   ├── asr/              # ASR Core Module
│   │   ├── config.py     # Config Management
│   │   └── recognizer.py # Recognition Engine
│   ├── api/              # FastAPI Service
│   │   ├── main.py       # App Entry
│   │   ├── routes.py     # API Routes
│   │   ├── models.py     # Data Models
│   │   └── dependencies.py
│   ├── utils/            # Utility Modules
│   │   ├── redis_client.py
│   │   ├── streams.py    # Redis Streams
│   │   ├── file_handler.py
│   │   └── logger.py
│   ├── worker/
│   │   └── unified_worker.py # Unified Consumer
│   └── storage/          # Data Storage
│       ├── recordings/   # Audio Files
│       └── logs/         # Log Files
├── scripts/              # Helper Scripts
│   ├── start_unified_worker.sh
│   └── clear_old_files.py
├── tests/                # Tests
│   └── test_api.py
└── STARTUP_GUIDE.md      # Startup Guide
```

## 🚀 Quick Start

### 1. Install Dependencies

This project uses `uv` for dependency management and is configured to use **PyTorch Stable (2.7.0+)** to support the latest NVIDIA cards (Blackwell/CUDA 12.8).

```bash
uv sync
```

### 2. Start Services (3 Terminals)

```bash
# Terminal 1: Start Redis (Recommend using service command for WSL compatibility)
sudo service redis-server start
# Or: sudo systemctl start redis-server

# Terminal 2: Start Workers
./scripts/start_unified_worker.sh

# Terminal 3: Start API Service
uvicorn src.api.main:app --reload --port 8000
```

### 3. Test

Visit http://localhost:8000/docs to view API documentation.

```bash
# Health Check
curl http://localhost:8000/api/v1/health

# Submit Task
curl -X POST http://localhost:8000/api/v1/asr/submit \
  -F "audio=@test.wav"

# Run Unit Tests
pytest tests/test_api.py -v
```

## 📖 Full Documentation

- [STARTUP_GUIDE.md](STARTUP_GUIDE.md) - Detailed startup and test guide
- [ARCHITECTURE_DESIGN.md](reports/ARCHITECTURE_DESIGN.md) - Complete architecture design

## 🔌 API Endpoints

| Endpoint | Method | Function |
|------|------|------|
| `/api/v1/asr/submit` | POST | Submit Transcription Task |
| `/api/v1/asr/result/{task_id}` | GET | Query Task Result |
| `/api/v1/health` | GET | Health Check |
| `/api/v1/asr/history` | GET | Get History |
| `/api/v1/asr/audio/{task_id}` | GET | Download Audio |
| `/api/v1/asr/queue/status` | GET | Queue Status |
| `/api/v1/asr/retry/{task_id}` | POST | Retry Task |
| `/api/v1/asr/task/{task_id}` | DELETE | Delete Task |
| `/api/v1/stats` | GET | System Stats |

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and modify as needed:

```bash
cp .env.example .env
```

Main configs:
- `REDIS_HOST` - Redis Host (Default: localhost)
- `ASR_USE_GPU` - Use GPU (Default: true)
- `ASR_BATCH_SIZE` - Batch Size (Default: 500)
- `MAX_RECORDINGS` - Max Recordings Retention (Default: 10)

## 🧪 Guide to Testing

This project includes a complete test suite covering unit tests, integration tests, and performance load tests.

### 1. Test Structure
```text
tests/
├── unit/           # Unit Tests (Recognizer, FileHandler, RedisClient)
├── integration/    # API Integration Tests
├── performance/    # Load Tests & Resource Monitor Scripts
├── resources/      # Test Audio Files
└── conftest.py     # Shared Fixtures
```

### 2. Run Regular Tests
Run all unit and integration tests:
```bash
./scripts/run_tests.sh
```

### 3. High Concurrency Load Test
Used to verify stability and performance under high load.

> [!IMPORTANT]
> **Read Before Run**: Load tests require full backend service support. Ensure:
> 1. Redis service started (`redis-server`)
> 2. Worker started (`./scripts/start_unified_worker.sh`)
> 3. API service running (`uvicorn src.api.main:app`)

**Prerequisite**: Ensure API service started (`uvicorn src.api.main:app`).

```bash
# Usage: ./scripts/run_load_test.sh [concurrency] [duration_seconds]
./scripts/run_load_test.sh 10 60
```

### 4. Real-time Visualization Dashboard
Access system built-in dashboard during load test to view real-time data:
- **URL**: [http://localhost:8000/dashboard](http://localhost:8000/dashboard)
- **Metrics**:
    - 📈 **Resources**: CPU Usage, Memory Usage real-time curves
    - 📉 **Queue**: Queue Depth, Active Workers
    - ⏱️ **Performance**: Latency, Throughput

## 📊 Monitoring

```bash
# View Stream Status
redis-cli XINFO STREAM asr_tasks

# View Pending
redis-cli XPENDING asr_tasks asr_workers

# View Logs
tail -f src/storage/logs/asr_api.log
tail -f src/storage/logs/asr_worker.log
```

## 🛠️ Tech Stack

- **Web Framework**: FastAPI 0.115+
- **ASGI Server**: Uvicorn 0.32+
- **Task Queue**: Redis Streams (Consumer Groups)
- **Message Store**: Redis 5.0+
- **ASR Engine**: FunASR (ModelScope)
- **Deep Learning**: PyTorch 2.0+

## 📄 License

MIT

---

**Version**: 1.0.0
**Last Updated**: 2025-12-11
