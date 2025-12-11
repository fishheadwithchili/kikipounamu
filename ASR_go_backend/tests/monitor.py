import time
import argparse
import csv
import os
import sys
import psutil
from datetime import datetime

class ProcessMonitor:
    def __init__(self, root_pids):
        self.root_pids = [int(p) for p in root_pids]
        # Cache of pid -> psutil.Process
        self.proc_cache = {}
        
        # Populate initial cache for roots
        for pid in self.root_pids:
            self._get_or_create_proc(pid)

    def _get_or_create_proc(self, pid):
        if pid in self.proc_cache:
            return self.proc_cache[pid]
        
        try:
            p = psutil.Process(pid)
            # Initialize CPU counter (first call returns 0)
            p.cpu_percent(interval=None)
            self.proc_cache[pid] = p
            return p
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return None

    def get_stats(self):
        # 1. Identify all target PIDs (roots + children)
        # We group stats by ROOT pid to keep the chart readable?
        # Or just list all significant processes?
        # Let's aggregate by ROOT process name.
        
        results = []
        
        for root_pid in self.root_pids:
            root_proc = self._get_or_create_proc(root_pid)
            if not root_proc or not root_proc.is_running():
                continue
            
            # Get main name
            try:
                root_name = root_proc.name()
                cmdline = root_proc.cmdline()
                # disambiguate python processes?
                if "python" in root_name and len(cmdline) > 1:
                    # e.g. "uvicorn" or "rq"
                    # But basic name is fine for now
                    pass
            except:
                root_name = "unknown"

            # Find all children
            try:
                children = root_proc.children(recursive=True)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                children = []
            
            all_procs_curr = [root_proc] + children
            
            total_cpu = 0.0
            total_mem = 0.0
            
            for p in all_procs_curr:
                # Ensure we have a cached object for this specific PID
                # to maintain the cpu_percent state
                cached_p = self._get_or_create_proc(p.pid)
                if cached_p:
                    try:
                        c = cached_p.cpu_percent(interval=None)
                        m = cached_p.memory_info().rss / 1024 / 1024
                        total_cpu += c
                        total_mem += m
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
            
            results.append({
                'pid': root_pid,
                'name': root_name,
                'cpu_percent': round(total_cpu, 1),
                'memory_mb': round(total_mem, 1)
            })
            
        # Clean up cache? (Remove dead pids)
        # For simplicity, we just leave them. The map won't grow infinitely in this short test.
        
        return results

def monitor(pids, output_file, interval=1.0):
    print(f"Monitoring PIDs: {pids} -> {output_file}")
    pm = ProcessMonitor(pids)

    with open(output_file, 'w', newline='') as csvfile:
        fieldnames = ['timestamp', 'pid', 'name', 'cpu_percent', 'memory_mb']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()

        try:
            while True:
                time.sleep(interval)
                timestamp = datetime.now().isoformat()
                
                current_stats = pm.get_stats()
                
                for stat in current_stats:
                    stat['timestamp'] = timestamp
                    writer.writerow(stat)
                
                csvfile.flush()

        except KeyboardInterrupt:
            print("Monitoring stopped.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python monitor.py <output_file> <pid1> <pid2> ...")
        sys.exit(1)
    
    output_file = sys.argv[1]
    pids = sys.argv[2:]
    
    monitor(pids, output_file)
