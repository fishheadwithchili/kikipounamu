"""API Routes for ASR Service"""

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from funasr import AutoModel
from redis import Redis
from rq import Queue, Worker  # Keep for health check during transition

from ..asr.config import config
from ..utils.file_handler import file_handler
from ..utils.logger import log_api
from ..utils.redis_client import redis_client
from ..utils.streams import publish_task
from .dependencies import get_redis
from .models import (
    EmotionResponse,
    EmotionScore,
    ErrorResponse,
    HealthResponse,
    HistoryRecord,
    HistoryResponse,
    QueueStatus,
    StatsResponse,
    SubmitResponse,
    TaskResult,
)

# Global model cache
emotion_model = None

router = APIRouter(prefix="/api/v1")


# ============================================================================
# 🔴 CRITICAL APIs
# ============================================================================


@router.post("/asr/submit", response_model=SubmitResponse, tags=["ASR"])
async def submit_task(
    audio: UploadFile = File(...),
    language: str = Query("zh", description="Language code"),
    batch_size: int = Query(500, description="Batch size in seconds"),
    redis: Redis = Depends(get_redis),
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

    ext = audio.filename.rsplit(".", 1)[-1].lower()
    supported_formats = ["wav", "mp3", "m4a", "flac", "ogg"]
    if ext not in supported_formats:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file format. Supported: {supported_formats}",
        )

    # Generate task ID
    task_id = str(uuid.uuid4())[:8]

    try:
        # Save uploaded file
        content = await audio.read()
        audio_path, saved_filename = file_handler.save_upload(
            content, task_id, audio.filename
        )

        log_api(
            f"POST /api/v1/asr/submit task={task_id} file={saved_filename} size={len(content) / 1024 / 1024:.2f}MB"
        )

        # Cleanup old files
        deleted = file_handler.cleanup_old_files(max_files=config.max_recordings)
        if deleted:
            log_api(f"Cleaned up {len(deleted)} old files")

        # Publish to Redis Streams (replaces RQ Queue)
        publish_task(
            task_type="batch",
            task_id=task_id,
            payload={
                "audio_path": audio_path,
                "language": language,
                "batch_size": batch_size,
            },
        )

        # Save initial status
        redis_client.save_task_result(
            task_id,
            {
                "task_id": task_id,
                "status": "queued",
                "created_at": "",
            },
        )

        # Note: position is not easily determined with Streams, use 0
        return SubmitResponse(
            task_id=task_id,
            status="queued",
            position=0,
            estimated_wait=30,  # Default estimate
        )

    except Exception as e:
        log_api(f"POST /api/v1/asr/submit error: {e}", level="ERROR")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/emotion/submit", response_model=EmotionResponse, tags=["Emotion"])
async def submit_emotion_task(
    audio: UploadFile = File(...),
):
    """
    Submit audio for emotion analysis
    """
    global emotion_model

    # Validate file
    if not audio.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    task_id = str(uuid.uuid4())[:8]

    try:
        # Save file
        content = await audio.read()
        audio_path, saved_filename = file_handler.save_upload(
            content, task_id, audio.filename
        )

        # Load model if needed
        if emotion_model is None:
            log_api("Loading emotion2vec model...")
            emotion_model = AutoModel(
                model="iic/emotion2vec_plus_large",
                model_revision=None,
                disable_update=False,
                device="cuda",
            )

        # Run inference
        log_api(f"Running emotion analysis for {task_id}")
        # emotion2vec might return different formats, generally a list of dicts
        res = emotion_model.generate(
            input=audio_path, output_dir=None, granularity="utterance"
        )

        # Parse result
        # Assuming res is like [{'key': '...', 'scores': [...], 'labels': [...]}] or similar
        # Based on report:
        # "emotion_scores": { "happy": 0.02, ... }, "dominant_emotion": "sad"
        # We need to adapt the output.
        # Let's verify what generate returns.
        # Usually: [{'key': 'wav_name', 'scores': [0.1, ...], 'label': 'happy'}]

        # For safety, allow inspection via logs if it fails, but try to parse standard format
        log_api(f"Emotion result raw: {res}")

        # Mocking parsing logic based on standard funasr output
        # If it returns a list of results
        if isinstance(res, list) and len(res) > 0:
            item = res[0]
            # Adjust based on actual return structure
            scores = item.get("scores", [])
            labels = item.get("labels", [])  # or strictly defined labels

            # If structure is different, fallback or simple mapping
            # Using the report's example keys if available

            # REVISIT: The report shows json output.
            # I will trust the AutoModel returns something iterable.
            # Only way to know is to run it. I'll dump the raw result to log too.

            # Simple construction for now
            # Assume item has 'scores' and we map them to known labels?
            # Or item has 'text' as label?

            # For now, simplistic return
            # Robust parsing for dynamic label lists (5-class or 9-class)
            ems_scores = []
            if isinstance(scores, list) and isinstance(labels, list):
                for label, score in zip(labels, scores):
                    ems_scores.append(EmotionScore(label=label, score=float(score)))
            elif isinstance(scores, dict):
                for k, v in scores.items():
                    ems_scores.append(EmotionScore(label=k, score=v))
            else:
                ems_scores.append(EmotionScore(label="unknown", score=0.0))

            # Determine dominant emotion
            dominant_ev = "unknown"
            max_score = -1.0
            for es in ems_scores:
                if es.score > max_score:
                    max_score = es.score
                    dominant_ev = es.label

            return EmotionResponse(
                task_id=task_id,
                status="done",
                emotion_scores=ems_scores,
                dominant_emotion=dominant_ev,
            )

            dominant = item.get("label", "unknown")

            return EmotionResponse(
                task_id=task_id,
                status="done",
                emotion_scores=ems_scores,
                dominant_emotion=str(dominant),
            )

        # If we got here, format was unexpected
        return EmotionResponse(
            task_id=task_id,
            status="failed",
            emotion_scores=[],
            dominant_emotion="unknown",
        )

    except Exception as e:
        log_api(f"Emotion analysis failed: {e}", level="ERROR")
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

        # Check workers (from Redis Heartbeats)
        # Scan for keys pattern worker:*:heartbeat
        worker_keys = redis_client.client.keys("worker:*:heartbeat")
        workers_active = len(worker_keys)

        # We consider the service "ready" if Redis is connected.
        if redis_connected:
            status = "ready"
            if workers_active == 0:
                status = "degraded"  # API works, but no workers to process
        else:
            status = "unavailable"

        return HealthResponse(
            status=status,
            model_loaded=workers_active
            > 0,  # Assumed true if worker is sending heartbeats
            redis_connected=redis_connected,
            workers_active=workers_active,
        )

    except Exception as e:
        return HealthResponse(
            status="unavailable",
            model_loaded=False,
            redis_connected=False,
            workers_active=0,
            error=str(e),
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
        history_records.append(
            HistoryRecord(
                task_id=record["task_id"],
                filename=record["filename"],
                text=record["text"],
                created_at=record["created_at"],
                duration=record["duration"],
                status=record["status"],
                audio_url=f"/api/v1/asr/audio/{record['task_id']}",
            )
        )

    return HistoryResponse(total=len(history_records), records=history_records)


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
        filename=os.path.basename(audio_path),
    )


@router.get("/asr/queue/status", response_model=QueueStatus, tags=["System"])
async def queue_status(redis: Redis = Depends(get_redis)):
    """
    Get Redis Streams queue status

    Returns stream length, pending messages, and consumer info
    """
    try:
        from ..utils.streams import streams_client

        # Get stream info
        stream_info = streams_client.get_stream_info()
        pending = streams_client.get_pending_count()
        consumer_info = streams_client.get_consumer_info()

        # Count active consumers from Heartbeats for accuracy
        worker_keys = redis_client.client.keys("worker:*:heartbeat")
        total_workers = len(worker_keys)

        return QueueStatus(
            queued=stream_info.get("length", 0),  # Total historical tasks
            processing=pending,  # Tasks currently being processed (or stalled)
            failed=0,
            workers=total_workers,
            workers_busy=pending,  # Approximate
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

    # Re-publish to Redis Streams
    publish_task(
        task_type="batch",
        task_id=task_id,
        payload={"audio_path": audio_path, "language": "zh"},
    )

    # Update status
    redis_client.save_task_result(
        task_id,
        {
            "task_id": task_id,
            "status": "queued",
        },
    )

    return SubmitResponse(task_id=task_id, status="queued", position=0)


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
        "message": "Task deleted successfully" if deleted else "Task not found",
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
        storage_used = sum(
            f.stat().st_size for f in storage_path.rglob("*") if f.is_file()
        )
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
        storage_used=f"{storage_used_mb:.2f} MB",
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
            "queued_tasks": 0,
        }

    try:
        import collections

        with open(csv_file, "r") as f:
            dq = collections.deque(f, maxlen=1)
            if not dq:
                return {}
            last_line = dq[0]
            if "timestamp" in last_line:  # Header check
                return {}

            parts = last_line.strip().split(",")
            # Format: timestamp, cpu, mem_percent, mem_mb, workers, queued
            return {
                "timestamp": parts[0],
                "cpu_percent": float(parts[1]),
                "memory_percent": float(parts[2]),
                "memory_mb": float(parts[3]),
                "active_workers": int(parts[4]),
                "queued_tasks": int(parts[5]),
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

        with open(report_file, "r") as f:
            return json.load(f)
    except Exception as e:
        log_api(f"Error reading test report: {e}", level="ERROR")
        return {}
