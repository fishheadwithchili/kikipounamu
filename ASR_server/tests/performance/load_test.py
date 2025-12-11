import argparse
import concurrent.futures
import time
import requests
import random
import os
import sys
from datetime import datetime
from pathlib import Path

# Add project root to path to import monitor
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from tests.performance.resource_monitor import ResourceMonitor
from tests.performance.audio_generator import generate_audio_if_needed

API_URL = "http://localhost:8000/api/v1"

def submit_task(audio_file: str):
    """Submit a single task"""
    url = f"{API_URL}/asr/submit"
    try:
        with open(audio_file, 'rb') as f:
            files = {'audio': (os.path.basename(audio_file), f, 'audio/wav')}
            start_time = time.time()
            resp = requests.post(url, files=files)
            resp.raise_for_status()
            data = resp.json()
            return data.get('task_id'), start_time
    except Exception as e:
        print(f"❌ Submit failed for {audio_file}: {e}")
        return None, None

def poll_result(task_id: str):
    """Poll for result"""
    url = f"{API_URL}/asr/result/{task_id}"
    while True:
        try:
            resp = requests.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if data['status'] == 'done':
                    return data
                elif data['status'] == 'failed':
                    return data
            time.sleep(0.5)
        except Exception as e:
            print(f"⚠️ Poll error for {task_id}: {e}")
            time.sleep(1)

def run_load_test(audio_files, concurrency, duration):
    """Run load test"""
    print(f"🚀 Starting load test with concurrency {concurrency} for {duration}s")
    print(f"📂 Audio files: {audio_files}")
    
    start_time = time.time()
    tasks = []
    completed = 0
    errors = 0
    latencies = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        while time.time() - start_time < duration:
            # Submit tasks up to concurrency limit
            active_futures = [f for f in tasks if not f.done()]
            if len(active_futures) < concurrency:
                audio = random.choice(audio_files)
                if not os.path.exists(audio):
                    print(f"⚠️ Test file not found: {audio}")
                    continue
                    
                future = executor.submit(simulate_client, audio)
                tasks.append(future)
            
            time.sleep(0.1)
            
        # Wait for remaining
        for future in concurrent.futures.as_completed(tasks):
            res = future.result()
            if res:
                completed += 1
                latencies.append(res['latency'])
            else:
                errors += 1
                
    print(f"✅ Load test finished.")
    print(f"Total Requests: {completed + errors}")
    print(f"Success: {completed}")
    print(f"Errors: {errors}")
    avg_latency = 0.0
    if latencies:
        avg_latency = sum(latencies)/len(latencies)
        print(f"Avg Latency: {avg_latency:.2f}s")
        
    # Save test report
    import json
    report = {
        "timestamp": datetime.now().isoformat(),
        "duration": duration,
        "concurrency": concurrency,
        "total_requests": completed + errors,
        "success": completed,
        "errors": errors,
        "avg_latency": round(avg_latency, 4),
        "throughput": round((completed + errors) / duration, 2)
    }
    with open("src/storage/test_report.json", "w") as f:
        json.dump(report, f, indent=2)
    print("📄 Report saved to src/storage/test_report.json")

def simulate_client(audio_file):
    """Full client flow: submit -> poll"""
    tid, start = submit_task(audio_file)
    if not tid:
        return None
    
    res = poll_result(tid)
    end = time.time()
    return {
        "task_id": tid,
        "latency": end - start,
        "status": res["status"]
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ASR Load Tester")
    parser.add_argument("--concurrency", type=int, default=5, help="Number of concurrent users")
    parser.add_argument("--duration", type=int, default=30, help="Test duration in seconds")
    parser.add_argument("--files", nargs="+", help="Audio files to use", required=True)
    
    args = parser.parse_args()
    
    # Start monitor
    mon = ResourceMonitor("src/storage/performance_stats.csv")
    mon.start()
    
    # Check and generate files if needed
    project_root = Path(__file__).parent.parent.parent
    source_audio = project_root / "tests/resources/test_audio_short.wav"
    generated_files = []
    
    print(f"🔍 Checking audio files...")
    for f in args.files:
        if generate_audio_if_needed(f, str(source_audio)):
            generated_files.append(f)

    try:
        run_load_test(args.files, args.concurrency, args.duration)
    finally:
        mon.stop()
        # Cleanup generated files
        if generated_files:
            print("\n🧹 Cleaning up temporary audio files...")
            for f in generated_files:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                        print(f"   - Removed {f}")
                except Exception as e:
                    print(f"   ⚠️ Failed to remove {f}: {e}")
