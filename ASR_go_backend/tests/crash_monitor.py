import time
import psutil
import csv
import os
import sys
import redis
from datetime import datetime

# --- Configuration ---
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_DB = int(os.getenv("REDIS_DB", 0))
QUEUE_NAME = os.getenv("RQ_QUEUE_NAME", "asr-queue")
OUTPUT_FILE = "crash_monitor.csv"
INTERVAL = 0.1  # 100ms

def get_redis_client():
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
        r.ping()
        return r
    except Exception as e:
        print(f"❌ Redis connection failed: {e}")
        return None

def count_workers(redis_client):
    if not redis_client:
        return 0
    try:
        # RQ stores workers in a set called "rq:workers"
        return redis_client.scard("rq:workers")
    except:
        return 0

def get_queue_len(redis_client):
    if not redis_client:
        return 0
    try:
        # RQ prefixes queue names with "rq:queue:"
        return redis_client.llen(f"rq:queue:{QUEUE_NAME}")
    except:
        return 0

def monitor():
    print(f"🕵️ Crash Monitor Started. Log: {OUTPUT_FILE}")
    print(f"⏱ Interval: {INTERVAL}s | Redis: {REDIS_HOST}:{REDIS_PORT}")

    redis_client = get_redis_client()
    
    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["timestamp", "cpu_percent", "mem_used_gb", "mem_percent", "swap_percent", "redis_queue_len", "worker_count"])
        
        try:
            while True:
                ts = datetime.now().isoformat()
                
                # System Metrics
                cpu = psutil.cpu_percent(interval=None) # Non-blocking
                mem = psutil.virtual_memory()
                swap = psutil.swap_memory()
                
                mem_gb = round(mem.used / (1024**3), 2)
                
                # App Metrics
                q_len = get_queue_len(redis_client)
                w_count = count_workers(redis_client)
                
                # Write & FLUSH!
                writer.writerow([ts, cpu, mem_gb, mem.percent, swap.percent, q_len, w_count])
                f.flush()
                os.fsync(f.fileno())  # Force write to disk
                
                time.sleep(INTERVAL)
                
        except KeyboardInterrupt:
            print("\n🛑 Monitor Stopped.")

if __name__ == "__main__":
    monitor()
