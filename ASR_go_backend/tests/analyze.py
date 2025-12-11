import csv
import sys
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

def analyze(csv_file):
    stats = collections.defaultdict(lambda: {'cpu': [], 'mem': []})
    
    with open(csv_file, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row['pid']
            try:
                cpu = float(row['cpu_percent'])
                mem = float(row['memory_mb'])
                stats[pid]['cpu'].append(cpu)
                stats[pid]['mem'].append(mem)
                stats[pid]['name'] = row['name']
            except:
                pass
                
    print(f"Analysis for {csv_file}")
    print("="*40)
    
    for pid, data in stats.items():
        name = data.get('name', pid)
        cpu_avg = sum(data['cpu'])/len(data['cpu']) if data['cpu'] else 0
        mem_avg = sum(data['mem'])/len(data['mem']) if data['mem'] else 0
        mem_max = max(data['mem']) if data['mem'] else 0
        
        print(f"\nProcess: {name} (PID {pid})")
        print(f"Avg CPU: {cpu_avg:.1f}%")
        print(f"Avg Mem: {mem_avg:.1f} MB (Max: {mem_max:.1f} MB)")
        
        if len(data['mem']) > 5:
            print("Memory Usage Trend:")
            print(ascii_chart(data['mem']))

if __name__ == "__main__":
    analyze(sys.argv[1])
