# Retrospective: Worker Queue Mismatch & "Stuck Processing" Issue

**Date**: 2025-12-12  
**Status**: Resolved  
**Component**: ASR Server (Python), ASR Go Backend

## 1. Issue Description

During system startup, despite all services appearing green (running):
- Go Backend (ASR Dispatcher) was running.
- Worker process (via `./scripts/start_workers.sh`) was running.
- Frontend showed "Processing" status indefinitely for audio tasks.

## 2. Investigation Trajectory

### Initial Symptoms
- Logs showed the Worker started successfully: `Worker worker-1: started...`
- Go Backend logs showed it was connected to Redis.
- However, no logs appeared indicating *task execution* in the worker window.

### Diagnosis Steps
1.  **Checked RQ (Redis Queue) Status**:
    ```bash
    rq info --url redis://localhost:6379/0
    ```
    Output: `0 queues, 0 jobs total`. The workers were `idle`.

2.  **Checked Redis Native Keys**:
    Since RQ was empty, I checked if data was landing *anywhere* in Redis.
    ```bash
    redis-cli KEYS "*"
    redis-cli LLEN asr_chunk_queue
    ```
    Output: `asr_chunk_queue` had pending items (Length > 0).

3.  **Code Analysis**:
    - **Go Backend**: defined to push to `asr_chunk_queue` using raw `RPUSH`.
      ```go
      redisCli.RPush(ctx, "asr_chunk_queue", taskJSON)
      ```
    - **start_workers.sh**: started standard `rq` workers, which listen to `rq:queue:asr-queue`.
    - **stream_worker.py**: defined to listen to `asr_chunk_queue` using `BLPOP`.

## 3. Root Cause: Two "Dialects" of Workers

The system had two parallel, incompatible worker implementations:

| Feature | **RQ Worker** (Running) | **Stream Worker** (Idle) |
| :--- | :--- | :--- |
| **Startup Script** | `./scripts/start_workers.sh` | `python src/worker/stream_worker.py` |
| **Protocol** | Python `RQ` Library | Raw Redis (`BLPOP`) |
| **Queue Name** | `rq:queue:asr-queue` | `asr_chunk_queue` |
| **Task Generator** | Expected Python `rq.enqueue` | Go Backend `RPUSH` |

The Go Backend was "mailing letters" to Box A (`asr_chunk_queue`), while the Workers were "checking" Box B (`rq:queue:asr-queue`).

## 4. Resolution

1.  **Stop RQ Workers**: They are incompatible with the Go Backend's current implementation.
2.  **Start Stream Worker**: Manually started the correct worker:
    ```bash
    python3 src/worker/stream_worker.py
    ```
    It immediately consumed the backlog in `asr_chunk_queue`.
3.  **Standardization**: Created a new script `./scripts/start_stream_worker.sh` to ensure the correct worker is started in the future.

## 5. Key Learnings

1.  **Queue Mismatches are Silent**: Workers will happily report "Idle" (Health: OK) even if they are listening to the wrong queue. Always verify the *queue name* in Redis matches the *consumed queue* in code.
2.  **Hybrid Architecture Risks**: When mixing languages (Go prod + Python consumer), standard libraries like `RQ` or `Celery` might introduce specific protocol wrappers that the producer language must replicate perfectly. Often, raw Redis primitives (Lists/Streams) are safer and simpler for cross-language IPC.
