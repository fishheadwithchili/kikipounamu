# Memory Leak Verification & Stress Test Guide

## 🎯 Purpose

This test suite verifies:
1. **Memory leak fix** - Confirms +3.7GB leak is resolved
2. **Concurrency limit** - Finds maximum stable concurrent requests
3. **System resource usage** - Records CPU and memory data for research

## 📊 Output Files

The test generates **two data files**:

### 1. Test Results (JSONL)
```
tests/results/memory_leak_stress_test_<timestamp>.jsonl
```
Each line = one test result with memory delta, RTF, status

### 2. System Resources (CSV)
```
tests/results/system_resources_<timestamp>.csv
```
Real-time CPU and memory data sampled every 1 second:
```csv
timestamp,elapsed_seconds,process_name,pid,cpu_percent,memory_rss_mb,memory_percent
2025-12-09T23:30:15,0.0,python,12345,15.2,625.3,2.1
2025-12-09T23:30:16,1.0,python,12345,78.4,645.8,2.2
2025-12-09T23:30:17,2.0,python,12345,92.1,680.2,2.3
...
```

**Monitored processes:**
- RQ Worker (Python)
- API Server (uvicorn)
- Go Backend (asr-backend, if running)

## 🔧 Prerequisites

**Start services first:**

```bash
# Terminal 1: Start ASR Server
cd /home/tiger/Projects/ASR_server
uvicorn src.api.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Start Worker (with new memory fix code)
cd /home/tiger/Projects/ASR_server
pkill -f 'rq worker'  # Kill old worker
rq worker asr-queue --url redis://localhost:6379/0
```

## 🚀 Running the Test

```bash
cd /home/tiger/Projects/ASR_go_backend
python3 tests/memory_leak_stress_test.py
```

### Test Flow

**Phase 1: Memory Leak Verification**
- Tests short audio (4.7MB, ~4s)
- Tests long audio (23.5MB, ~12min) - **Critical test**
- Monitors Worker RSS before/after each task
- **Pass criteria:** Memory delta < 200 MB

**Phase 2: Concurrency Stress Test**
- Starts at concurrency=1
- Increases by 1 each round
- Submits multiple tasks simultaneously
- **Stops when:** Tasks fail OR Worker crashes
- **Result:** Maximum stable concurrency level

## 📊 Understanding Results

### Real-Time Logging (Crash-Safe)

All results are written **immediately** to:
```
tests/results/memory_leak_stress_test_<timestamp>.jsonl
```

**JSON Lines format** - each line is a complete test result:
```json
{"test_id": "long_audio_c1_1234", "status": "success", "worker_rss_delta_mb": 42.3, ...}
{"test_id": "short_audio_c2_1235", "status": "success", "worker_rss_delta_mb": 15.1, ...}
```

Even if the system crashes, all previous results are preserved.

### Generate Report

```bash
python3 tests/analyze_stress_test.py tests/results/memory_leak_stress_test_<timestamp>.jsonl
```

This creates a markdown report:
```
tests/results/memory_leak_stress_test_<timestamp>.md
```

### Key Metrics

| Metric | Meaning | Good | Bad |
|:-------|:--------|:-----|:----|
| **Memory Delta** | RSS change after task | < 200 MB | > 500 MB |
| **RTF** | Processing speed | < 1.0 (faster than real-time) | > 1.0 |
| **Status** | Task completion | success | failed/timeout |
| **Max Concurrency** | Stable concurrent limit | Higher is better | - |

   
2. **JSON Lines Format**
   - Each line = 1 complete result
   - No need to parse entire file
   - Append-only (no corruption risk)

3. **Immediate Flush**
   - Results written after each task
   - Even if next task crashes, previous data saved

4. **Graceful Shutdown**
   - Ctrl+C triggers log flush
   - `finally` blocks ensure cleanup

## 📝 Example Output

```
🧪 ASR Worker Memory Leak & Stress Test
============================================================
📝 Results: tests/results/memory_leak_stress_test_20251209_232145.jsonl
============================================================

✅ Found Worker PID: 12345
📊 Initial Worker RSS: 625.3 MB

============================================================
📋 PHASE 1: Memory Leak Verification
============================================================

🎵 Test 1: Short audio (baseline)
✅ Task submitted: abc123
✅ Task completed: success (RTF=0.234, ΔMem=+15.2MB)

🎵 Test 2: Long audio (memory leak check)
✅ Task submitted: def456
✅ Task completed: success (RTF=0.164, ΔMem=+45.8MB)

✅ MEMORY LEAK FIX VERIFIED!
   Memory delta: +45.8 MB (< 200 MB threshold)

============================================================
📋 PHASE 2: Concurrency Limit Discovery
============================================================

🚀 Testing concurrency=1 with 20251207_1033_recording.wav
✅ Task 1/1 submitted: ghi789
✅ Task 1: success (RTF=0.245, ΔMem=+12.3MB)

🚀 Testing concurrency=2 with 20251207_1033_recording.wav
✅ Task 1/2 submitted: jkl012
✅ Task 2/2 submitted: mno345
✅ Task 1: success (RTF=0.512, ΔMem=+24.1MB)
✅ Task 2: success (RTF=0.523, ΔMem=+23.8MB)

...

🏁 Maximum stable concurrency: 5
```

## 🔍 Troubleshooting

### Worker Not Found

```bash
# Check worker is running
ps aux | grep "rq worker"

# Start if needed
cd /home/tiger/Projects/ASR_server
rq worker asr-queue --url redis://localhost:6379/0
```

### API Connection Error

```bash
# Check server is running
curl http://localhost:8000/api/v1/health

# Start if needed
cd /home/tiger/Projects/ASR_server
uvicorn src.api.main:app --port 8000
```

### No Results File

Check for Python errors in the console output. The JSONL file is created immediately on first test.

## 🎯 Success Criteria

### Memory Leak Fixed ✅
- Long audio memory delta < 200 MB
- Worker RSS returns close to baseline
- No cumulative growth after multiple tasks

### Concurrency Stable ✅
- At least 3-5 concurrent requests succeed
- No Worker crashes
- RTF remains < 1.0 under load
