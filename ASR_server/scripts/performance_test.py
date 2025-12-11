
import os
import sys
import time
import requests
import argparse
from pathlib import Path

def run_performance_test(file_path, url, polling_interval=0.5):
    """
    Submits an audio file to the ASR server and measures performance.
    """
    if not os.path.exists(file_path):
        print(f"❌ Error: File not found: {file_path}")
        return

    print(f"🚀 Starting Performance Test")
    print(f"📁 Audio File: {file_path}")
    print(f"🌐 Server URL: {url}")
    print("-" * 50)

    # 1. Submit Task
    submit_url = f"{url}/api/v1/asr/submit"
    
    start_time = time.time()
    try:
        with open(file_path, 'rb') as f:
            files = {'audio': (os.path.basename(file_path), f, 'audio/wav')}
            response = requests.post(submit_url, files=files)
            
        if response.status_code != 200:
            print(f"❌ Submit Failed: {response.text}")
            return
            
        submit_data = response.json()
        task_id = submit_data['task_id']
        upload_time = time.time() - start_time
        print(f"✅ Task Submitted: {task_id}")
        print(f"⏱️  Upload Time: {upload_time:.4f}s")
        print(f"📊 Queue Position: {submit_data.get('position', 'N/A')}")
        
    except Exception as e:
        print(f"❌ Connection Error: {e}")
        return

    # 2. Poll for Result
    result_url = f"{url}/api/v1/asr/result/{task_id}"
    processing_start_time = time.time()
    
    while True:
        try:
            response = requests.get(result_url)
            if response.status_code == 200:
                result = response.json()
                status = result['status']
                
                if status == 'done':
                    total_time = time.time() - start_time
                    processing_time = time.time() - processing_start_time # Time from submit success to done
                    
                    print("-" * 50)
                    print(f"✅ Task Completed")
                    print(f"📝 Text: {result.get('text', '')}")
                    print("-" * 50)
                    print(f"⏱️  Total Client Wait: {total_time:.4f}s")
                    print(f"⏱️  Processing Time (Client view): {processing_time:.4f}s")
                    
                    if 'duration' in result:
                        audio_duration = result['duration']
                        rtf = processing_time / audio_duration if audio_duration > 0 else 0
                        print(f"⏱️  Audio Duration: {audio_duration:.2f}s")
                        print(f"🚀 Real-Time Factor (RTF): {rtf:.4f} (Lower is better)")
                    else:
                        print("⚠️  Audio duration not returned by server")
                        
                    break
                    
                elif status == 'failed':
                    print(f"❌ Task Failed: {result.get('error', 'Unknown error')}")
                    break
                else:
                    # status is queued or processing
                    sys.stdout.write(f"\r⏳ Status: {status}...")
                    sys.stdout.flush()
                    time.sleep(polling_interval)
            else:
                 print(f"❌ Poll Error: {response.status_code}")
                 time.sleep(polling_interval)

        except KeyboardInterrupt:
            print("\n🛑 Test Cancelled")
            break
        except Exception as e:
            print(f"\n❌ Polling Error: {e}")
            break

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ASR Performance Test")
    parser.add_argument("--file", default="/home/tiger/Projects/ASR_server/src/input/20251201_0851_recording.wav", help="Path to audio file")
    parser.add_argument("--url", default="http://localhost:8000", help="ASR Server URL")
    
    args = parser.parse_args()
    
    run_performance_test(args.file, args.url)
