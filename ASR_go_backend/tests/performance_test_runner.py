#!/usr/bin/env python3
"""
Comprehensive Performance Test Runner
Tests OOM prevention and acceleration mechanisms
"""
import subprocess
import time
import sys
import requests
from pathlib import Path

# Add tests dir to path
sys.path.insert(0, str(Path(__file__).parent))

from pidstat_monitor import PidStatMonitor
from log_parser import LogParser

class PerformanceTestRunner:
    def __init__(self, audio_file, api_url="http://localhost:8000"):
        self.audio_file = Path(audio_file)
        self.api_url = api_url
        self.test_dir = Path(__file__).parent
        self.results_dir = self.test_dir / "results"
        self.results_dir.mkdir(exist_ok=True)
        
    def check_services(self):
        """Check if required services are running"""
        print("🔍 Checking services...")
        
        try:
            response = requests.get(f"{self.api_url}/api/v1/health", timeout=5)
            if response.status_code == 200:
                health = response.json()
                print(f"✅ ASR Server: {health.get('status')}")
                print(f"   - Model loaded: {health.get('model_loaded')}")
                print(f"   - Workers active: {health.get('workers_active')}")
                return True
            else:
                print(f"❌ ASR Server unhealthy: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Cannot reach ASR Server: {e}")
            print("💡 Please start services:")
            print("   1. cd /home/tiger/Projects/ASR_server")
            print("   2. uvicorn src.main:app --port 8000")
            print("   3. (in another terminal) rq worker asr-queue")
            return False
    
    def submit_task(self):
        """Submit audio file via HTTP API"""
        print(f"\n📤 Submitting task: {self.audio_file.name}")
        
        if not self.audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {self.audio_file}")
        
        with open(self.audio_file, 'rb') as f:
            files = {'audio': (self.audio_file.name, f, 'audio/wav')}
            response = requests.post(
                f"{self.api_url}/api/v1/asr/submit",
                files=files,
                timeout=30
            )
        
        if response.status_code != 200:
            raise Exception(f"Submit failed: {response.status_code} {response.text}")
        
        result = response.json()
        task_id = result['task_id']
        print(f"✅ Task submitted: {task_id}")
        print(f"   - Status: {result['status']}")
        print(f"   - Queue position: {result.get('position', 'N/A')}")
        
        return task_id
    
    def wait_for_completion(self, task_id, timeout=600):
        """Poll for task completion"""
        print(f"\n⏳ Waiting for task completion (timeout: {timeout}s)...")
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            response = requests.get(
                f"{self.api_url}/api/v1/asr/result/{task_id}",
                timeout=5
            )
            
            if response.status_code != 200:
                print(f"❌ Error checking status: {response.status_code}")
                break
            
            result = response.json()
            status = result['status']
            
            if status == 'done':
                elapsed = time.time() - start_time
                print(f"✅ Task completed in {elapsed:.1f}s")
                print(f"   - Text length: {len(result.get('text', ''))}")
                return result
            elif status == 'failed':
                print(f"❌ Task failed: {result.get('error')}")
                return result
            
            # Still processing
            time.sleep(2)
        
        print(f"⏱️  Timeout after {timeout}s")
        return None
    
    def run_test(self):
        """Run complete performance test"""
        print("=" * 60)
        print("🚀 Performance Test Runner")
        print("=" * 60)
        
        # Check services
        if not self.check_services():
            return False
        
        # Prepare output files
        pidstat_log = self.results_dir / "pidstat.log"
        
        # Start monitoring
        with PidStatMonitor(pidstat_log, interval=1):
            # Submit task
            task_id = self.submit_task()
            
            # Wait for completion
            result = self.wait_for_completion(task_id)
            
            if not result:
                print("❌ Test failed to complete")
                return False
        
        # Parse logs and generate report
        print("\n📊 Generating report...")
        parser = LogParser()
        parser.parse_pidstat(pidstat_log)
        parser.parse_worker_logs()
        
        # Generate report
        report_file = self.results_dir / "performance_report.md"
        with open(report_file, 'w') as f:
            f.write("# Performance Test Report\n\n")
            f.write(f"**Audio File:** `{self.audio_file.name}`\n\n")
            f.write(parser.generate_summary())
            f.write("\n\n")
            f.write(parser.generate_mermaid_charts())
            f.write("\n\n")
            f.write(parser.generate_text_charts())
        
        print(f"✅ Report saved: {report_file}")
        print("\n" + "=" * 60)
        print("✅ Test Complete!")
        print("=" * 60)
        
        return True

if __name__ == "__main__":
    # Default to long audio
    audio_file = Path("/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav")
    
    if len(sys.argv) > 1:
        audio_file = Path(sys.argv[1])
    
    runner = PerformanceTestRunner(audio_file)
    success = runner.run_test()
    
    sys.exit(0 if success else 1)
