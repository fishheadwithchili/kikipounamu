import csv

def generate():
    data = {}
    with open('/home/tiger/Projects/ASR_go_backend/tests/performance_data.csv') as f:
        reader = csv.DictReader(f)
        for row in reader:
            # pid = row['pid']
            label = row['name'] if row['name'] != 'unknown' else row['pid']
            if label not in data:
                data[label] = {'cpu': [], 'mem': []}
            data[label]['cpu'].append(float(row['cpu_percent']))
            data[label]['mem'].append(float(row['memory_mb']))

    # RQ Worker Charts
    if 'rq' in data:
        rq_cpu = data['rq']['cpu']
        rq_mem = data['rq']['mem']
        
        # Downsample to ~20 points
        step = max(1, len(rq_cpu)//20)
        rq_cpu_ds = rq_cpu[::step]
        rq_mem_ds = rq_mem[::step]
        
        print("### CPU Usage (RQ Worker)")
        print("```mermaid")
        print("xychart-beta")
        print('    title "RQ Worker CPU (%)"')
        print(f'    x-axis [{", ".join([str(i*step) for i in range(len(rq_cpu_ds))])}]')
        print('    y-axis "CPU %" 0 --> 100')
        print(f'    line [{", ".join([str(x) for x in rq_cpu_ds])}]')
        print("```")
        
        print("\n### Memory Usage (RQ Worker)")
        print("```mermaid")
        print("xychart-beta")
        print('    title "RQ Worker Memory (MB)"')
        print(f'    x-axis [{", ".join([str(i*step) for i in range(len(rq_mem_ds))])}]')
        print('    y-axis "MB" 0 --> 200')
        print(f'    line [{", ".join([str(x) for x in rq_mem_ds])}]')
        print("```")
    else:
        print("No RQ process data found.")

if __name__ == "__main__":
    generate()
