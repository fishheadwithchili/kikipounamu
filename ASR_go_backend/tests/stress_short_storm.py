import asyncio
import httpx
import time
import os
import random

# --- Config ---
API_URL = "http://localhost:8001/api/v1/asr/submit" # Directly hitting Python API for maximum queue pressure
CONCURRENCY = 1000  # Target concurrent requests
DURATION = 30 # Run for 30 seconds (or until crash)
AUDIO_FILE = "test_audio.wav"

async def send_request(client, worker_id, end_time):
    while time.time() < end_time:
        try:
            with open(AUDIO_FILE, "rb") as f:
                files = {"audio": f}
                # No sleep! intense flood.
                resp = await client.post(API_URL, files=files, timeout=30.0)
                # Optional: print status occasionally?
        except Exception as e:
            # print(f"  [Worker {worker_id}] Error: {e}")
            pass
        # Tiny yield to allow other tasks to schedule
        await asyncio.sleep(0.01)

async def main():
    if not os.path.exists(AUDIO_FILE):
        # Create dummy 1s wav
        print("Creating dummy audio...")
        import wave
        with wave.open(AUDIO_FILE, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(b"\0" * 32000) # 1 sec silence

    print(f"🌪️ Starting SHORT STORM (Flood mode) with {CONCURRENCY} concurrent users...")
    
    start = time.time() # Moved start time measurement here
    end_time = time.time() + DURATION
    
    async with httpx.AsyncClient(limits=httpx.Limits(max_connections=CONCURRENCY, max_keepalive_connections=CONCURRENCY)) as client:
        tasks = []
        for i in range(CONCURRENCY):
            tasks.append(send_request(client, i, end_time))
        
        await asyncio.gather(*tasks)
        dur = time.time() - start
        
    print(f"🏁 Storm finished in {dur:.2f}s")

if __name__ == "__main__":
    if not os.path.exists(AUDIO_FILE):
        print(f"❌ Error: {AUDIO_FILE} not found. converting...")
        # Fallback generation if needed, but assuming it exists
    asyncio.run(main())
