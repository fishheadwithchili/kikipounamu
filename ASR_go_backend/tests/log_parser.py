#!/usr/bin/env python3
"""
Log Parser and Chart Generator
Parses pidstat logs and worker logs to generate Mermaid charts
"""
import re
import csv
from pathlib import Path
from collections import defaultdict

class LogParser:
    def __init__(self):
        self.pidstat_data = defaultdict(list)
        self.worker_metrics = []
        
    def _text_bar(self, value, max_val, width=20):
        """Generate ASCII progress bar"""
        if max_val == 0:
            return ""
        filled = int((value / max_val) * width)
        return "█" * filled + "░" * (width - filled)

    def parse_pidstat(self, log_file):
        """Parse pidstat output"""
        print(f"📖 Parsing pidstat log: {log_file}")
        
        with open(log_file) as f:
            lines = f.readlines()
        
        # pidstat format: TIME UID PID %usr %system %guest %CPU CPU Command
        # or with -r: TIME UID PID minflt/s majflt/s VSZ RSS %MEM Command
        
        for line in lines:
            # Skip headers and comments
            if line.startswith('#') or 'Command' in line or not line.strip():
                continue
            
            # Split by whitespace, handling multiple spaces
            parts = line.split()
            # On some systems, pidstat headers might vary. 
            # Standard Linux: Time, UID, PID, %usr, %system, %guest, %wait, %CPU, CPU, Command
            # Index of %CPU is usually 7 (0-indexed) or similar. 
            # Let's try to find the index based on the header if implemented, but here we'll be robust.
            
            try:
                # Find the column ending with % or use fixed index 7 (%CPU)
                cpu_pct = 0.0
                command = parts[-1]
                
                # Heuristic: find the first float-like value > 1 that isn't PID/UID
                # Or just grab the %CPU column which is usually the last number before CPU core ID and Command
                # In the log provided: 22:32:20 1000 20768 139.60 ... 153.47 15 ... rq
                # Columns: Time(0) UID(1) PID(2) %usr(3) %sys(4) %guest(5) %wait(6) %CPU(7) CPU(8) ...
                
                if len(parts) >= 9:
                     # Usually %CPU is at index 7
                     cpu_pct = float(parts[7].replace('%', ''))
                elif len(parts) >= 7:
                     # Fallback
                     cpu_pct = float(parts[6].replace('%', ''))
                
                # Filter for relevant processes (python3 matches uvicorn and worker)
                if any(x in command for x in ['python', 'uvicorn', 'rq', 'redis', 'asr-backend']):
                    self.pidstat_data[command].append({
                        'time': parts[0],
                        'cpu': cpu_pct
                    })
            except (ValueError, IndexError):
                continue
        
        print(f"✅ Parsed {sum(len(v) for v in self.pidstat_data.values())} pidstat entries")
        
    def parse_worker_logs(self, log_pattern="src/storage/logs/asr_worker.log"):
        """Parse worker logs for resource metrics"""
        print(f"📖 Parsing worker logs: {log_pattern}")
        
        # Pattern: Worker task=XXX status=completed ... rtf=0.123 mem_start=50.0MB ...
        pattern = re.compile(
            r'task=(\S+).*rtf=([\d.]+).*'
            r'mem_start=([\d.]+)MB.*mem_end=([\d.]+)MB.*'
            r'mem_delta=([+-]?[\d.]+)MB.*mem_peak=([\d.]+)MB'
        )
        
        log_dir = Path("/home/tiger/Projects/ASR_server")
        files = list(log_dir.glob(log_pattern))
        if not files:
             # Try absolute path directly if pattern is absolute
             files = list(Path("/").glob(log_pattern.lstrip("/")))
        
        for log_file in files:
            with open(log_file) as f:
                for line in f:
                    match = pattern.search(line)
                    if match:
                        task_id, rtf, mem_start, mem_end, mem_delta, mem_peak = match.groups()
                        self.worker_metrics.append({
                            'task_id': task_id,
                            'rtf': float(rtf),
                            'mem_start': float(mem_start),
                            'mem_end': float(mem_end),
                            'mem_delta': float(mem_delta),
                            'mem_peak': float(mem_peak)
                        })
        
        print(f"✅ Parsed {len(self.worker_metrics)} worker task metrics")
    
    def generate_mermaid_charts(self):
        """Generate Mermaid chart code"""
        charts = []
        
        # CPU Chart from pidstat
        if self.pidstat_data:
            # Use python process data if available
            python_data = None
            for key in self.pidstat_data:
                if 'python' in key or 'uvicorn' in key or 'rq' in key:
                    python_data = self.pidstat_data[key]
                    break
            
            if python_data:
                # Downsample to ~30 points
                step = max(1, len(python_data) // 30)
                sampled = python_data[::step]
                
                cpu_values = [d['cpu'] for d in sampled]
                x_labels = list(range(0, len(sampled) * step, step))
                x_labels_str = ', '.join([f'"{x}"' for x in x_labels])
                
                charts.append(f"""### System CPU Usage (Python Processes)
```mermaid
xychart-beta
    title "CPU Usage (%)"
    x-axis [{x_labels_str}]
    y-axis "CPU %" 0 --> 100
    line [{', '.join(map(str, cpu_values))}]
```
""")
        
        # Worker Memory Chart
        if self.worker_metrics:
            x_labels = [f"T{i+1}" for i in range(len(self.worker_metrics))]
            x_labels_str = ', '.join([f'"{x}"' for x in x_labels])
            
            charts.append(f"""### Worker Memory Usage
```mermaid
xychart-beta
    title "Memory Peak per Task (MB)"
    x-axis [{x_labels_str}]
    y-axis "MB" 0 --> 500
    line [{', '.join([str(m['mem_peak']) for m in self.worker_metrics])}]
```
""")
        
        # RTF Chart
        if self.worker_metrics:
            rtf_values = [m['rtf'] for m in self.worker_metrics]
            x_labels = [f"T{i+1}" for i in range(len(rtf_values))]
            x_labels_str = ', '.join([f'"{x}"' for x in x_labels])
            
            charts.append(f"""### Real-Time Factor (RTF)
> [!NOTE]
> RTF < 1.0 means faster than real-time (acceleration working!)

```mermaid
xychart-beta
    title "RTF per Task"
    x-axis [{x_labels_str}]
    y-axis "RTF" 0 --> 2
    line [{', '.join([f'{v:.3f}' for v in rtf_values])}]
```

**Average RTF:** {sum(rtf_values)/len(rtf_values):.3f}
""")
        
        return '\n\n'.join(charts)

    def generate_text_charts(self):
        """Generate ASCII text charts for compatibility"""
        charts = []
        charts.append("\n### Text-based Charts (Backup)\n")
        
        # Worker Memory Text Chart
        if self.worker_metrics:
            charts.append("#### Memory Peak (MB)")
            charts.append("```")
            max_mem = max((m['mem_peak'] for m in self.worker_metrics), default=1)
            for i, m in enumerate(self.worker_metrics):
                val = m['mem_peak']
                bar = self._text_bar(val, 500) # Fixed scale to 500MB
                charts.append(f"T{i+1}: {bar} {val:.1f} MB")
            charts.append("```\n")

        # RTF Text Chart
        if self.worker_metrics:
            charts.append("#### Real-Time Factor (RTF)")
            charts.append("```")
            for i, m in enumerate(self.worker_metrics):
                val = m['rtf']
                bar = self._text_bar(val, 2.0) # Fixed scale to 2.0
                charts.append(f"T{i+1}: {bar} {val:.3f}")
            charts.append("```\n")
            
        return '\n'.join(charts)
    
    def generate_summary(self):
        """Generate text summary"""
        summary = []
        
        summary.append("## Performance Summary\n")
        
        if self.worker_metrics:
            avg_rtf = sum(m['rtf'] for m in self.worker_metrics) / len(self.worker_metrics)
            max_mem_peak = max(m['mem_peak'] for m in self.worker_metrics)
            avg_mem_delta = sum(m['mem_delta'] for m in self.worker_metrics) / len(self.worker_metrics)
            
            summary.append(f"- **Tasks Processed:** {len(self.worker_metrics)}")
            summary.append(f"- **Average RTF:** {avg_rtf:.3f} {'✅ (Faster than real-time!)' if avg_rtf < 1.0 else '⚠️  (Slower than real-time)'}")
            summary.append(f"- **Peak Memory (max):** {max_mem_peak:.1f} MB")
            summary.append(f"- **Avg Memory Delta:** {avg_mem_delta:+.1f} MB {'✅ (Stable)' if abs(avg_mem_delta) < 10 else '⚠️  (Growing)'}")
        
        return '\n'.join(summary)

if __name__ == "__main__":
    parser = LogParser()
    # Test with dummy data
    print("LogParser ready for use")
