"""API Routes for ASR Service"""
import os
import uuid
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from redis import Redis
from rq import Queue
from rq.job import Job

from .models import (
    SubmitResponse, TaskResult, HistoryResponse, HistoryRecord,
    QueueStatus, HealthResponse, StatsResponse, ErrorResponse
)
from .dependencies import get_redis
from .tasks import process_asr_task
from ..utils.file_handler import file_handler
from ..utils.redis_client import redis_client
from ..utils.logger import log_api
from ..asr.config import config

router = APIRouter(prefix="/api/v1")


# ============================================================================
# 🔴 CRITICAL APIs
# ============================================================================

@router.post("/asr/submit", response_model=SubmitResponse, tags=["ASR"])
async def submit_task(
    audio: UploadFile = File(...),
    language: str = Query("zh", description="Language code"),
    batch_size: int = Query(500, description="Batch size in seconds"),
    redis: Redis = Depends(get_redis)
):
    """
    Submit ASR transcription task
    
    - **audio**: Audio file (wav, mp3, m4a, flac)
    - **language**: Language code (default: zh)
    - **batch_size**: Batch size for processing (default: 500s)
    """
    # Validate file format
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    ext = audio.filename.rsplit('.', 1)[-1].lower()
    supported_formats = ['wav', 'mp3', 'm4a', 'flac', 'ogg']
    if ext not in supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Supported: {supported_formats}"
        )
    
    # Generate task ID
    task_id = str(uuid.uuid4())[:8]
    
    try:
        # Save uploaded file
        content = await audio.read()
        audio_path, saved_filename = file_handler.save_upload(
            content, task_id, audio.filename
        )
        
        log_api(f"POST /api/v1/asr/submit task={task_id} file={saved_filename} size={len(content)/1024/1024:.2f}MB")
        
        # Cleanup old files
        deleted = file_handler.cleanup_old_files(max_files=config.max_recordings)
        if deleted:
            log_api(f"Cleaned up {len(deleted)} old files")
        
        # Create RQ task
        queue = Queue('asr-queue', connection=redis)
        
        # OOM Prevention: Limit Queue Size
        MAX_QUEUE_SIZE = 100000 # Unlocked for destructive test
        if len(queue) >= MAX_QUEUE_SIZE:
             log_api(f"Queue full ({len(queue)} >= {MAX_QUEUE_SIZE}), rejecting task {task_id}", level="WARNING")
             raise HTTPException(status_code=503, detail="Server overloaded, please try again later")

        job = queue.enqueue(
            process_asr_task,
            task_id=task_id,
            audio_path=audio_path,
            job_timeout=600  # 10 minutes timeout
        )
        
        # Get queue position
        position = len(queue)
        estimated_wait = position * 30  # rough estimate: 30s per task
        
        # Save initial status
        redis_client.save_task_result(task_id, {
            "task_id": task_id,
            "status": "queued",
            "created_at": "",
        })
        
        return SubmitResponse(
            task_id=task_id,
            status="queued",
            position=position,
            estimated_wait=estimated_wait
        )
        
    except Exception as e:
        log_api(f"POST /api/v1/asr/submit error: {e}", level="ERROR")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/asr/result/{task_id}", response_model=TaskResult, tags=["ASR"])
async def get_result(task_id: str):
    """
    Get task result by task_id
    
    Returns status: queued, processing, done, or failed
    """
    log_api(f"GET /api/v1/asr/result/{task_id}")
    
    # Get result from Redis
    result = redis_client.get_task_result(task_id)
    
    if not result:
        raise HTTPException(status_code=404, detail=f"Task not found: {task_id}")
    
    # Add audio URL if task is done
    if result["status"] == "done":
        result["audio_url"] = f"/api/v1/asr/audio/{task_id}"
    elif result["status"] == "failed":
        result["retry_url"] = f"/api/v1/asr/retry/{task_id}"
    
    return TaskResult(**result)


@router.get("/health", response_model=HealthResponse, tags=["System"])
async def health_check():
    """
    Health check endpoint
    
    Returns service status, Redis connection, worker status
    """
    try:
        # Check Redis connection
        redis_connected = redis_client.ping()
        
        # Check workers (from RQ)
        from rq import Worker
        redis_conn = redis_client.client
        workers = Worker.all(connection=redis_conn)
        workers_active = len(workers)
        
        # We consider the service "ready" if Redis is connected.
        # Even if no workers are active, the API can still accept and queue requests.
        # But for a strict health check, we might want at least one worker.
        if redis_connected:
            status = "ready"
            # Optional: warn if no workers
            if workers_active == 0:
                status = "degraded" # API works, but tasks won't process
        else:
            status = "unavailable"
        
        return HealthResponse(
            status=status,
            model_loaded=workers_active > 0, # Inferred from worker presence
            redis_connected=redis_connected,
            workers_active=workers_active
        )
        
    except Exception as e:
        return HealthResponse(
            status="unavailable",
            model_loaded=False,
            redis_connected=False,
            workers_active=0,
            error=str(e)
        )


# ============================================================================
# 🟡 IMPORTANT APIs
# ============================================================================

@router.get("/asr/history", response_model=HistoryResponse, tags=["ASR"])
async def get_history(limit: int = Query(10, le=100)):
    """
    Get transcription history
    
    - **limit**: Maximum number of records to return (max: 100)
    """
    log_api(f"GET /api/v1/asr/history limit={limit}")
    
    records = redis_client.get_history(limit=limit)
    
    # Convert to HistoryRecord format
    history_records = []
    for record in records:
        history_records.append(HistoryRecord(
            task_id=record["task_id"],
            filename=record["filename"],
            text=record["text"],
            created_at=record["created_at"],
            duration=record["duration"],
            status=record["status"],
            audio_url=f"/api/v1/asr/audio/{record['task_id']}"
        ))
    
    return HistoryResponse(
        total=len(history_records),
        records=history_records
    )


@router.get("/asr/audio/{task_id}", tags=["ASR"])
async def download_audio(task_id: str):
    """
    Download original audio file
    
    Returns the audio file for download
    """
    log_api(f"GET /api/v1/asr/audio/{task_id}")
    
    audio_path = file_handler.get_file_path(task_id)
    
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        audio_path,
        media_type="application/octet-stream",
        filename=os.path.basename(audio_path)
    )


@router.get("/asr/queue/status", response_model=QueueStatus, tags=["System"])
async def queue_status(redis: Redis = Depends(get_redis)):
    """
    Get RQ queue status
    
    Returns number of queued, processing, failed tasks and worker info
    """
    try:
        from rq import Queue
        from rq.registry import StartedJobRegistry, FailedJobRegistry
        
        queue = Queue('asr-queue', connection=redis)
        started_registry = StartedJobRegistry('asr-queue', connection=redis)
        failed_registry = FailedJobRegistry('asr-queue', connection=redis)
        
        # Get worker info
        from rq import Worker
        # Use raw client for RQ operations to avoid decoding errors
        workers = Worker.all(connection=redis_client.raw_client)
        workers_busy = len([w for w in workers if w.get_current_job()])
        
        return QueueStatus(
            queued=len(queue),
            processing=len(started_registry),
            failed=len(failed_registry),
            workers=len(workers),
            workers_busy=workers_busy
        )
    except Exception as e:
        log_api(f"GET /api/v1/asr/queue/status error: {e}", level="ERROR")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# 🟢 USEFUL APIs
# ============================================================================

@router.post("/asr/retry/{task_id}", response_model=SubmitResponse, tags=["ASR"])
async def retry_task(task_id: str, redis: Redis = Depends(get_redis)):
    """
    Retry a failed task
    
    Re-enqueues the task for processing
    """
    log_api(f"POST /api/v1/asr/retry/{task_id}")
    
    # Check if task exists
    result = redis_client.get_task_result(task_id)
    if not result:
        raise HTTPException(status_code=404, detail="Task not found")
    
    if result["status"] != "failed":
        raise HTTPException(status_code=400, detail="Only failed tasks can be retried")
    
    # Get audio file path
    audio_path = file_handler.get_file_path(task_id)
    if not audio_path or not os.path.exists(audio_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Re-enqueue task
    queue = Queue('asr-queue', connection=redis)
    job = queue.enqueue(
        process_asr_task,
        task_id=task_id,
        audio_path=audio_path,
        job_timeout=600
    )
    
    # Update status
    redis_client.save_task_result(task_id, {
        "task_id": task_id,
        "status": "queued",
    })
    
    return SubmitResponse(
        task_id=task_id,
        status="queued",
        position=len(queue)
    )


@router.delete("/asr/task/{task_id}", tags=["ASR"])
async def delete_task(task_id: str):
    """
    Delete a task and its audio file
    
    Removes task result from Redis and deletes audio file
    """
    log_api(f"DELETE /api/v1/asr/task/{task_id}")
    
    # Delete from Redis
    redis_client.delete_task(task_id)
    
    # Delete audio file
    deleted = file_handler.delete_file(task_id)
    
    return {
        "task_id": task_id,
        "deleted": deleted,
        "message": "Task deleted successfully" if deleted else "Task not found"
    }


# ============================================================================
# ⚪ OPTIONAL APIs
# ============================================================================

@router.get("/stats", response_model=StatsResponse, tags=["System"])
async def get_stats():
    """
    Get system statistics
    
    Returns total tasks processed, duration, average RTF, storage used
    """
    log_api("GET /api/v1/stats")
    
    # Read from JSON log
    log_file = Path("src/storage/logs/asr_history.jsonl")
    
    total_tasks = 0
    total_duration = 0.0
    total_processing_time = 0.0
    
    if log_file.exists():
        import json
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    record = json.loads(line)
                    total_tasks += 1
                    total_duration += record.get("duration", 0.0)
                    total_processing_time += record.get("processing_time", 0.0)
                except json.JSONDecodeError:
                    continue
    
    # Calculate storage used
    storage_path = Path("src/storage")
    try:
        storage_used = sum(f.stat().st_size for f in storage_path.rglob('*') if f.is_file())
        storage_used_mb = storage_used / 1024 / 1024
    except Exception:
        storage_used_mb = 0.0
    
    # Calculate real RTF (Real Time Factor) = processing_time / audio_duration
    # RTF < 1 means faster than real-time
    if total_duration > 0 and total_processing_time > 0:
        avg_rtf = total_processing_time / total_duration
    else:
        avg_rtf = 0.0  # No data yet
    
    return StatsResponse(
        total_tasks=total_tasks,
        total_duration=total_duration,
        avg_rtf=round(avg_rtf, 4),
        storage_used=f"{storage_used_mb:.2f} MB"
    )


@router.get("/test/results/latest", tags=["System"])
async def get_latest_test_results():
    """Get latest performance test metrics"""
    csv_file = Path("src/storage/performance_stats.csv")
    if not csv_file.exists():
        return {
            "timestamp": "",
            "cpu_percent": 0,
            "memory_mb": 0,
            "active_workers": 0,
            "queued_tasks": 0
        }
    
    try:
        import collections
        with open(csv_file, 'r') as f:
            dq = collections.deque(f, maxlen=1)
            if not dq:
                return {}
            last_line = dq[0]
            if "timestamp" in last_line: # Header check
                return {}
            
            parts = last_line.strip().split(',')
            # Format: timestamp, cpu, mem_percent, mem_mb, workers, queued
            return {
                "timestamp": parts[0],
                "cpu_percent": float(parts[1]),
                "memory_percent": float(parts[2]),
                "memory_mb": float(parts[3]),
                "active_workers": int(parts[4]),
                "queued_tasks": int(parts[5])
            }
    except Exception as e:
        log_api(f"Error reading perf stats: {e}", level="ERROR")
        return {}

@router.get("/test/report/latest", tags=["System"])
async def get_latest_test_report():
    """Get latest load test summary report"""
    report_file = Path("src/storage/test_report.json")
    if not report_file.exists():
        return {}
    
    try:
        import json
        with open(report_file, 'r') as f:
            return json.load(f)
    except Exception as e:
        log_api(f"Error reading test report: {e}", level="ERROR")
        return {}
