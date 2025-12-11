# Performance Testing Framework - User Guide

> **Languages**: [English](testing_framework_guide.md) | [简体中文](testing_framework_guide.zh-CN.md)

## 📦 Framework Composition

I have created a **Reusable Performance Testing Framework** for you, containing the following components:

### 1. Application Level Resource Tracking ([tasks.py](file:///home/tiger/Projects/ASR_server/src/api/tasks.py))
**Location:** [/home/tiger/Projects/ASR_server/src/api/tasks.py](file:///home/tiger/Projects/ASR_server/src/api/tasks.py)

**Function:** Worker internally automatically records each task's:
- Memory Start/End/Peak/Delta
- CPU User/System Time
- RTF (Real-Time Factor)

**Output:** Automatically recorded to worker logs

### 2. System Level Monitoring Tool ([pidstat_monitor.py](file:///home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py))
**Location:** [/home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py](file:///home/tiger/Projects/ASR_go_backend/tests/pidstat_monitor.py)

**Function:** Uses [pidstat](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py#16-52) to capture CPU and memory usage of all processes (including forked child processes)

**Usage:**
```python
from pidstat_monitor import PidStatMonitor

with PidStatMonitor("output.log", interval=1):
    # Your test code
    pass
```

### 3. Log Parser ([log_parser.py](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py))
**Location:** [/home/tiger/Projects/ASR_go_backend/tests/log_parser.py](file:///home/tiger/Projects/ASR_go_backend/tests/log_parser.py)

**Function:**
- Parses pid stat logs to extract CPU/Memory data
- Parses worker logs to extract RTF, memory metrics
- Generates Mermaid line chart code
- Generates performance summary

### 4. Integrated Test Runner ([performance_test_runner.py](file:///home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py))
**Location:** [/home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py](file:///home/tiger/Projects/ASR_go_backend/tests/performance_test_runner.py)

**Function:** One-click run complete performance test flow

## 🚀 Usage Methods

### Method 1: Automated Test (Recommended)

**1. Start Services** (In separate terminal):
```bash
cd /home/tiger/Projects/ASR_server

# Terminal 1: Start ASR Server
uvicorn src.main:app --port 8000

# Terminal 2: Start RQ Worker  
rq worker asr-queue
```

**2. Run Test**:
```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/performance_test_runner.py [audio_file_path]

# Default uses long_audio_test.wav
python3 tests/performance_test_runner.py
```

**3. View Report**:
```
tests/results/performance_report.md
```

### Method 2: Manual Step-by-Step Test

**1. Start pidstat monitoring**:
```bash
pidstat -u -r -h -p ALL 1 > pidstat.log &
PIDSTAT_PID=$!
```

**2. Submit Test Task**:
```bash
curl -X POST http://localhost:8000/api/v1/asr/submit \
  -F "audio=@/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav"
```

Record returned `task_id`.

**3. Poll Wait for Completion**:
```bash
while true; do
  curl http://localhost:8000/api/v1/asr/result/{task_id}
  sleep 2
done
```

**4. Stop Monitoring**:
```bash
kill $PIDSTAT_PID
```

**5. Generate Report**:
```python
from log_parser import LogParser

parser = LogParser()
parser.parse_pidstat("pidstat.log")
parser.parse_worker_logs("src/storage/logs/worker*.log")

print(parser.generate_summary())
print(parser.generate_mermaid_charts())
```

## 📊 Interpreting Report

### Key Metrics

**1. RTF (Real-Time Factor)**
- **Meaning:** `processing_time / audio_duration`
- **Conclusion:**
  - `RTF < 1.0` ✅ **Acceleration Effective** - Faster than real-time
  - `RTF > 1.0` ⚠️  Slower than real-time

**2. Memory Delta**
- **Meaning:** Memory change before and after task
- **Conclusion:**
  - `Close to 0` ✅ **OOM Protection Effective** - No memory leak
  - `Continuous Growth` ⚠️  Possible memory leak

**3. Peak Memory**
- **Meaning:** Memory peak during task execution
- **Conclusion:**
  - `< 500MB` ✅ Single task memory controllable
  - `> 1GB` ⚠️  Excessive memory usage, risk of OOM

**4. CPU Line Chart**
- **Expectation:** Obvious processing peaks (Not flat 0%)
- **If flat 0%:** Monitoring failed or task too fast

### Example Report

```markdown
## Performance Summary

- **Tasks Processed:** 1
- **Average RTF:** 0.234 ✅ (Faster than real-time!)
- **Peak Memory (max):** 145.2 MB
- **Avg Memory Delta:** +2.3 MB ✅ (Stable)

### CPU Usage (Python Processes)
```mermaid
xychart-beta
    title "CPU Usage (%)"
    x-axis [0, 5, 10, 15, 20, 25, 30]
    y-axis "CPU %" 0 --> 100
    line [0.0, 15.3, 45.2, 78.1, 62.3, 23.1, 5.2]
\`\`\`
```

This way you can truly see:
- ✅ CPU is indeed used (Proves monitoring effective)
- ✅ RTF < 1 (Proves acceleration mechanism effective)
- ✅ Memory stable (Proves OOM protection effective)

## 🔄 Reuse in Future

Whenever performance test is needed:
```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/performance_test_runner.py [your_audio_file]
```

Report automatically generated at `tests/results/performance_report.md`.
