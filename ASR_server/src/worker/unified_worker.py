#!/usr/bin/env python3
"""
Unified Worker for Redis Streams ASR Task Processing

This worker uses Consumer Groups to process both batch and stream tasks
from the unified asr_tasks stream.

Usage:
    python3 src/worker/unified_worker.py --name worker-1 --stream asr_tasks --group asr_workers
"""
import argparse
import base64
import gc
import ctypes
import json
import os
import signal
import sys
import threading
import time
import uuid
import tracemalloc
import psutil
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent.parent.parent))

from src.asr.recognizer import SpeechRecognizer
from src.utils.logger import log_worker, log_error
from src.utils.redis_client import redis_client
from src.utils.streams import (
    StreamsClient, StreamMessage,
    ensure_consumer_group, consume_tasks, ack_task
)

# Memory release using malloc_trim (Linux)
try:
    _libc = ctypes.CDLL("libc.so.6")
    _malloc_trim = _libc.malloc_trim
    _malloc_trim.argtypes = [ctypes.c_size_t]
    _malloc_trim.restype = ctypes.c_int
except (OSError, AttributeError):
    _malloc_trim = None


def force_memory_release():
    """Force Python GC and return memory to OS."""
    gc.collect()
    gc.collect()
    if _malloc_trim:
        _malloc_trim(0)


class UnifiedWorker:
    """Unified ASR Worker using Redis Streams Consumer Groups."""
    
    def __init__(self, worker_name: str, stream_name: str, group_name: str):
        self.worker_name = worker_name
        self.stream_name = stream_name
        self.group_name = group_name
        self.running = True
        self.recognizer = SpeechRecognizer()
        
        # Temp directory for stream chunks
        self.temp_dir = Path("src/input/temp_chunks")
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        # Register signal handlers
        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)
        
        log_worker(f"Unified Worker '{worker_name}' initialized for stream '{stream_name}' group '{group_name}'")
    
    def _shutdown(self, signum, frame):
        """Handle shutdown signals gracefully."""
        log_worker(f"Shutdown signal received. Stopping worker {self.worker_name}...")
        self.running = False
    
    def process_batch_task(self, msg: StreamMessage) -> dict:
        """
        Process batch upload task (file-based ASR).
        
        Args:
            msg: StreamMessage with payload containing audio_path
            
        Returns:
            Result dict with status, text, duration, etc.
        """
        task_id = msg.task_id
        audio_path = msg.payload.get("audio_path", "")
        language = msg.payload.get("language", "zh")
        
        log_worker(f"Processing BATCH task={task_id} path={audio_path}")
        
        # Track resources
        tracemalloc.start()
        proc = psutil.Process()
        start_mem_mb = proc.memory_info().rss / 1024 / 1024
        start_time = time.time()
        
        try:
            # Perform recognition
            result = self.recognizer.recognize(audio_path)
            processing_time = time.time() - start_time
            
            # End resource tracking
            current_mem, peak_mem = tracemalloc.get_traced_memory()
            tracemalloc.stop()
            end_mem_mb = proc.memory_info().rss / 1024 / 1024
            
            if result["status"] == "success":
                task_result = {
                    "task_id": task_id,
                    "status": "done",
                    "text": result["text"],
                    "duration": result.get("duration", 0.0),
                    "created_at": datetime.now().isoformat(),
                    "processing_time": processing_time,
                }
                
                rtf = processing_time / result.get("duration", 1.0)
                log_worker(
                    f"BATCH task={task_id} done text_len={len(result['text'])} "
                    f"duration={result.get('duration', 0):.1f}s rtf={rtf:.3f} "
                    f"mem_delta={end_mem_mb - start_mem_mb:+.1f}MB"
                )
                
                # Save to history
                history_record = {
                    "task_id": task_id,
                    "filename": Path(audio_path).name,
                    "text": result["text"],
                    "created_at": task_result["created_at"],
                    "duration": result.get("duration", 0.0),
                    "status": "success",
                }
                redis_client.add_to_history(history_record)
            else:
                task_result = {
                    "task_id": task_id,
                    "status": "failed",
                    "error": result.get("error", "Unknown error"),
                    "created_at": datetime.now().isoformat(),
                }
                log_error(f"BATCH task={task_id} failed: {result.get('error')}")
            
            # Save result
            redis_client.save_task_result(task_id, task_result)
            return task_result
            
        except Exception as e:
            log_error(f"BATCH task={task_id} exception: {e}", exc_info=True)
            error_result = {
                "task_id": task_id,
                "status": "failed",
                "error": str(e),
                "created_at": datetime.now().isoformat(),
            }
            redis_client.save_task_result(task_id, error_result)
            raise
        finally:
            self.recognizer.cleanup()
            force_memory_release()
    
    def process_stream_task(self, msg: StreamMessage) -> dict:
        """
        Process streaming chunk task (real-time ASR from WebSocket).
        
        Args:
            msg: StreamMessage with payload containing chunk_index, audio_data
            
        Returns:
            Result dict published to result channel
        """
        session_id = msg.task_id
        chunk_index = msg.payload.get("chunk_index", 0)
        audio_b64 = msg.payload.get("audio_data", "")
        
        try:
            # Decode audio
            audio_data = base64.b64decode(audio_b64)
            
            # Save to temporary file
            temp_filename = f"{session_id}_{chunk_index}_{uuid.uuid4().hex[:6]}.wav"
            temp_path = self.temp_dir / temp_filename
            
            with open(temp_path, "wb") as f:
                f.write(audio_data)
            
            # Process
            start_time = time.time()
            result = self.recognizer.recognize(str(temp_path))
            duration = time.time() - start_time
            
            # Cleanup temp file
            try:
                os.remove(temp_path)
            except OSError:
                pass
            
            # Prepare response
            response = {
                "chunk_index": chunk_index,
                "text": result.get("text", ""),
                "duration": result.get("duration", 0.0),
                "error": result.get("error", "")
            }
            
            # Publish to result channel (Pub/Sub for Go backend)
            channel = f"asr_result_{session_id}"
            count = redis_client.client.publish(channel, json.dumps(response))
            
            # P0 Fix: Result Reliability - Cache result
            redis_client.cache_stream_result(session_id, response)
            
            log_worker(
                f"STREAM sess={session_id} chunk={chunk_index} "
                f"subscribers={count} time={duration:.3f}s"
            )
            
            return response
            
        except Exception as e:
            log_error(f"STREAM sess={session_id} chunk={chunk_index} error: {e}", exc_info=True)
            
            # Publish error
            error_response = {
                "chunk_index": chunk_index,
                "text": "",
                "duration": 0.0,
                "error": str(e)
            }
            channel = f"asr_result_{session_id}"
            redis_client.client.publish(channel, json.dumps(error_response))
            
            return error_response
        finally:
            self.recognizer.cleanup()
            force_memory_release()
    
    def start_heartbeat(self):
        """Start background heartbeat thread."""
        def heartbeat_loop():
            log_worker(f"Heartbeat thread started for {self.worker_name}")
            while self.running:
                try:
                    # Construct heartbeat payload
                    payload = {
                        "ts": int(time.time()),
                        "worker": self.worker_name,
                        "status": "running",
                        # TODO: Add real load metrics (cpu, memory, queue depth)
                        "load": {} 
                    }
                    
                    # Write to Redis with TTL
                    key = f"worker:{self.worker_name}:heartbeat"
                    # Use set with ex (expiration)
                    redis_client.client.set(key, json.dumps(payload), ex=30)
                    
                except Exception as e:
                    log_error(f"Heartbeat error: {e}")
                
                # Sleep for 15 seconds
                time.sleep(15)
        
        t = threading.Thread(target=heartbeat_loop, daemon=True)
        t.start()

    def run(self):
        """Main worker loop using Consumer Groups."""
        log_worker(f"Worker {self.worker_name} starting main loop...")
        
        # Start heartbeat
        self.start_heartbeat()
        
        # Ensure consumer group exists
        ensure_consumer_group()
        
        while self.running:
            try:
                # Read messages from stream
                messages = consume_tasks(
                    worker_name=self.worker_name,
                    batch_size=5,
                    block_ms=1000
                )
                
                for msg in messages:
                    try:
                        # Route to appropriate handler
                        if msg.task_type == "batch":
                            self.process_batch_task(msg)
                        elif msg.task_type == "stream":
                            self.process_stream_task(msg)
                        else:
                            log_worker(f"Unknown task type: {msg.task_type}")
                        
                        # Acknowledge message after successful processing
                        ack_task(msg.msg_id)
                        
                    except Exception as e:
                        # Don't ack - message will be claimable by another worker
                        log_error(f"Failed to process msg={msg.msg_id}: {e}")
                        
            except Exception as e:
                log_error(f"Error in worker loop: {e}")
                time.sleep(1)
        
        log_worker(f"Worker {self.worker_name} shutting down.")


def main():
    parser = argparse.ArgumentParser(description="Unified ASR Worker")
    parser.add_argument("--name", default="worker-1", help="Worker name")
    parser.add_argument("--stream", default="asr_tasks", help="Stream name")
    parser.add_argument("--group", default="asr_workers", help="Consumer group name")
    args = parser.parse_args()
    
    # Override from environment if present
    stream_name = os.getenv("STREAM_NAME", args.stream)
    group_name = os.getenv("CONSUMER_GROUP", args.group)
    worker_name = os.getenv("WORKER_NAME", args.name)
    
    worker = UnifiedWorker(worker_name, stream_name, group_name)
    worker.run()


if __name__ == "__main__":
    main()
