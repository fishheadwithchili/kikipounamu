import psutil
import time
import json
import argparse
import os
from datetime import datetime

def monitor(pid, duration, interval, output_file):
    print(f"Starting monitoring for PID {pid} (or system if None)...")
    data = []
    start_time = time.time()
    
    try:
        process = psutil.Process(pid) if pid else None
        
        while (time.time() - start_time) < duration:
            children = []
            timestamp = datetime.now().isoformat()
            
            if process:
                try:
                    cpu_percent = process.cpu_percent(interval=None)
                    memory_info = process.memory_info()
                    memory_mb = memory_info.rss / 1024 / 1024
                    
                    # Also include children (workers)
                    children = process.children(recursive=True)
                    for child in children:
                        try:
                            cpu_percent += child.cpu_percent(interval=None)
                            memory_mb += child.memory_info().rss / 1024 / 1024
                        except (psutil.NoSuchProcess, psutil.AccessDenied):
                            pass
                            
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    print("Process ended or access denied.")
                    break
            if children:
                for child in children:
                    try:
                        cpu_percent += child.cpu_percent(interval=None)
                        memory_mb += child.memory_info().rss / 1024 / 1024
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
        else:
            cpu_percent = psutil.cpu_percent(interval=None)
            memory_info = psutil.virtual_memory()
            memory_mb = memory_info.used / 1024 / 1024

        record = {
            "timestamp": timestamp,
            "elapsed": time.time() - start_time,
            "cpu_percent": cpu_percent,
            "memory_mb": memory_mb
        }
        
        # Write incrementally
        with open(output_file, 'a') as f:
            f.write(json.dumps(record) + "\n")
        
        if int(time.time() - start_time) % 10 == 0:
            print(f"Recorded at {record['elapsed']:.1f}s. CPU: {cpu_percent}%, Mem: {memory_mb:.2f}MB")
        
        time.sleep(interval)

            
    except KeyboardInterrupt:
        print("Monitoring stopped by user.")
    except Exception as e:
        print(f"Error during monitoring: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pid", type=int, help="Process ID to monitor (optional, default system)")
    parser.add_argument("--duration", type=int, default=600, help="Duration in seconds")
    parser.add_argument("--interval", type=float, default=1.0, help="Interval in seconds")
    parser.add_argument("--output", type=str, default="resource_usage.json", help="Output JSON file")
    
    args = parser.parse_args()
    monitor(args.pid, args.duration, args.interval, args.output)
