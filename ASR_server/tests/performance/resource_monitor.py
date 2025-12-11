import time
import psutil
import csv
import os
import threading
from datetime import datetime
from pathlib import Path

class ResourceMonitor:
    def __init__(self, output_file: str, interval: float = 1.0):
        self.output_file = output_file
        self.interval = interval
        self.running = False
        self.thread = None
        
        # Ensure directory exists
        Path(output_file).parent.mkdir(parents=True, exist_ok=True)
        
        # Initialize CSV if not exists
        if not os.path.exists(output_file):
            with open(output_file, 'w', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['timestamp', 'cpu_percent', 'memory_percent', 'memory_mb', 'active_workers', 'queued_tasks'])

    def _monitor_loop(self):
        while self.running:
            try:
                cpu = psutil.cpu_percent(interval=None)
                mem = psutil.virtual_memory()
                
                try:
                    from redis import Redis
                    from rq import Queue, Worker
                    
                    redis_conn = Redis(host='localhost', port=6379, db=0)
                    q = Queue('asr-queue', connection=redis_conn)
                    queued = len(q)
                    workers = len(Worker.all(connection=redis_conn))
                except Exception as e:
                    # Fallback if redis fetch fails
                    # print(f"Redis stats error: {e}")
                    queued = 0
                    workers = 0

                with open(self.output_file, 'a', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        datetime.now().isoformat(),
                        cpu,
                        mem.percent,
                        mem.used / 1024 / 1024,
                        workers,
                        queued
                    ])
            except Exception as e:
                print(f"Monitor error: {e}")
            
            time.sleep(self.interval)

    def start(self):
        self.running = True
        self.thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.thread.start()
        print(f"📊 Resource monitor started. Logging to {self.output_file}")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join()
        print("⏹️ Resource monitor stopped.")

if __name__ == "__main__":
    # Test run
    mon = ResourceMonitor("test_stats.csv")
    mon.start()
    time.sleep(3)
    mon.stop()
