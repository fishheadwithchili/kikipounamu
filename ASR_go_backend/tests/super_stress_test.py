#!/usr/bin/env python3
"""
Memory Leak Verification and Concurrency Stress Test

Tests:
1. Memory leak fix verification (short + long audio)
2. Concurrency limit discovery with crash-safe real-time logging

Design:
- Uses JSON Lines (JSONL) format for crash-safe incremental writes
- Each result written immediately after task completion
- Implements QueueHandler for async logging to prevent blocking
- Monitors Worker RSS memory after each test
"""

import json
import logging
import logging.handlers
import os
import queue
import signal
import sys
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional, List

import psutil
import requests

# ====================== Configuration ======================

API_URL = "http://localhost:8000/api/v1/asr"
SHORT_AUDIO = "/home/tiger/Projects/ASR_pc_front/recording/20251207_1033_recording.wav"
LONG_AUDIO_1H = "/home/tiger/Projects/ASR_pc_front/recording/super_long_1h.wav"
LONG_AUDIO_1_5H = "/home/tiger/Projects/ASR_pc_front/recording/super_long_1.5h.wav"
RESULTS_DIR = Path("/home/tiger/Projects/ASR_go_backend/tests/results")
WORKER_PROCESS_NAME = "rq worker"

# Concurrency test configuration
CONCURRENCY_START = 1
CONCURRENCY_STEP = 1
MAX_WAIT_SECONDS = 3600  # 60 minutes timeout (just to be safe for 1.5h audio)

# Resource monitoring
RESOURCE_MONITOR_INTERVAL = 1.0  # Sample every 1 second



# ====================== Data Models ======================

@dataclass
class TestResult:
    """Single test execution result"""
    test_id: str
    timestamp: str
    audio_file: str
    audio_size_mb: float
    concurrency: int
    task_id: Optional[str]
    status: str  # success, failed, timeout
    processing_time: Optional[float]
    rtf: Optional[float]
    worker_rss_before_mb: Optional[float]
    worker_rss_after_mb: Optional[float]
    worker_rss_delta_mb: Optional[float]
    error: Optional[str]


# ====================== Crash-Safe Logging ======================

class CrashSafeLogger:
    """Implements immediate-flush JSONL logging with async handler"""
    
    def __init__(self, output_file: Path):
        self.output_file = output_file
        self.output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Create queue for async logging
        self.log_queue = queue.Queue(-1)
        
        # File handler with immediate flush
        file_handler = logging.FileHandler(output_file, mode='a')
        file_handler.setLevel(logging.INFO)
        
        # Queue listener in separate thread
        self.queue_listener = logging.handlers.QueueListener(
            self.log_queue, file_handler, respect_handler_level=True
        )
        self.queue_listener.start()
        
        # Logger setup
        self.logger = logging.getLogger('stress_test')
        self.logger.setLevel(logging.INFO)
        self.logger.addHandler(logging.handlers.QueueHandler(self.log_queue))
        
        # Also log to console
        console = logging.StreamHandler()
        console.setLevel(logging.INFO)
        self.logger.addHandler(console)
    
    def log_result(self, result: TestResult):
        """Write result as JSON line (crash-safe)"""
        json_line = json.dumps(asdict(result), ensure_ascii=False)
        self.logger.info(json_line)
    
    def shutdown(self):
        """Ensure all logs are flushed"""
        self.queue_listener.stop()
        logging.shutdown()


# ====================== System Resource Monitor ======================

@dataclass
class ResourceSample:
    """Single resource usage sample"""
    timestamp: str
    elapsed_seconds: float
    process_name: str
    pid: int
    cpu_percent: float
    memory_rss_mb: float
    memory_percent: float


class SystemResourceMonitor:
    """
    Continuous system resource monitoring in background thread
    Records CPU and memory usage for all relevant processes
    """
    
    def __init__(self, output_csv: Path):
        self.output_csv = output_csv
        self.output_csv.parent.mkdir(parents=True, exist_ok=True)
        
        self.monitoring = False
        self.monitor_thread = None
        self.start_time = None
        self.samples: List[ResourceSample] = []
        
        # Process name patterns to monitor
        self.process_patterns = [
            'rq worker',      # RQ Worker
            'uvicorn',        # Python API Server
            'asr-backend',    # Go Backend (if exists)
        ]
        
        # Write CSV header
        with open(self.output_csv, 'w') as f:
            f.write('timestamp,elapsed_seconds,process_name,pid,cpu_percent,memory_rss_mb,memory_percent\n')
    
    def _get_monitored_processes(self) -> List[psutil.Process]:
        """Find all processes matching our patterns"""
        processes = []
        
        for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
            try:
                cmdline = ' '.join(proc.info['cmdline'] or [])
                
                for pattern in self.process_patterns:
                    if pattern in cmdline:
                        processes.append(proc)
                        break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return processes
    
    def _sample_resources(self):
        """Sample resource usage once"""
        timestamp = datetime.now().isoformat()
        elapsed = time.time() - self.start_time
        
        processes = self._get_monitored_processes()
        
        for proc in processes:
            try:
                # Get process info
                cpu_percent = proc.cpu_percent(interval=0.1)
                mem_info = proc.memory_info()
                mem_percent = proc.memory_percent()
                
                # Create sample
                sample = ResourceSample(
                    timestamp=timestamp,
                    elapsed_seconds=round(elapsed, 2),
                    process_name=proc.name(),
                    pid=proc.pid,
                    cpu_percent=round(cpu_percent, 2),
                    memory_rss_mb=round(mem_info.rss / 1024 / 1024, 2),
                    memory_percent=round(mem_percent, 2)
                )
                
                self.samples.append(sample)
                
                # Write to CSV immediately (crash-safe)
                with open(self.output_csv, 'a') as f:
                    f.write(f"{sample.timestamp},{sample.elapsed_seconds},"
                           f"{sample.process_name},{sample.pid},"
                           f"{sample.cpu_percent},{sample.memory_rss_mb},"
                           f"{sample.memory_percent}\n")
                
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
    
    def _monitor_loop(self):
        """Background monitoring loop"""
        while self.monitoring:
            self._sample_resources()
            time.sleep(RESOURCE_MONITOR_INTERVAL)
    
    def start(self):
        """Start monitoring in background thread"""
        if self.monitoring:
            return
        
        print(f"📊 Starting resource monitoring -> {self.output_csv}")
        self.start_time = time.time()
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self.monitor_thread.start()
        print(f"✅ Resource monitor started (sampling every {RESOURCE_MONITOR_INTERVAL}s)")
    
    def stop(self):
        """Stop monitoring"""
        if not self.monitoring:
            return
        
        print(f"🛑 Stopping resource monitor...")
        self.monitoring = False
        if self.monitor_thread:
            self.monitor_thread.join(timeout=5)
        print(f"✅ Resource monitor stopped ({len(self.samples)} samples collected)")



def get_worker_pid() -> Optional[int]:
    """Find RQ worker process ID"""
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info['cmdline'] or [])
            if 'rq worker' in cmdline and 'asr-queue' in cmdline:
                return proc.info['pid']
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return None


def get_worker_memory(pid: int) -> float:
    """Get Worker RSS memory in MB"""
    try:
        proc = psutil.Process(pid)
        return proc.memory_info().rss / 1024 / 1024
    except psutil.NoSuchProcess:
        return 0.0


def submit_task(audio_path: str) -> Optional[str]:
    """Submit ASR task and return task_id"""
    try:
        with open(audio_path, 'rb') as f:
            files = {'audio': (Path(audio_path).name, f, 'audio/wav')}
            response = requests.post(f"{API_URL}/submit", files=files, timeout=30)
        
        if response.status_code == 200:
            return response.json().get('task_id')
        else:
            print(f"❌ Submit failed: {response.status_code} - {response.text}")
            return None
    except Exception as e:
        print(f"❌ Submit exception: {e}")
        return None


def poll_result(task_id: str, timeout: int = MAX_WAIT_SECONDS) -> dict:
    """Poll for task result with timeout"""
    start = time.time()
    while time.time() - start < timeout:
        try:
            response = requests.get(f"{API_URL}/result/{task_id}", timeout=10)
            if response.status_code == 200:
                data = response.json()
                status = data.get('status')
                
                if status == 'done':
                    return {'status': 'success', 'data': data}
                elif status == 'failed':
                    return {'status': 'failed', 'error': data.get('error', 'Unknown error')}
                # Still queued or processing, continue polling
        except Exception as e:
            print(f"⚠️  Poll error: {e}")
        
        time.sleep(2)
    
    return {'status': 'timeout', 'error': f'Timeout after {timeout}s'}


# ====================== Test Executors ======================

def run_single_test(
    audio_path: str,
    concurrency: int,
    worker_pid: int,
    logger: CrashSafeLogger
) -> TestResult:
    """Execute single test and return result"""
    
    test_id = f"{Path(audio_path).stem}_c{concurrency}_{int(time.time())}"
    audio_size_mb = Path(audio_path).stat().st_size / 1024 / 1024
    
    # Measure worker memory before
    rss_before = get_worker_memory(worker_pid)
    
    # Submit task
    start_time = time.time()
    task_id = submit_task(audio_path)
    
    if not task_id:
        result = TestResult(
            test_id=test_id,
            timestamp=datetime.now().isoformat(),
            audio_file=Path(audio_path).name,
            audio_size_mb=audio_size_mb,
            concurrency=concurrency,
            task_id=None,
            status='failed',
            processing_time=None,
            rtf=None,
            worker_rss_before_mb=rss_before,
            worker_rss_after_mb=None,
            worker_rss_delta_mb=None,
            error='Failed to submit task'
        )
        logger.log_result(result)
        return result
    
    # Poll for result
    poll_result_data = poll_result(task_id)
    processing_time = time.time() - start_time
    
    # Measure worker memory after
    time.sleep(2)  # Wait for cleanup
    rss_after = get_worker_memory(worker_pid)
    rss_delta = rss_after - rss_before if rss_after else None
    
    # Calculate RTF if successful
    rtf = None
    if poll_result_data['status'] == 'success':
        data = poll_result_data.get('data', {})
        duration = data.get('duration', 0)
        if duration > 0:
            rtf = processing_time / duration
    
    result = TestResult(
        test_id=test_id,
        timestamp=datetime.now().isoformat(),
        audio_file=Path(audio_path).name,
        audio_size_mb=audio_size_mb,
        concurrency=concurrency,
        task_id=task_id,
        status=poll_result_data['status'],
        processing_time=processing_time,
        rtf=rtf,
        worker_rss_before_mb=rss_before,
        worker_rss_after_mb=rss_after,
        worker_rss_delta_mb=rss_delta,
        error=poll_result_data.get('error')
    )
    
    logger.log_result(result)
    return result


def run_concurrency_batch(
    audio_path: str,
    concurrency: int,
    worker_pid: int,
    logger: CrashSafeLogger
) -> list[TestResult]:
    """Run multiple concurrent tasks"""
    
    print(f"\n{'='*60}")
    print(f"🚀 Testing concurrency={concurrency} with {Path(audio_path).name}")
    print(f"{'='*60}")
    
    results = []
    
    # Submit all tasks concurrently
    task_submissions = []
    for i in range(concurrency):
        rss_before = get_worker_memory(worker_pid)
        task_id = submit_task(audio_path)
        
        task_submissions.append({
            'index': i,
            'task_id': task_id,
            'rss_before': rss_before,
            'submit_time': time.time()
        })
        
        if not task_id:
            print(f"❌ Task {i+1}/{concurrency} submission failed")
        else:
            print(f"✅ Task {i+1}/{concurrency} submitted: {task_id}")
    
    # Poll for all results
    for submission in task_submissions:
        if not submission['task_id']:
            continue
        
        print(f"⏳ Polling task {submission['index']+1}/{concurrency}...")
        poll_result_data = poll_result(submission['task_id'])
        processing_time = time.time() - submission['submit_time']
        
        # Measure memory after
        time.sleep(1)
        rss_after = get_worker_memory(worker_pid)
        rss_delta = rss_after - submission['rss_before'] if rss_after else None
        
        # Calculate RTF
        rtf = None
        if poll_result_data['status'] == 'success':
            data = poll_result_data.get('data', {})
            duration = data.get('duration', 0)
            if duration > 0:
                rtf = processing_time / duration
        
        result = TestResult(
            test_id=f"{Path(audio_path).stem}_c{concurrency}_t{submission['index']}_{int(time.time())}",
            timestamp=datetime.now().isoformat(),
            audio_file=Path(audio_path).name,
            audio_size_mb=Path(audio_path).stat().st_size / 1024 / 1024,
            concurrency=concurrency,
            task_id=submission['task_id'],
            status=poll_result_data['status'],
            processing_time=processing_time,
            rtf=rtf,
            worker_rss_before_mb=submission['rss_before'],
            worker_rss_after_mb=rss_after,
            worker_rss_delta_mb=rss_delta,
            error=poll_result_data.get('error')
        )
        
        logger.log_result(result)
        results.append(result)
        
        status_emoji = "✅" if result.status == "success" else "❌"
        rtf_str = f"{result.rtf:.3f}" if result.rtf else "N/A"
        mem_str = f"{result.worker_rss_delta_mb:+.1f}" if result.worker_rss_delta_mb else "N/A"
        print(f"{status_emoji} Task {submission['index']+1}: {result.status} "
              f"(RTF={rtf_str}, ΔMem={mem_str}MB)")
    
    return results


# ====================== Main Test Suite ======================

def main():
    """Main test execution"""
    
    # Setup crash-safe logger
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    results_file = RESULTS_DIR / f"memory_leak_stress_test_{timestamp}.jsonl"
    resource_csv = RESULTS_DIR / f"system_resources_{timestamp}.csv"
    
    logger = CrashSafeLogger(results_file)
    resource_monitor = SystemResourceMonitor(resource_csv)
    
    print(f"\n{'='*60}")
    print(f"🧪 ASR Worker Memory Leak & Stress Test")
    print(f"{'='*60}")
    print(f"📝 Test Results: {results_file}")
    print(f"📊 Resource Data: {resource_csv}")
    print(f"{'='*60}\n")
    
    # Find worker process
    worker_pid = get_worker_pid()
    if not worker_pid:
        print("❌ ERROR: RQ Worker process not found!")
        print("   Please start the worker with: rq worker asr-queue")
        sys.exit(1)
    
    print(f"✅ Found Worker PID: {worker_pid}")
    initial_rss = get_worker_memory(worker_pid)
    print(f"📊 Initial Worker RSS: {initial_rss:.1f} MB\n")
    
    # Start resource monitoring
    resource_monitor.start()
    
    # Graceful shutdown handler
    def signal_handler(sig, frame):
        print("\n\n⚠️  Interrupted! Stopping monitors and flushing logs...")
        resource_monitor.stop()
        logger.shutdown()
        sys.exit(0)
    
    signal.signal(signal.SIGINT, signal_handler)
    
    try:
        # ===== Phase 1: Limit Testing (1H & 1.5H) =====
        print("\n" + "="*60)
        print("📋 PHASE 1: Extreme Duration Testing")
        print("="*60)
        
        # Test 1: 1 Hour Audio
        print("\n🎵 Test 1: 1 Hour Audio (~115MB)")
        print("   This may take 10-15 minutes...")
        run_single_test(LONG_AUDIO_1H, 1, worker_pid, logger)
        time.sleep(10)
        
        # Test 2: 1.5 Hour Audio
        print("\n🎵 Test 2: 1.5 Hour Audio (~176MB)")
        print("   This may take 15-25 minutes...")
        run_single_test(LONG_AUDIO_1_5H, 1, worker_pid, logger)
        time.sleep(10)
        
        # ===== Phase 2: Concurrency Stress Test (1 Hour) =====
        print("\n" + "="*60)
        print("📋 PHASE 2: Concurrency Stress Test (1 Hour Files)")
        print("="*60)
        print("⚠️  WARNING: Using 1-hour audio files for concurrency!")
        print("   Expect high memory usage and potential OOM.")
        print("   All results are logged in real-time.\n")
        
        input("Press Enter to start SUPER concurrency test (or Ctrl+C to skip)...")
        
        concurrency = CONCURRENCY_START
        while True:
            try:
                # Use 1H audio for concurrency test
                results = run_concurrency_batch(LONG_AUDIO_1H, concurrency, worker_pid, logger)
                
                # Check if any tasks failed
                failed_count = sum(1 for r in results if r.status != 'success')
                
                if failed_count > 0:
                    print(f"\n⚠️  {failed_count}/{concurrency} tasks failed at concurrency={concurrency}")
                    print(f"🏁 Maximum stable concurrency: {concurrency - CONCURRENCY_STEP}")
                    break
                
                # Check worker is still alive
                if not get_worker_pid():
                    print(f"\n💥 Worker crashed at concurrency={concurrency}")
                    print(f"🏁 Maximum stable concurrency: {concurrency - CONCURRENCY_STEP}")
                    break
                
                print(f"\n✅ Concurrency={concurrency} passed!")
                
                # Increase concurrency
                concurrency += CONCURRENCY_STEP
                time.sleep(3)  # Breathing room
                
            except KeyboardInterrupt:
                print(f"\n\n⚠️  Test interrupted by user")
                break
            except Exception as e:
                print(f"\n💥 Unexpected error at concurrency={concurrency}: {e}")
                break
        
    finally:
        # Stop resource monitoring
        resource_monitor.stop()
        
        # Final summary
        print("\n" + "="*60)
        print("📊 TEST COMPLETE")
        print("="*60)
        print(f"📝 Test results: {results_file}")
        print(f"📊 Resource data: {resource_csv}")
        print(f"   Total samples: {len(resource_monitor.samples)}")
        print(f"\n📈 Use analyze_stress_test.py to generate report")
        print("="*60 + "\n")
        
        logger.shutdown()


if __name__ == "__main__":
    main()
