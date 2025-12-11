import subprocess
import time
import os
import signal
import sys
import matplotlib.pyplot as plt
import csv
from datetime import datetime

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # ASR_go_backend
SERVER_DIR = os.path.abspath(os.path.join(BASE_DIR, "../ASR_server"))
CLIENT_SCRIPT = os.path.join(BASE_DIR, "test_client.py")
MONITOR_SCRIPT = os.path.join(BASE_DIR, "tests/monitor.py")
RESULT_CSV = os.path.join(BASE_DIR, "tests/performance_data.csv")
PLOT_FILE = os.path.join(BASE_DIR, "tests/performance_chart.png")

def start_process(cmd, cwd, log_file):
    print(f"Starting: {' '.join(cmd)}")
    with open(log_file, "w") as f:
        return subprocess.Popen(cmd, cwd=cwd, stdout=f, stderr=subprocess.STDOUT)

def main():
    procs = []
    
    try:
        # 1. Start Redis
        # Check if running first? Assuming no based on prior check.
        # using --daemonize no to keep it as child process or yes for background?
        # Child process easier to kill.
        redis_proc = start_process(["redis-server", "--port", "6379"], BASE_DIR, "redis.log")
        procs.append(("redis", redis_proc))
        time.sleep(2) # Wait for redis

        # 2. Start ASR Server (Python)
        server_env = os.environ.copy()
        server_env["PYTHONPATH"] = SERVER_DIR
        # Assuming required env vars are set or using defaults
        server_proc = start_process(["uvicorn", "src.main:app", "--port", "8000"], SERVER_DIR, "server.log")
        procs.append(("server", server_proc))
        time.sleep(5) # Wait for server

        # 3. Start RQ Worker
        worker_proc = start_process(["rq", "worker", "asr-queue"], SERVER_DIR, "worker.log")
        procs.append(("worker", worker_proc))
        
        # 4. Start Go Backend
        go_proc = start_process(["./asr-backend"], BASE_DIR, "backend.log")
        procs.append(("backend", go_proc))
        time.sleep(10) # Wait for init

        # 5. Start Monitor
        pids = [str(p.pid) for _, p in procs]
        monitor_cmd = ["python3", MONITOR_SCRIPT, RESULT_CSV] + pids
        # Monitor runs in background, we kill it later
        monitor_proc = subprocess.Popen(monitor_cmd)
        
        print("System started. Running client test...")
        # 6. Run Client
        start_time = time.time()
        client_proc = subprocess.run(["python3", CLIENT_SCRIPT], check=True)
        end_time = time.time()
        print(f"Client test finished in {end_time - start_time:.2f}s")
        
        # Allow some time for wrap up / flushing
        time.sleep(5)

    except Exception as e:
        print(f"Error occurred: {e}")
    finally:
        print("stopping processes...")
        # Stop Monitor
        if 'monitor_proc' in locals():
            monitor_proc.terminate()
            monitor_proc.wait()

        # Stop Services (Reverse order)
        for name, p in reversed(procs):
            print(f"Stopping {name}...")
            p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        
        print("Generating Plot...")
        generate_plot()

def generate_plot():
    if not os.path.exists(RESULT_CSV):
        print("No data to plot")
        return

    timestamps = []
    cpu_data = {}
    mem_data = {}

    with open(RESULT_CSV, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = row['timestamp'] # You might want to parse this to datetime objects or just use index
            # Simple index for x-axis
            
            name = row['name']
            # De-duplicate names if multiple workers? unique PID mapping better
            # Group by 'name' (e.g. redis-server, python, main)
            # The monitor.py returns process name from /proc/pid/status which might be generic 'python' or 'main'
            
            # Helper to make names more readable based on our start order knowledge?
            # monitor.py records 'pid' and 'name'.
            
            label = f"{name}-{row['pid']}"
            
            if label not in cpu_data:
                cpu_data[label] = []
                mem_data[label] = []
            
            current_len = len(cpu_data[label])
            # Align data? simpler: just bucket by time?
            # For this simple script, just appending.
            # Assuming monitor writes lines sequentially per tick.
            # Actually, monitor writes all PIDs per tick.
            # Let's just plot points.
            
            cpu_data[label].append(float(row['cpu_percent']))
            mem_data[label].append(float(row['memory_mb']))

    # Plotting
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=False)
    
    for label, values in cpu_data.items():
        ax1.plot(values, label=label)
    ax1.set_title("CPU Usage (%)")
    ax1.set_ylabel("%")
    ax1.legend()
    ax1.grid(True)

    for label, values in mem_data.items():
        ax2.plot(values, label=label)
    ax2.set_title("Memory Usage (MB)")
    ax2.set_ylabel("MB")
    ax2.legend()
    ax2.grid(True)

    plt.tight_layout()
    plt.savefig(PLOT_FILE)
    print(f"Plot saved to {PLOT_FILE}")

if __name__ == "__main__":
    main()
