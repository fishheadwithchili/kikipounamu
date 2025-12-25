# High Concurrency Load Test Retrospective & Solution Report

> **Languages**: [English](retrospective_20251211.md) | [简体中文](retrospective_20251211.zh-CN.md)

**Date**: 2025-12-11
**Project**: ASR Go Backend (kikipounamu)
**Test Goal**: 500 Concurrent Audio Stream Speech Recognition Analysis

---

## 1. Abstract

This test aimed to verify the stability of Go Backend under 500 high concurrency. In the early stage, it encountered persistent 0% success rate, causing backend crashes multiple times. After deep troubleshooting, **4 Critical Fatal Bugs** were found and fixed. After fixing, the system maintained 100% success rate under 10 concurrency, and backend service ran stably under 500 concurrency (throughput limited by downstream Python Worker compute power, causing queue timeout, but service itself did not crash), achieving expected architecture stability goals.

---

## 2. Troubleshooting Detailed Retrospective

This debugging experienced four stages of failure, corresponding to problems in system architecture, configuration management, cross-language collaboration, and code quality.

### 🚨 Fault 1: Redis Connection Explosion (The "Too Many Open Files" Panic)

*   **Phenomenon**: 
    *   After starting 500 load test, Go backend crashed instantly.
    *   Error log showed `panic: too many open files`, stack trace pointed to Redis `Subscribe` call.
*   **Root Cause Analysis**:
    *   **Architecture Defect**: Original `ProcessChunk` logic was **"Sync Mode"**. I.e., for every WebSocket audio chunk received, backend initiated a new `Subscribe` request to Redis waiting for result.
    *   **Calculation**: 500 Users x 1 min audio (approx 300 chunks) = **150,000 Subscription Operations**.
    *   Even though Go goroutines are lightweight, underlying TCP connections and file handles were exhausted instantly, causing system crash.
*   **Solution**:
    *   **Architecture Refactoring -> Async Consumer Model**.
    *   **Optimized Logic**: 
        1.  **Subscribe once** to Redis result channel when WebSocket connection established.
        2.  When receiving audio chunk, only execute `RPush` (Fire-and-Forget), no wait, no blocking.
        3.  Separate background goroutine continuously reads results from Redis and pushes back to WebSocket.
    *   **Effect**: Redis subscriptions constant at 500 (1 per user), independent of audio duration.

### ⛔ Fault 2: Connection Limit (Connection Refused)

*   **Phenomenon**: 
    *   After fixing Redis issue, stress test script showed vast majority connections failed (`Connect call failed`).
    *   Only very few (about 5) users could connect successfully.
*   **Root Cause Analysis**:
    *   **Configuration Error**: Checked `config.yaml` found `MAX_CONNECTIONS` set to `1000`, but runtime log showed **MaxConnections: 5**.
    *   Traced back to possible previous dev env hot reload config or env var residue causing default value overwrite.
*   **Solution**:
    *   Forced update `config.yaml` and started backend via env var `MAX_CONNECTIONS=2000`, ensuring sufficient capacity.

### 🐛 Fault 3: Python Worker Crash (Log Level Error)

*   **Phenomenon**: 
    *   Backend connected successfully, but all tasks timed out, no result returned.
    *   Checked Python Worker log, found Worker exited immediately upon startup.
    *   Error: `ValueError: Level 'debug' does not exist`.
*   **Root Cause Analysis**:
    *   **Cross-language/Lib Compatibility**: Env var `LOG_LEVEL` passed by Go backend was lowercase `"debug"`. `loguru` library used by Python strictly requires uppercase log level (e.g. `"DEBUG"`) during `pydantic` config loading, otherwise throws exception.
*   **Solution**:
    *   Modified `ASR_server/src/utils/logger.py` to force `.upper()` conversion when loading config, enhancing system robustness.

### 💥 Fault 4: Go Backend Deadlock/Crash (Double Unlock Panic)

*   **Phenomenon**: 
    *   After fixing first three, small scale test ran halfway and crashed again.
    *   Error log: `fatal error: sync: unlock of unlocked mutex`.
*   **Root Cause Analysis**:
    *   **Code Quality (Low-level Error)**: In `WaitAndMerge` function, to handle complex concurrency state, manually managed `Mutex`. During a code adjustment, accidentally wrote `state.mu.Unlock()` twice consecutively.
    *   Go's `sync.Mutex` does not allow unlocking an unlocked mutex, directly causing Runtime Panic.
*   **Solution**:
    *   Code review located `internal/service/session.go:247`, deleted redundant unlock code.

---

## 3. Test Result Summary

### 3.1 Small Scale Verification (10 User)
*   **Concurrency**: 10
*   **Success Rate**: 100% (10/10)
*   **Avg RTF**: < 1.0 (High-speed)
*   **Conclusion**: Logic fix verified, system function normal.

### 3.2 Large Scale Stress Test (500 User)
*   **Concurrency**: 500
*   **Success Rate**: 22.6% (113/500)
*   **Failure Reason**: All Timeout.
    *   Backend Service **Not Crashed**.
    *   Redis **Not Crashed**.
    *   Bottleneck lies in single **Python Worker Processing Speed**. 500 concurrent audio streams far exceeded single core/process model processing capacity, causing massive tasks queuing in Redis until timeout.
*   **Conclusion**: Backend architecture is stable, can support high concurrent connections. To improve business success rate, must horizontally scale Python Worker nodes.

---

## 4. Future Optimization Suggestions

1.  **Horizontal Scale Worker**: Use Docker Swarm or K8s to deploy multi-replica `ASR_server/stream_worker`, auto-scale based on Redis queue depth.
2.  **Rate Limiting Protection**: Although Go backend can withstand connections, it cannot perceive Worker pressure. Suggest Go gateway actively refuse new connections (503 Service Unavailable) when Redis queue length is too large to protect existing tasks.
3.  **Code Standard**: Introduce `golangci-lint` and enforce check in CI flow to avoid low-level errors like Double Unlock entering main branch.
