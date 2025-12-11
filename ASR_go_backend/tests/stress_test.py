import asyncio
import websockets
import json
import base64
import time
import statistics
import argparse
import os

# Configuration
WS_URI = "ws://localhost:8080/ws/asr"
AUDIO_FILE = "/home/tiger/Projects/ASR_pc_front/recording/20251207_1033_recording.wav"
CHUNK_SIZE = 3200  # 0.1s at 16kHz, 16bit, mono
SAMPLE_RATE = 16000

class StressClient:
    def __init__(self, client_id, audio_data, realtime_simulation=True):
        self.client_id = client_id
        self.audio_data = audio_data
        self.realtime = realtime_simulation
        self.session_id = f"stress-{client_id}-{int(time.time())}"
        self.metrics = {}

    async def run(self):
        try:
            connect_start = time.time()
            async with websockets.connect(f"{WS_URI}?uid=stress_{self.client_id}", ping_interval=None) as ws:
                self.metrics['connect_latency'] = time.time() - connect_start
                
                # 1. Start Session
                await ws.send(json.dumps({
                    "action": "start",
                    "session_id": self.session_id
                }))
                
                # Wait for ack
                while True:
                    msg = await ws.recv()
                    data = json.loads(msg)
                    if data.get("type") == "ack" and data.get("status") == "session_started":
                        break

                # 2. Stream Audio
                stream_start = time.time()
                total_chunks = len(self.audio_data) // CHUNK_SIZE
                
                for i in range(total_chunks):
                    chunk = self.audio_data[i*CHUNK_SIZE : (i+1)*CHUNK_SIZE]
                    b64_data = base64.b64encode(chunk).decode('utf-8')
                    
                    await ws.send(json.dumps({
                        "action": "chunk",
                        "session_id": self.session_id,
                        "chunk_index": i,
                        "audio_data": b64_data
                    }))
                    
                    # Consume pending acks/results without blocking
                    try:
                        while True:
                            # Non-blocking check? WebSockets doesn't have easy non-blocking recv in async loop without wait_for
                            # We'll just check quickly or rely on the final loop
                            await asyncio.wait_for(ws.recv(), timeout=0.001)
                    except asyncio.TimeoutError:
                        pass

                    if self.realtime:
                        await asyncio.sleep(0.095) # Slightly less than 0.1s to account for overhead

                # 3. Finish
                send_finish_time = time.time()
                await ws.send(json.dumps({
                    "action": "finish",
                    "session_id": self.session_id
                }))
                
                # 4. Wait for Final Result
                final_text = ""
                server_duration = 0.0
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=60.0)
                    data = json.loads(msg)
                    
                    if data.get("type") == "final_result":
                        final_text = data.get("text", "")
                        server_duration = data.get("duration", 0.0)
                        break
                    elif data.get("type") == "error":
                        raise Exception(f"Server error: {data.get('message')}")

                finish_time = time.time()
                
                # Metrics
                audio_dur = total_chunks * 0.1
                total_wall_time = finish_time - stream_start
                latency = finish_time - send_finish_time
                rtf = total_wall_time / audio_dur if audio_dur > 0 else 0

                self.metrics.update({
                    "success": True,
                    "audio_duration": audio_dur,
                    "total_wall_time": total_wall_time,
                    "latency": latency,
                    "rtf": rtf,
                    "server_duration": server_duration,
                    "final_text_len": len(final_text)
                })
                
                print(f"[Client {self.client_id}] Finished. RTF: {rtf:.2f}, Latency: {latency:.2f}s")
                return self.metrics

        except Exception as e:
            print(f"[Client {self.client_id}] Failed: {e}")
            return {"success": False, "error": str(e)}

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--users", type=int, default=5, help="Number of concurrent users")
    parser.add_argument("--realtime", action="store_true", default=True, help="Simulate entering audio in realtime")
    args = parser.parse_args()

    print(f"Loading audio from {AUDIO_FILE}...")
    if not os.path.exists(AUDIO_FILE):
        print("Audio file not found!")
        return

    # Skip WAV header (44 bytes) for raw slicing simplistically
    with open(AUDIO_FILE, "rb") as f:
        f.seek(44)
        audio_data = f.read()

    print(f"Starting stress test with {args.users} users...")
    clients = [StressClient(i, audio_data, args.realtime) for i in range(args.users)]
    
    start_time = time.time()
    results = await asyncio.gather(*(c.run() for c in clients))
    total_time = time.time() - start_time

    # Analysis
    successful = [r for r in results if r.get("success")]
    failed = [r for r in results if not r.get("success")]
    
    print("\n" + "="*40)
    print("STRESS TEST REPORT")
    print("="*40)
    print(f"Concurrent Users: {args.users}")
    print(f"Total Time: {total_time:.2f}s")
    print(f"Success Rate: {len(successful)}/{len(clients)}")
    
    if successful:
        avg_rtf = statistics.mean([r['rtf'] for r in successful])
        avg_latency = statistics.mean([r['latency'] for r in successful])
        p95_latency = statistics.quantiles([r['latency'] for r in successful], n=20)[18] if len(successful) >= 20 else max([r['latency'] for r in successful])
        
        print(f"Average RTF: {avg_rtf:.3f} (Lower is better, <1 means faster than realtime)")
        print(f"Average Latency: {avg_latency:.3f}s")
        print(f"P95 Latency: {p95_latency:.3f}s")
        print(f"Throughput: {len(successful) / (total_time/60):.2f} sessions/min")
    
    if failed:
        print("\nFailures:")
        for r in failed:
            print(f"- {r.get('error')}")

if __name__ == "__main__":
    asyncio.run(main())
