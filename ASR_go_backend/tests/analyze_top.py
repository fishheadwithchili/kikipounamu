import sys
import re
import collections

def ascii_chart(data, height=10):
    if not data:
        return ""
    
    min_val = min(data)
    max_val = max(data)
    range_val = max_val - min_val
    if range_val == 0: range_val = 1
    
    # Normalize to 0..height-1
    result = []
    
    # Create grid
    grid = [[' ' for _ in range(len(data))] for _ in range(height)]
    
    for x, val in enumerate(data):
        normalized = int((val - min_val) / range_val * (height - 1))
        # Clamp
        normalized = max(0, min(height-1, normalized))
        # Draw dot
        grid[height - 1 - normalized][x] = '*'
        
    lines = []
    # Y-Axis labels
    for i in range(height):
        label_val = max_val - (i / (height-1)) * range_val
        line = f"{label_val:6.1f} | " + "".join(grid[i])
        lines.append(line)
        
    lines.append("       " + "-" * len(data))
    return "\n".join(lines)

def parse_top(logfile):
    # PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
    # 782 tiger     20   0 13.5g   2.1g   1.2g S   0.0  27.4   0:35.32 uvicorn
    
    data = collections.defaultdict(lambda: {'cpu': [], 'mem': []})
    
    try:
        with open(logfile, 'r') as f:
            for line in f:
                line = line.strip()
                if not line: continue
                parts = line.split()
                # Check if line starts with PID (integer)
                if parts[0].isdigit():
                    pid = parts[0]
                    # top default format: PID USER ... %CPU %MEM ... COMMAND
                    # Index 8 is %CPU, 9 is %MEM?
                    # Let's verify top header: PID USER PR NI VIRT RES SHR S %CPU %MEM TIME+ COMMAND
                    # Indices: 0 1 2 3 4 5 6 7 8 9 10 11
                    try:
                        cpu = float(parts[8])
                        mem = float(parts[9])
                        cmd = parts[11] if len(parts) > 11 else "unknown"
                        
                        data[pid]['cpu'].append(cpu)
                        data[pid]['mem'].append(mem)
                        data[pid]['cmd'] = cmd
                    except (ValueError, IndexError):
                        pass
    except FileNotFoundError:
        print(f"File {logfile} not found")
        return

    print(f"Resource Usage Analysis ({logfile})")
    print("="*40)
    
    for pid, stats in data.items():
        cmd = stats.get('cmd', pid)
        cpu_avg = sum(stats['cpu']) / len(stats['cpu']) if stats['cpu'] else 0
        mem_avg = sum(stats['mem']) / len(stats['mem']) if stats['mem'] else 0
        cpu_max = max(stats['cpu']) if stats['cpu'] else 0
        mem_max = max(stats['mem']) if stats['mem'] else 0
        
        print(f"\nProcess {pid} ({cmd}):")
        print(f"Avg CPU: {cpu_avg:.1f}% (Max: {cpu_max:.1f}%)")
        print(f"Avg Mem: {mem_avg:.1f}% (Max: {mem_max:.1f}%)")
        
        if len(stats['cpu']) > 5:
            print("CPU Trend:")
            print(ascii_chart(stats['cpu']))
            print("Mem Trend:")
            print(ascii_chart(stats['mem']))

if __name__ == "__main__":
    parse_top(sys.argv[1])
