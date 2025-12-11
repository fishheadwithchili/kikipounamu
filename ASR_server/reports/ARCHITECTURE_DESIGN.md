# ASR FastAPI Microservice Architecture Design

> **Languages**: [English](ARCHITECTURE_DESIGN.md) | [简体中文](ARCHITECTURE_DESIGN.zh-CN.md)

> [!NOTE]
> This documentation is automatically translated from the [Chinese version](ARCHITECTURE_DESIGN.zh-CN.md). In case of discrepancies, the Chinese version prevails.

> Final Version - 2025-12-02
>
> This document records the final design for the evolution of the ASR project from a monolithic script to a microservice architecture.

---

## 1. Background and Objectives

### 1.1 Project Positioning
- **Core Function**: Offline speech recognition service based on FunASR
- **Ultimate Goal**: One of the backend microservices for a Telegram Bot
- **Expansion Plan**: Dozens of tools/workflows in the future (TTS, OCR, Translation, etc.)

### 1.2 Key Constraints
- **User Scale**: Single user (Multi-tenancy not considered for now)
- **Concurrency**: Max 100 concurrent requests
- **Deployment Environment**: Local deployment, no containerization required (temporarily)
- **Development Mode**: Personal project, requiring frequent code upgrades

---

## 2. Technology Selection

### 2.1 Core Tech Stack

| Component | Selection | Version | Reason |
|------|---------|---------|---------|
| **Web Framework** | FastAPI | >=0.115.0 | High async performance, auto docs, standard for microservices |
| **ASGI Server** | Uvicorn | >=0.32.0 | Recommended by FastAPI, excellent performance |
| **Task Queue** | Redis Queue (RQ) | >=2.0.0 | Simple, sufficient for 100 concurrency, lighter than Celery |
| **Message Store** | Redis | 6.0+ | Task queue + Result cache, globally shared |
| **Data Validation** | Pydantic | >=2.10.0 | Built-in FastAPI dependency, type safety |
| **Dependency Mgmt** | uv | latest | Fast, modern, auto version locking |
| **ASR Engine** | FunASR | latest | High offline accuracy, supports mixed Chinese/English |

### 2.2 Rejected Options

| Option | Reason for Rejection |
|------|-----------|
| **Django** | Too heavy, not suitable for microservices, async support immature |
| **Celery** | Complex config, overkill for 100 concurrency |
| **Docker** | Personal project, no production environment need presently |
| **Database** | Small data volume (keep only last 10 records), Redis + JSON files sufficient |

---

## 3. System Architecture Design

### 3.1 Overall Architecture

```
┌─────────────────────────────────────────┐
│      Telegram Bot Manager (Future)      │
│      Port: 8000                         │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│       Redis (Global Queue + Cache)       │
│       Port: 6379                        │
│       - RQ Task Queue                   │
│       - Task Result Cache               │
│       - History Storage                 │
66: └─────┬───────┬───────┬──────────┬────────┘
      │       │       │          │
      ▼       ▼       ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐  ...
│  ASR   │ │  TTS   │ │  OCR   │  (Dozens more)
│ FastAPI│ │ FastAPI│ │ FastAPI│
│ 8000   │ │ 8002   │ │ 8003   │
└────────┘ └────────┘ └────────┘
```

### 3.2 ASR Service Workflow

```
User Request (Telegram Bot)
    ↓
POST /api/v1/asr/submit (Upload Audio)
    ↓
FastAPI saves file to src/storage/recordings/
    ↓
Create RQ Task → Redis Queue (rq:queue:asr-queue)
    ↓
Immediately return task_id to user
    ↓
━━━━━━━━━━━━━ Async Processing Line ━━━━━━━━━━━━━
    ↓
RQ Worker picks task from queue (2 Workers)
    ↓
Call SpeechRecognizer.recognize()
    ↓
Save result to Redis (asr:task:{task_id})
    ↓
Update history (asr:history:latest, Max 10)
    ↓
Append to JSON Log (asr_history.jsonl)
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ↓
User Polling GET /api/v1/asr/result/{task_id}
    ↓
Return Recognition Result
    ↓
(Optional) Clean expired files (Exceeding 10 recordings)
```

### 3.3 Redis Data Structure Design

#### Namespace Planning
```
asr:task:{task_id}        → String  (Single task result, TTL 1 hour)
asr:history:latest        → List    (Latest 10 records)
asr:audio:index           → Sorted Set (Audio file index, sorted by time, max 10)
rq:queue:asr-queue        → List    (RQ Task Queue, auto managed)
rq:job:{job_id}           → Hash    (RQ Task Details, auto managed)
```

#### Data Example
```redis
# Single Task Result
SET asr:task:abc123 '{"status":"done","text":"Transcription content...","duration":120.5}' EX 3600

# History List (Last 10)
LPUSH asr:history:latest '{"task_id":"abc123",...}'
LTRIM asr:history:latest 0 9  # Keep only 10

# Audio File Index (Sorted by timestamp)
ZADD asr:audio:index 1733155200 "2025-12-01_001_abc123.wav"
ZREMRANGEBYRANK asr:audio:index 0 -11  # Keep only newest 10
```

---

## 4. API Interface Design

### 4.1 API List Overview

| API | Method | Purpose | Priority |
|-----|------|------|--------|
| `/api/v1/asr/submit` | POST | Submit Transcription Task | 🔴 Must |
| `/api/v1/asr/result/{task_id}` | GET | Query Task Result | 🔴 Must |
| `/api/v1/health` | GET | Service Health Check | 🔴 Must |
| `/api/v1/asr/history` | GET | Get History | 🟡 Important |
| `/api/v1/asr/audio/{task_id}` | GET | Download Original Audio | 🟡 Important |
| `/api/v1/asr/queue/status` | GET | View Queue Status | 🟡 Important |
| `/api/v1/asr/retry/{task_id}` | POST | Retry Failed Task | 🟢 Useful |
| `/api/v1/asr/task/{task_id}` | DELETE | Delete Task and Audio | 🟢 Useful |
| `/api/v1/stats` | GET | System Stats | ⚪ Optional |

### 4.2 Core API Detailed Design

#### A. Submit Task
```
POST /api/v1/asr/submit
Content-Type: multipart/form-data

Request:
  - audio: File (Required, audio file)
  - language: str (Optional, default "zh")
  - batch_size: int (Optional, default 500)

Response (200):
{
  "task_id": "2025-12-01_001_abc123",
  "status": "queued",
  "position": 3,
  "estimated_wait": 45  // seconds
}

Error (400):
{
  "error": "Invalid file format",
  "supported_formats": ["wav", "mp3", "m4a", "flac"]
}
```

#### B. Query Result
```
GET /api/v1/asr/result/{task_id}

Response (200) - Processing:
{
  "task_id": "abc123",
  "status": "processing",
  "progress": 30  // Percentage
}

Response (200) - Done:
{
  "task_id": "abc123",
  "status": "done",
  "text": "Transcription content...",
  "duration": 120.5,
  "created_at": "2025-12-01T10:00:00Z",
  "audio_url": "/api/v1/asr/audio/abc123"
}

Response (200) - Failed:
{
  "task_id": "abc123",
  "status": "failed",
  "error": "Processing timeout (600s exceeded)",
  "retry_url": "/api/v1/asr/retry/abc123"
}

Error (404):
{
  "error": "Task not found",
  "task_id": "abc123"
}
```

#### C. Health Check
```
GET /api/v1/health

Response (200):
{
  "status": "ready",
  "model_loaded": true,
  "redis_connected": true,
  "workers_active": 2,
  "uptime": "3 days 5 hours"
}

Response (503):
{
  "status": "unavailable",
  "model_loaded": false,
  "error": "Models are still loading..."
}
```

#### D. History
```
GET /api/v1/asr/history?limit=10

Response (200):
{
  "total": 10,
  "records": [
    {
      "task_id": "abc123",
      "filename": "2025-12-01_001_abc123.wav",
      "text": "Content...",
      "created_at": "2025-12-01T10:00:00Z",
      "duration": 120.5,
      "status": "success",
      "audio_url": "/api/v1/asr/audio/abc123"
    },
    ...
  ]
}
```

#### E. Queue Status
```
GET /api/v1/asr/queue/status

Response (200):
{
  "queued": 3,       // Waiting
  "processing": 2,   // Processing
  "failed": 1,       // Failed
  "workers": 2,      // Worker Count
  "workers_busy": 2  // Busy Workers
}
```

---

## 5. Storage Scheme Design

### 5.1 Audio File Storage (Filesystem)

#### Storage Path
```
src/
└── storage/
    └── recordings/
        ├── 2025-12-01_001_abc123.wav
        ├── 2025-12-01_002_def456.wav
        └── ... (Max 10 retained)
```

#### File Naming Rule
```
Format: YYYY-MM-DD_{Sequence}_{task_id}.{ext}
Example: 2025-12-01_001_abc123.wav
```

#### Auto Cleanup Policy
- **Retention Count**: Last 10 files
- **Cleanup Timing**: Check on every new upload
- **Cleanup Method**: Delete oldest files (Index maintained by Redis Sorted Set)

### 5.2 Transcription Result Storage (Redis + JSON)

#### Redis Storage (Fast Query)
```
Key: asr:history:latest
Type: List
TTL: Infinite
Max Length: 10

Value Example:
[
  '{"task_id":"abc123","file":"...","text":"...","created_at":"...","duration":120.5,"status":"success"}',
  ...
]
```

#### JSON File Storage (Persistent Backup)
```
src/
└── storage/
    └── logs/
        └── asr_history.jsonl  # JSON Lines Format
```

**File Content Example** (JSON Lines):
```jsonl
{"task_id":"abc123","file":"test.wav","text":"Content...","created_at":"2025-12-01T10:00:00Z","duration":120.5,"status":"success","worker_id":1}
{"task_id":"def456","file":"test2.wav","text":"...","created_at":"2025-12-01T11:00:00Z","duration":85.2,"status":"failed","error":"timeout"}
```

**Query Example** (Using `jq`):
```bash
# Query all failed tasks
cat asr_history.jsonl | jq 'select(.status=="failed")'

# Query tasks from today
cat asr_history.jsonl | jq 'select(.created_at | startswith("2025-12-01"))'

# Stats average duration
cat asr_history.jsonl | jq -s 'map(.duration) | add/length'
```

---

## 6. Logging Scheme Design

### 6.1 Log Hierarchy

```
src/
└── storage/
    └── logs/
        ├── asr_api.log        # API Access Log (INFO)
        ├── asr_worker.log     # Worker Process Log (INFO + DEBUG)
        ├── asr_error.log      # Error Log (ERROR + CRITICAL)
        └── asr_history.jsonl  # Business Data Log (Structured)
```

### 6.2 Log Content Examples

#### API Access Log (`asr_api.log`)
```
[2025-12-01 10:00:00] INFO POST /api/v1/asr/submit - task=abc123 file=test.wav size=2.3MB status=queued
[2025-12-01 10:00:15] INFO GET /api/v1/asr/result/abc123 - status=processing progress=30%
[2025-12-01 10:02:30] INFO GET /api/v1/asr/result/abc123 - status=done duration=135s
```

#### Worker Process Log (`asr_worker.log`)
```
[2025-12-01 10:00:01] INFO Worker-1 task=abc123 status=started queue_position=3
[2025-12-01 10:00:15] DEBUG Worker-1 task=abc123 vad_segments=45 batch_size=500
[2025-12-01 10:02:25] INFO Worker-1 task=abc123 status=completed text_length=1520 rtf=0.015
```

#### Error Log (`asr_error.log`)
```
[2025-12-01 10:05:30] ERROR Worker-2 task=def456 error="Processing timeout after 600s"
[2025-12-01 10:05:30] ERROR Worker-2 task=def456 traceback:
  File "/path/to/worker.py", line 123
    result = model.generate(...)
  RuntimeError: CUDA out of memory
```

### 6.3 Log Config Recommendation

```python
# Log Config Example (Not full code)
LOGGING_CONFIG = {
    "rotation": "10 MB",        # Single file size
    "retention": "30 days",     # Retention period
    "format": "[{time:YYYY-MM-DD HH:mm:ss}] {level} {message}",
    "level": {
        "api": "INFO",
        "worker": "DEBUG",
        "error": "ERROR"
    }
}
```

---

## 7. Project Structure Design

### 7.1 Recommended Directory Structure

```
ASR_server/
├── pyproject.toml           # uv dependency management
├── uv.lock                  # Lock file
├── .env.example             # Env var template
├── README.md                # Project Readme
│
├── src/
│   ├── __init__.py
│   │
│   ├── asr/                 # ASR Core Module
│   │   ├── __init__.py
│   │   ├── recognizer.py    # SpeechRecognizer Class
│   │   ├── config.py        # ASR Config (Model path, params, etc.)
│   │   └── hotwords.txt     # Hotwords List
│   │
│   ├── api/                 # FastAPI Service
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI app entry
│   │   ├── routes.py        # API Route Definitions
│   │   ├── models.py        # Pydantic Data Models
│   │   ├── tasks.py         # RQ Async Tasks
│   │   └── dependencies.py  # DI (Redis connection etc.)
│   │
│   ├── utils/               # Utility Functions
│   │   ├── __init__.py
│   │   ├── file_handler.py  # File Upload/Cleanup
│   │   ├── logger.py        # Log Config
│   │   └── redis_client.py  # Redis Connection Management
│   │
│   └── storage/             # Data Storage Dir
│       ├── recordings/      # Audio Files (Max 10)
│       └── logs/            # Log Files
│           ├── asr_api.log
│           ├── asr_worker.log
│           ├── asr_error.log
│           └── asr_history.jsonl
│
├── scripts/                 # Helper Scripts
│   ├── download_models.py   # Model Download Script
│   ├── start_workers.sh     # Start RQ Workers
│   └── clear_old_files.py   # Manual Cleanup Script
│
├── tests/                   # Tests (Optional)
│   ├── test_api.py
│   └── test_recognizer.py
│
└── report/                  # Documentation
    ├── LOCAL_DEPLOYMENT_GUIDE.md
    └── ARCHITECTURE_DESIGN.md   # This Document
```

### 7.2 Env Variable Config (`.env`)

```bash
# Redis Config
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0

# ASR Config
ASR_MODEL_PATH=~/.cache/modelscope/hub
ASR_HOTWORDS_PATH=src/asr/hotwords.txt
ASR_USE_GPU=true
ASR_BATCH_SIZE=500

# Storage Config
STORAGE_PATH=src/storage
MAX_RECORDINGS=10
MAX_HISTORY_RECORDS=10

# RQ Config
RQ_QUEUE_NAME=asr-queue
RQ_WORKER_COUNT=2
RQ_WORKER_TIMEOUT=600  # Seconds

# API Config
API_HOST=0.0.0.0
API_PORT=8000
API_RELOAD=true  # Dev true, Prod false

# Log Config
LOG_LEVEL=INFO
LOG_ROTATION=10 MB
LOG_RETENTION=30 days
```

---

## 8. Deployment Config

### 8.1 System Dependencies

```bash
# 1. Redis (Already Installed)
sudo apt install redis-server  # Ubuntu/Debian
sudo systemctl enable redis-server
sudo systemctl start redis-server

# 2. Python 3.10
python --version  # Confirm version

# 3. uv (If not installed)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### 8.2 Project Dependency Installation

```bash
cd /home/tiger/Projects/ASR_server

# Install all dependencies
uv sync

# Or add new dependencies
uv add fastapi uvicorn[standard] redis rq python-multipart python-dotenv
```

### 8.3 Service Startup Process

#### Dev Environment (3 Terminals)

**Terminal 1: Redis (Auto Start)**
```bash
# Confirm Redis Status
systemctl status redis-server
```

**Terminal 2: RQ Workers**
```bash
cd /home/tiger/Projects/ASR_server

# Start 2 Workers
rq worker asr-queue --url redis://localhost:6379/0 --name worker-1 --burst &
rq worker asr-queue --url redis://localhost:6379/0 --name worker-2 --burst &

# Or use script
./scripts/start_workers.sh
```

**Terminal 3: FastAPI Service**
```bash
cd /home/tiger/Projects/ASR_server

# Dev Mode (Auto Reload)
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# Access Auto Docs
# http://localhost:8000/docs  (Swagger UI)
# http://localhost:8000/redoc (ReDoc)
```

### 8.4 Config Parameters Summary

| Config Item | Value | Description |
|--------|-----|------|
| **Redis Port** | 6379 | Default port, globally shared |
| **API Port** | 8000 | ASR Service Port |
| **RQ Workers** | 2 | Adjust based on GPU count |
| **Worker Timeout** | 600s | Long audio requires more time |
| **Batch Size** | 500s | VRAM usage balance point |
| **Max Recordings** | 10 | Auto delete oldest when exceeded |
| **Max History** | 10 | Redis List limit length |

---

## 9. Performance Metrics & Monitoring

### 9.1 Performance Expectations

| Metric | Expected | Description |
|------|-------|------|
| **API Response Time** | < 100ms | Submit task only, excluding transcription time |
| **Transcription Speed (RTF)** | 0.01 ~ 0.05 | Real Time Factor, GPU Accelerated |
| **Concurrency** | 100 requests/min | 2 Workers sufficient |
| **Queue Wait Time** | < 60s | 100 concurrency scenario |
| **Memory Usage** | ~3GB | Model loading + Redis |
| **Disk Usage** | < 100MB | 10 recordings + logs |

### 9.2 Monitoring Points

- **Redis Connection Status**: Check via `/api/v1/health`
- **Worker Liveness**: `rq info --url redis://localhost:6379/0`
- **Queue Backlog**: `/api/v1/asr/queue/status`
- **Disk Space**: `df -h src/storage/`
- **Log File Size**: `du -sh src/storage/logs/`

---

## 10. Future Expansion Path

### 10.1 Near Term (1-3 Months)

1. **Bot Manager Integration**
   - Create Telegram Bot Service (Port 8000)
   - Implement Webhook to receive user messages
   - Call ASR API to process voice messages

2. **New Microservices**
   - TTS Service (Port 8002)
   - OCR Service (Port 8003)
   - Copy ASR project structure

3. **Optimizations**
   - Add Progress Push (WebSocket)
   - Implement Task Priority Queue
   - Add Result Cache (Return directly for same audio)

### 10.2 Mid Term (3-6 Months)

1. **API Gateway**
   - Unified Entry (nginx or FastAPI)
   - Route distribution to microservices
   - Unified Auth and Rate Limiting

2. **Multi-user Support**
   - Add User Auth (JWT)
   - Isolate Data by User
   - Quota Management

3. **Containerized Deployment**
   - Docker Compose orchestration
   - Simplify deployment and migration

### 10.3 Long Term (6+ Months)

1. **High Availability**
   - Redis Master-Slave Replication
   - Load Balancing
   - Auto Failover

2. **Data Persistence**
   - Migrate to PostgreSQL
   - Store full history
   - Support complex queries

3. **Cloud Native Deployment**
   - Kubernetes Orchestration
   - Auto Scaling
   - Monitoring & Alerting System

---

## 11. FAQ

### Q1: Why choose RQ instead of Celery?
**A**: For 100 concurrency, RQ is sufficient and easy to configure. Celery is powerful but complex, better for larger scale production environments.

### Q2: What if Redis crashes?
**A**:
- Task queue will be lost (but JSON logs retain history)
- FastAPI service will return 503 error
- Need to resubmit tasks after Redis restart

### Q3: How to backup data?
**A**:
- **Recordings**: Periodically backup `src/storage/recordings/`
- **Results**: `asr_history.jsonl` contains all history
- **Redis Data**: Optional, use `redis-cli --rdb` backup

### Q4: How to upgrade models?
**A**:
1. Run `download_models.py` to download new models
2. Update model path in `src/asr/config.py`
3. Restart FastAPI Service and Workers

### Q5: How to check detailed logs for a task?
**A**:
```bash
# Search in worker log
grep "task=abc123" src/storage/logs/asr_worker.log

# Query in JSON history
cat src/storage/logs/asr_history.jsonl | jq 'select(.task_id=="abc123")'
```

---

## 12. References

### Official Documentation
- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [Redis Queue (RQ) Docs](https://python-rq.org/)
- [FunASR Docs](https://github.com/alibaba-damo-academy/FunASR)

### Best Practices
- [Microservices Patterns](https://microservices.io/)
- [Async Task Queue Design](https://12factor.net/backing-services)
- [API Design Guide (RESTful)](https://restfulapi.net/)

---

**Version**: v1.0
**Last Updated**: 2025-12-02
**Maintainer**: tiger
**Project Path**: `/home/tiger/Projects/ASR_server`
