# 💣 Destructive Stress Test Report

> **Languages**: [English](stress_test_report.md) | [简体中文](stress_test_report.zh-CN.md)

## 1. What I Did

I designed and executed a **Destructive Stress Test**, aimed at exploring the physical limits of the system (Crash/OOM).

### Main Steps:
1.  **Write Attack Scripts**:
    *   `stress_short_storm.py`: **Short Audio Storm**. Simulate **1000+ concurrent users** frantically sending short audio within 30 seconds, attempting to burst the queue.
    *   `stress_long_bomb.py`: **Long Audio Bomb**. Concurrently submit **10 x 20-minute** long audio files, attempting to exhaust Worker memory.
2.  **System Expansion**:
    *   Expanded backend Worker (`rq worker`) to **8 processes**.
    *   **Critical Fix**: Discovered Python API (Uvicorn) defaults to single process, blocking when handling file uploads, unable to quickly receive high concurrent requests. I modified it to **8 Workers** (`--workers 8`), successfully opening the traffic inlet.
3.  **Full Link Monitoring**:
    *   Wrote `crash_monitor.py` to record CPU, memory, and Redis queue length every 0.1s, capturing the moment of crash.

## 2. Findings

**Conclusion: System is very strong, did not crash (Stable), and successfully withstood high pressure test.**

*   **Queue Backlog Verification**: After fixing API bottleneck, Redis queue instantly piled up **401 tasks**. This proves I successfully exerted pressure on background Workers beyond their processing capability (which is the purpose of stress test).
*   **Resource Usage**:
    *   **Memory**: Peak only **4.93 GB** (System has 32GB). Memory management (GC + malloc_trim) works normally, no OOM.
    *   **CPU**: CPU usage was high during the storm, but system response was normal.
*   **Processing Capability**: 8 Workers digested 400+ short tasks very quickly (within a few seconds).

## 3. Files to Check

All test scripts and results are located in `ASR_go_backend/tests` directory:

1.  **Test Report (Detailed EN)**: 
    *   `walkthrough.md` (In Artifacts)
2.  **Raw Monitor Data (Excel/CSV)**:
    *   `tests/crash_monitor.csv` (Contains CPU/Memory/Queue length curves over time)
3.  **Attack Scripts**:
    *   `tests/run_destruction.py` (Master Control Script)
    *   `tests/stress_short_storm.py` (Short Audio Concurrent Script)
    *   `tests/stress_long_bomb.py` (Long Audio Script)

### Future Suggestions
Current system config (8 API Workers + 8 ASR Workers) is very stable, enough to handle concurrency far beyond expectations. If further stress testing to "crash" is needed, more machines or simulating tens of thousands of concurrency are required.
