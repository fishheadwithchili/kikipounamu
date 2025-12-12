import json
import base64
import os
import sys
import time
import signal
import uuid
import redis
from pathlib import Path

# Add src to path
sys.path.append(str(Path(__file__).parent.parent.parent))

from src.asr.recognizer import SpeechRecognizer
from src.utils.logger import log_worker, log_error

# Configuration
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
QUEUE_NAME = "asr_chunk_queue"

class StreamWorker:
    def __init__(self):
        self.redis = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB, decode_responses=True)
        self.running = True
        self.recognizer = SpeechRecognizer()
        
        # Ensure temp directory exists
        self.temp_dir = Path("src/input/temp_chunks")
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        signal.signal(signal.SIGINT, self.shutdown)
        signal.signal(signal.SIGTERM, self.shutdown)
        
        log_worker(f"Stream Worker initialized. Listening on {QUEUE_NAME}")

    def shutdown(self, signum, frame):
        log_worker("Shutting down worker...")
        self.running = False

    def process_task(self, task_json):
        try:
            task = json.loads(task_json)
            session_id = task.get("session_id")
            chunk_index = task.get("chunk_index")
            audio_b64 = task.get("audio_data")
            
            if not all([session_id, chunk_index is not None, audio_b64]):
                log_error(f"Invalid task format: {task_json}")
                return

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
            
            # Cleanup
            try:
                os.remove(temp_path)
            except OSError:
                pass

            # Publish result
            response = {
                "chunk_index": chunk_index,
                "text": result.get("text", ""),
                "duration": result.get("duration", 0.0),
                "error": result.get("error", "")
            }
            
            # Channel: asr_result_<session_id>
            channel = f"asr_result_{session_id}"
            count = self.redis.publish(channel, json.dumps(response))
            
            # P0 Fix: Result Reliability - Cache result
            cache_key = f"asr:results:{session_id}"
            self.redis.rpush(cache_key, json.dumps(response))
            self.redis.expire(cache_key, 60)
            
            log_worker(f"Processed chunk sess={session_id} idx={chunk_index} subscribers={count} time={duration:.3f}s")

        except Exception as e:
            log_error(f"Error processing task: {e}", exc_info=True)

    def run(self):
        log_worker("Stream Worker loop started")
        while self.running:
            try:
                # BLPOP with timeout to allow checking self.running
                item = self.redis.blpop(QUEUE_NAME, timeout=1)
                if item:
                    _, task_json = item
                    self.process_task(task_json)
            except redis.exceptions.ConnectionError:
                log_error("Redis connection lost. Retrying in 5s...")
                time.sleep(5)
            except Exception as e:
                log_error(f"Unexpected error in loop: {e}")
                time.sleep(1)

if __name__ == "__main__":
    worker = StreamWorker()
    worker.run()
