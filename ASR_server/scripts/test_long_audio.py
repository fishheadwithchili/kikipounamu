import requests
import time
import sys
import os

def run_test(audio_file, url="http://localhost:8000/api/v1/asr/submit"):
    if not os.path.exists(audio_file):
        print(f"File not found: {audio_file}")
        sys.exit(1)
        
    print(f"Submitting {audio_file} to {url}...")
    
    try:
        with open(audio_file, 'rb') as f:
            files = {'audio': (os.path.basename(audio_file), f, 'audio/wav')}
            start_time = time.time()
            response = requests.post(url, files=files, data={'batch_size': 500})
            
        print(f"Submission status: {response.status_code}")
        if response.status_code != 200:
            print(f"Error: {response.text}")
            sys.exit(1)
            
        data = response.json()
        task_id = data['task_id']
        print(f"Task ID: {task_id}")
        
        # Poll for result
        while True:
            res_url = f"http://localhost:8000/api/v1/asr/result/{task_id}"
            res = requests.get(res_url)
            if res.status_code == 200:
                res_data = res.json()
                status = res_data['status']
                print(f"Status: {status}")
                if status == 'done':
                    end_time = time.time()
                    print("Transcription complete!")
                    print(f"Total time: {end_time - start_time:.2f}s")
                    print(f"Result length: {len(res_data.get('text', ''))} chars")
                    # Save result text
                    with open("transcription_result.txt", "w") as f:
                        f.write(res_data.get('text', ''))
                    break
                elif status == 'failed':
                    print(f"Failed: {res_data.get('error')}")
                    break
            else:
                print(f"Error polling: {res.status_code}")
            
            time.sleep(2)
            
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_long_audio.py <audio_file>")
        sys.exit(1)
    
    run_test(sys.argv[1])
