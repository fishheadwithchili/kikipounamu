#!/usr/bin/env python3
"""
PidStat Monitoring Wrapper
Captures system-wide resource usage during tests
"""
import subprocess
import time
import signal
import sys
from pathlib import Path

class PidStatMonitor:
    def __init__(self, output_file, interval=1):
        self.output_file = output_file
        self.interval = interval
        self.process = None
        
    def start(self):
        """Start pidstat in background"""
        print(f"📊 Starting pidstat monitoring -> {self.output_file}")
        # pidstat -u -r -h -p ALL interval
        # -u: CPU usage
        # -r: Memory usage
        # -h: Human-readable
        # -p ALL: All processes
        cmd = [
            'pidstat',
            '-u',      # CPU
            '-r',      # Memory
            '-h',      # Human-readable
            '-p', 'ALL',  # All processes
            str(self.interval)
        ]
        
        with open(self.output_file, 'w') as f:
            self.process = subprocess.Popen(
                cmd,
                stdout=f,
                stderr=subprocess.STDOUT
            )
        
        # Give it a moment to start
        time.sleep(0.5)
        print(f"✅ pidstat started (PID: {self.process.pid})")
        
    def stop(self):
        """Stop pidstat"""
        if self.process:
            print(f"🛑 Stopping pidstat...")
            self.process.send_signal(signal.SIGINT)
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            print("✅ pidstat stopped")
            
    def __enter__(self):
        self.start()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()

if __name__ == "__main__":
    # Test usage
    import time
    
    output = Path("test_pidstat.log")
    
    with PidStatMonitor(output):
        print("Monitoring for 5 seconds...")
        time.sleep(5)
    
    print(f"Log saved to {output}")
