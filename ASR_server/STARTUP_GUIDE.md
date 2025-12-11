# ASR Service Startup Guide

> **Languages**: [English](STARTUP_GUIDE.md) | [简体中文](STARTUP_GUIDE.zh-CN.md)

> [!NOTE]
> This documentation is automatically translated from the [Chinese version](STARTUP_GUIDE.zh-CN.md). In case of discrepancies, the Chinese version prevails.

Quickly start and test the ASR FastAPI Microservice.

---

## 📋 Prerequisites Check

```bash
# 1. Check Python Version (Requires 3.10)
python --version

# 2. Check Redis Status
systemctl status redis-server
# Or
redis-cli ping  # Should return PONG

# 3. Check uv is installed
uv --version
```

---

## 🚀 Quick Start (3 Terminals)

### Terminal 1: Install Dependencies

```bash
cd /home/tiger/Projects/ASR_server

# Install all dependencies (including FastAPI, Redis, RQ etc.)
uv sync

# Activate virtual environment (Optional, uv uses it automatically)
source .venv/bin/activate
```

### Terminal 2: Start Unified Workers
    
```bash
cd /home/tiger/Projects/ASR_server

# Start Unified Workers (Consumer Group)
./scripts/start_unified_worker.sh
```

**Expected Output:**
```
🚀 Redis Streams Unified Workers
📡 Stream: asr_tasks
👥 Group: asr_workers
...
worker-1: 🔄 Loading ASR model...
worker-1: ✅ Model loaded, ready to process.
```

### Terminal 3: Start FastAPI Service

```bash
cd /home/tiger/Projects/ASR_server

# Development Mode (Auto Reload)
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000

# Production Mode (No Auto Reload)
# uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --workers 1
```

**Expected Output:**
```
INFO:     Will watch for changes in these directories: ['/home/tiger/Projects/ASR_server']
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
🚀 Starting ASR Service...
🔄 正在加载 ASR 模型资源，请稍候...
✅ ASR 模型加载完毕，服务就绪。
✅ ASR Service ready
INFO:     Application startup complete.
```

---

### 3. Start API Service (Port 8000)

```bash
uvicorn src.api.main:app --reload --port 8000
# Output: Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

---

## 4. Verify Service

### 4.1 Health Check

Visit `http://localhost:8000/api/v1/health`

**Response**:

```json
{
  "status": "ready",
  "model_loaded": true,
  "redis_connected": true,
  "active_workers": 1,
  "device": "cuda:0"
}
```

### 4.2 Submit Transcription Task

```bash
# Submit audio file using curl
curl -X POST http://localhost:8000/api/v1/asr/submit \
  -F "audio=@tests/samples/test_audio.wav"
```

**Response**:

```json
{
  "task_id": "c8f3075d-...",
  "status": "queued",
  "position": 1,
  "estimated_wait": 2
}
```

### 4.3 Query Result

```bash
curl http://localhost:8000/api/v1/asr/result/{task_id}
```

---

## 5. FAQ

### Q1: API Returns 502 Bad Gateway
*   **Check Redis**: Ensure Redis service is started (`sudo systemctl status redis`).
*   **Check Worker**: Ensure at least one Worker is running (`./scripts/start_unified_worker.sh`).

### Q2: CUDA Out of Memory
*   Reduce `ASR_BATCH_SIZE` in `.env`.
*   Set `ASR_USE_GPU=false` to force CPU usage.

### Q3: Port Conflict
*   Default port is **8000**. If occupied, modify startup command: `uvicorn ... --port 8002`.

### 3. Run Unit Tests

```bash
# Install pytest (If not installed)
uv add --dev pytest httpx

# Run all tests
./scripts/run_tests.sh

# Run specific test (Note new path)
pytest tests/integration/test_api.py::test_health_check -v
```

**Expected Output:**
```
tests/test_api.py::test_root PASSED
tests/test_api.py::test_health_check PASSED
tests/test_api.py::test_submit_no_file PASSED
tests/test_api.py::test_submit_invalid_format PASSED
...
==================== 15 passed in 2.3s ====================
```

---

## 📊 Monitoring and Management

### View Stream Status

```bash
# View Stream Info
redis-cli XINFO STREAM asr_tasks

# View Pending Messages
redis-cli XPENDING asr_tasks asr_workers

# View Consumer Status
redis-cli XINFO CONSUMERS asr_tasks asr_workers
```

### View Logs

```bash
# API Log
tail -f src/storage/logs/asr_api.log

# Worker Log
tail -f src/storage/logs/asr_worker.log

# Error Log
tail -f src/storage/logs/asr_error.log

# Business Log (JSON Lines)
tail -f src/storage/logs/asr_history.jsonl
```

### Clear Old Files

```bash
# Manual Clean
python scripts/clear_old_files.py

# View Storage Usage
du -sh src/storage/
```

---

## 🔧 Common Issues

### Q1: Redis Connection Failed

**Error**: `Connection refused` or `redis_connected: false`

**Solution**:
```bash
# Start Redis
sudo systemctl start redis-server

# Verify running
redis-cli ping  # Should return PONG
```

### Q2: Worker Module Not Found

**Error**: `ModuleNotFoundError: No module named 'src'`

**Solution**:
```bash
# Start Unified Worker with python
export PYTHONPATH=$PYTHONPATH:$(pwd)
python3 src/worker/unified_worker.py --name debug-worker
```

### Q3: Model Load Failed

**Error**: `Model not found`

**Solution**:
```bash
# Download Model
python scripts/download_models.py

# Confirm Model Path
ls ~/.cache/modelscope/hub/
```

### Q4: Port Already in Use

**Error**: `Address already in use`

**Solution**:
```bash
# Find process
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use another port
uvicorn src.api.main:app --port 8002
```

---

## 🛑 Stop Service

```bash
# 1. Stop FastAPI (Terminal 3)
Ctrl+C

# 2. Stop Workers (Terminal 2)
Ctrl+C
# Or
pkill -f 'rq worker'

# 3. (Optional) Stop Redis
sudo systemctl stop redis-server
```

---

## 📝 API Endpoint List

| Endpoint | Method | Function | Priority |
|------|------|------|--------|
| `/api/v1/asr/submit` | POST | Submit Transcription Task | 🔴 Must |
| `/api/v1/asr/result/{task_id}` | GET | Query Task Result | 🔴 Must |
| `/api/v1/health` | GET | Health Check | 🔴 Must |
| `/api/v1/asr/history` | GET | Get History | 🟡 Important |
| `/api/v1/asr/audio/{task_id}` | GET | Download Audio | 🟡 Important |
| `/api/v1/asr/queue/status` | GET | Queue Status | 🟡 Important |
| `/api/v1/asr/retry/{task_id}` | POST | Retry Task | 🟢 Useful |
| `/api/v1/asr/task/{task_id}` | DELETE | Delete Task | 🟢 Useful |
| `/api/v1/stats` | GET | System Stats | ⚪ Optional |

---

## 🎯 Next Steps

- ✅ After successful service run, visit http://localhost:8000/docs to test all interfaces
- ✅ Run `pytest tests/test_api.py` to ensure all tests pass
- ✅ Check `reports/ARCHITECTURE_DESIGN.md` for complete architecture
- 🔜 Integrate to Telegram Bot (Future Plan)

---

**Version**: v1.0
**Last Updated**: 2025-12-11
**Project Path**: `/home/tiger/Projects/ASR_server`
