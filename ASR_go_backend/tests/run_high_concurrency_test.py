#!/usr/bin/env python3
"""
High Concurrency WebSocket Load Test
Adapted from stress_test.py and super_stress_test.py
"""

import asyncio
import websockets
import json
import base64
import time
import argparse
import os
import uuid
import sys
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass, asdict

# Configuration
WS_URI = "ws://localhost:8080/ws/asr"
RESULTS_DIR = Path("/home/tiger/Projects/kikipounamu/ASR_go_backend/tests/results")

@dataclass
class TestResult:
    test_id: str
    timestamp: str
    audio_file: str
    audio_size_mb: float
    concurrency: int
    task_id: str
    status: str
    processing_time: float
    rtf: float
    worker_rss_before_mb: float
    worker_rss_after_mb: float
    worker_rss_delta_mb: float
    error: str

class LoadTestClient:
    def __init__(self, index, audio_data, audio_filename, concurrency):
        self.index = index
        self.audio_data = audio_data
        self.audio_filename = audio_filename
        self.concurrency = concurrency
        self.session_id = str(uuid.uuid4())
        self.chunk_size = 3200 # 0.1s
        
    async def run(self):
        result = TestResult(
            test_id=f"load_{self.index}_{self.session_id[:8]}",
            timestamp=datetime.now().isoformat(),
            audio_file=self.audio_filename,
            audio_size_mb=len(self.audio_data) / 1024 / 1024,
            concurrency=self.concurrency,
            task_id=self.session_id,
            status="pending",
            processing_time=0.0,
            rtf=0.0,
            worker_rss_before_mb=0.0, # Not tracking in this script
            worker_rss_after_mb=0.0,
            worker_rss_delta_mb=0.0,
            error=""
        )

        try:
            start_time = time.time()
            
            # Connect
            async with websockets.connect(f"{WS_URI}?uid=load_{self.index}", ping_interval=None) as ws:
                # Start
                await ws.send(json.dumps({
                    "action": "start", 
                    "session_id": self.session_id
                }))
                
                # Wait for ack
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                    data = json.loads(msg)
                    if data.get("type") == "ack":
                        break

                # Stream
                total_chunks = len(self.audio_data) // self.chunk_size
                audio_dur = total_chunks * 0.1
                
                for i in range(total_chunks):
                    chunk = self.audio_data[i*self.chunk_size : (i+1)*self.chunk_size]
                    b64 = base64.b64encode(chunk).decode('utf-8')
                    
                    await ws.send(json.dumps({
                        "action": "chunk",
                        "session_id": self.session_id,
                        "chunk_index": i,
                        "audio_data": b64
                    }))
                    
                    # Quick drain
                    try:
                        await asyncio.wait_for(ws.recv(), timeout=0.001)
                    except asyncio.TimeoutError:
                        pass
                    
                    # No sleep for load test -> Maximum pressure
                
                # Finish
                await ws.send(json.dumps({"action": "finish", "session_id": self.session_id}))
                
                # Result
                final_text = ""
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=60.0)
                    data = json.loads(msg)
                    if data.get("type") == "final_result":
                        final_text = data.get("text", "")
                        break
                    if data.get("type") == "error":
                        raise Exception(data.get("message"))

                end_time = time.time()
                proc_time = end_time - start_time
                
                result.status = "success"
                result.processing_time = proc_time
                # RTF calculation
                result.rtf = proc_time / audio_dur if audio_dur > 0 else 0
                
        except Exception as e:
            result.status = "failed"
            result.error = str(e)
            
        return result

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, default=500)
    parser.add_argument("--audio", type=str, required=True)
    parser.add_argument("--output", type=str, required=True)
    args = parser.parse_args()

    # Load audio
    with open(args.audio, "rb") as f:
        # Skip header if it exists, simple approach
        if args.audio.endswith(".wav"):
             f.seek(44)
        audio_data = f.read()

    print(f"🚀 Starting load test with {args.users} users...")
    print(f"📄 Audio: {args.audio} ({len(audio_data)} bytes)")
    
    # Batch strategy to avoid opening 500 socket files instantly if ulimit is low
    # But user wants high concurrency, so we try all at once.
    # We rely on Go backend 1000 connection limit.
    
    clients = [LoadTestClient(i, audio_data, Path(args.audio).name, args.users) for i in range(args.users)]
    
    # Stagger starts slightly to avoid connect storm errors (OS limit)
    # 500 connections in 1 second = 2ms delay
    
    async def run_delayed(client, delay):
        await asyncio.sleep(delay)
        return await client.run()

    tasks = [run_delayed(c, i * 0.01) for i, c in enumerate(clients)]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Filter out exceptions from gather itself
    final_results = []
    for r in results:
        if isinstance(r, TestResult):
            final_results.append(r)
        else:
            # Should not happen with inner try/except, but just in case
            print(f"System Error: {r}")

    # Write JSONL
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, "w") as f:
        for r in final_results:
            f.write(json.dumps(asdict(r)) + "\n")
            
    print(f"✅ Results written to {output_path}")
    
    success_count = sum(1 for r in final_results if r.status == "success")
    print(f"📊 Success Rate: {success_count}/{args.users} ({success_count/args.users*100:.1f}%)")

if __name__ == "__main__":
    asyncio.run(main())
