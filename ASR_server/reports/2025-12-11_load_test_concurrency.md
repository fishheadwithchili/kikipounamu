# 2025-12-11 High Concurrency Load Test & Troubleshooting Summary

> **Languages**: [English](2025-12-11_load_test_concurrency.md) | [简体中文](2025-12-11_load_test_concurrency.zh-CN.md)

## 1. Background
To verify the stability and logging system performance of `ASR_go_backend` under high concurrency, we developed a dedicated load testing tool (`cmd/loadtester`) and set a target of 500 concurrent connections. During this process, we encountered and solved multiple issues regarding configuration and tool implementation.

## 2. Issues & Solutions

### 2.1 ASR Server Startup Failure (Pydantic V2 Strict Validation)
*   **Phenomenon**: When starting Python service (`ASR_server`), reported `ValidationError: Extra inputs are not permitted`.
*   **Cause**: Project uses Pydantic V2, which by default disallows undefined fields in environment variables (e.g., old `.env` might contain deprecated fields).
*   **Solution**: Modified `src/config.py`, `src/utils/redis_client.py`, `src/utils/logger.py` to explicitly add `extra="ignore"` in Pydantic config:
    ```python
    model_config = SettingsConfigDict(
        ...,
        extra="ignore"  # Critical Fix
    )
    ```

### 2.2 Stress Test Tool "Spin Loop" Issue
*   **Phenomenon**: During initial stress test, generated over 500k errors in 30 seconds.
*   **Cause**: Load test tool immediately retried after Connection Refused without waiting interval. This caused the client to frantically initiate connections in an infinite loop, consuming huge CPU and generating invalid test data.
*   **Solution**: Added **Backoff mechanism** in connection error handling in `cmd/loadtester/main.go`:
    ```go
    if err != nil {
        atomic.AddInt64(&totalErrs, 1)
        time.Sleep(100 * time.Millisecond) // Prevent Spin Loop
        return
    }
    ```
    *   **Effect**: Error count dropped to 110k (consistent with physical time limits), making test results more realistic.

### 2.3 Misunderstanding of Load Test "100% Error Rate"
*   **Phenomenon**: Under 500 concurrency, report showed 100% error rate, zero success.
*   **Analysis**:
    1.  Checked `backend.log`, backend CPU usage instantaneously reached 118%, indicating system was running at full speed.
    2.  Logs showed massive `active_connections` changes, peak reached 109.
    3.  Errors caused by single dev machine inability to handle 500 concurrent handshakes, leading to system overload protection (Connection Refused).
*   **Conclusion**: This is not a system crash, but a successful **Stress/Limit Test**. Verified logging system can record stably under overload without Panic.

## 3. Key Takeaways

1.  **Stress Tool Must Debounce**: Any network client handling errors in a loop must add `Sleep` or Backoff algorithm, otherwise it's a DDoS attack on the server and test data is invalid.
2.  **Error Rate != Failure**: In stress testing, high error rate often means hitting the system's **Capacity Limit**. Need to combine server resource monitoring (CPU/Mem) to judge if system crashed or just full.
3.  **Dev Lib Upgrade Compatibility**: Python Pydantic V2 strict mode often invalidates old configs, need to form habit of setting lenient parsing in `Config`.

---
**Related Files**:
- Load Test Tool: `ASR_go_backend/cmd/loadtester/main.go`
- Load Test Report: `ASR_go_backend/loadtest_report.md`
