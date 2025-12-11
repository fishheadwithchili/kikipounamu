"""RQ Async Tasks for ASR Processing"""
import ctypes
import gc
import json
import time
import tracemalloc
import psutil
from datetime import datetime
from pathlib import Path
from ..asr.recognizer import SpeechRecognizer
from ..utils.redis_client import redis_client
from ..utils.logger import log_worker, log_error

# Try to load libc for malloc_trim (Linux only)
# malloc_trim() returns freed memory to the OS, reducing RSS
try:
    _libc = ctypes.CDLL("libc.so.6")
    _malloc_trim = _libc.malloc_trim
    _malloc_trim.argtypes = [ctypes.c_size_t]
    _malloc_trim.restype = ctypes.c_int
except (OSError, AttributeError):
    _malloc_trim = None


def force_memory_release():
    """Force Python GC and return memory to OS via malloc_trim"""
    gc.collect()
    gc.collect()  # Run twice to handle weak references and weak containers
    if _malloc_trim:
        _malloc_trim(0)  # Trim all free memory blocks





def process_asr_task(task_id: str, audio_path: str):
    """
    Process ASR task asynchronously
    
    Args:
        task_id: Unique task identifier
        audio_path: Path to audio file
    """
    log_worker(f"Worker task={task_id} status=started path={audio_path}")
    
    # Start resource tracking
    tracemalloc.start()
    proc = psutil.Process()
    start_mem_mb = proc.memory_info().rss / 1024 / 1024
    start_cpu_time = proc.cpu_times()
    
    start_time = time.time()
    
    try:
        # Initialize recognizer
        recognizer = SpeechRecognizer()
        
        # Perform recognition
        result = recognizer.recognize(audio_path)
        
        # Calculate processing time
        processing_time = time.time() - start_time
        
        # End resource tracking
        current_mem, peak_mem = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        end_mem_mb = proc.memory_info().rss / 1024 / 1024
        end_cpu_time = proc.cpu_times()
        
        # Calculate resource deltas
        mem_delta_mb = end_mem_mb - start_mem_mb
        peak_mem_mb = peak_mem / 1024 / 1024
        cpu_user_delta = end_cpu_time.user - start_cpu_time.user
        cpu_system_delta = end_cpu_time.system - start_cpu_time.system
        
        # Prepare result
        if result["status"] == "success":
            task_result = {
                "task_id": task_id,
                "status": "done",
                "text": result["text"],
                "duration": result.get("duration", 0.0),
                "created_at": datetime.now().isoformat(),
                "processing_time": processing_time,
            }
            
            # Calculate RTF (Real-Time Factor)
            audio_duration = result.get("duration", 0.0)
            rtf = processing_time / audio_duration if audio_duration > 0 else 0
            
            log_worker(
                f"Worker task={task_id} status=completed "
                f"text_length={len(result['text'])} "
                f"duration={audio_duration:.1f}s "
                f"rtf={rtf:.3f} "
                f"mem_start={start_mem_mb:.1f}MB mem_end={end_mem_mb:.1f}MB "
                f"mem_delta={mem_delta_mb:+.1f}MB mem_peak={peak_mem_mb:.1f}MB "
                f"cpu_user={cpu_user_delta:.2f}s cpu_sys={cpu_system_delta:.2f}s"
            )
        else:
            task_result = {
                "task_id": task_id,
                "status": "failed",
                "error": result.get("error", "Unknown error"),
                "created_at": datetime.now().isoformat(),
            }
            log_error(f"Worker task={task_id} error={result.get('error')}")
        
        # Save result to Redis
        redis_client.save_task_result(task_id, task_result)
        
        # Add to history if successful
        if result["status"] == "success":
            history_record = {
                "task_id": task_id,
                "filename": Path(audio_path).name,
                "text": result["text"],
                "created_at": task_result["created_at"],
                "duration": result.get("duration", 0.0),
                "status": "success",
            }
            redis_client.add_to_history(history_record)
            
            # Also append to JSON log file
            log_dir = Path("src/storage/logs")
            log_dir.mkdir(parents=True, exist_ok=True)
            
            json_log = log_dir / "asr_history.jsonl"
            with open(json_log, "a", encoding="utf-8") as f:
                f.write(json.dumps(history_record, ensure_ascii=False) + "\n")
        
        # Explicit cleanup to release memory
        del result
        recognizer.cleanup()
        force_memory_release()
        
        return task_result
        
    except Exception as e:
        log_error(f"Worker task={task_id} exception", exc_info=True)
        
        error_result = {
            "task_id": task_id,
            "status": "failed",
            "error": str(e),
            "created_at": datetime.now().isoformat(),
        }
        
        redis_client.save_task_result(task_id, error_result)
        raise
    finally:
        # Always attempt cleanup to prevent memory leaks
        try:
            force_memory_release()
        except Exception:
            pass  # Ignore cleanup errors
