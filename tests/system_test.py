import asyncio
import websockets
import redis
import json
import time
import sys
import base64
import wave
import io

# Configuration
WS_URI = "ws://localhost:8080/ws/asr?uid=system_tester"
REDIS_HOST = "localhost"
REDIS_PORT = 6379
STREAM_NAME = "asr_tasks"

# Colors for output
GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"

def log_pass(msg):
    print(f"{GREEN}✅ {msg}{RESET}")

def log_fail(msg):
    print(f"{RED}❌ {msg}{RESET}")

def create_silent_wav(duration_sec=1.0):
    """Create a silent WAV file in memory and return base64 string"""
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        n_frames = int(16000 * duration_sec)
        wav_file.writeframes(b'\x00' * n_frames * 2)
    
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

async def test_end_to_end():
    print("\n--- 🚀 Starting End-to-End Flow Test ---")
    
    try:
        async with websockets.connect(WS_URI) as ws:
            log_pass("WebSocket Connection Established")
            
            # 1. Start Session
            start_msg = {
                "action": "start",
                "session_id": f"test-session-{int(time.time())}",
                "user_id": "system_tester"
            }
            await ws.send(json.dumps(start_msg))
            
            # Wait for ack
            ack = json.loads(await ws.recv())
            if ack.get("type") == "ack" and ack.get("status") == "session_started":
                log_pass("Session Started (ACK received)")
            else:
                log_fail(f"Failed to start session: {ack}")
                return False

            # 2. Send Audio Chunk
            audio_b64 = create_silent_wav(1.0)
            chunk_msg = {
                "action": "chunk",
                "session_id": start_msg["session_id"],
                "chunk_index": 0,
                "audio_data": audio_b64
            }
            await ws.send(json.dumps(chunk_msg))
            
            # Wait for chunk ack
            chunk_ack = json.loads(await ws.recv())
            if chunk_ack.get("type") == "ack" and chunk_ack.get("status") == "received":
                log_pass("Audio Chunk Sent (ACK received)")
            else:
                log_fail(f"Failed to send chunk: {chunk_ack}")
                return False
            
            # 3. Wait for Result (from Worker)
            print("⏳ Waiting for worker to process...")
            try:
                result_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10.0))
                if result_msg.get("type") == "chunk_result":
                    log_pass(f"Received Result from Worker: '{result_msg.get('text', '')}'")
                else:
                    log_fail(f"Unexpected message: {result_msg}")
                    return False
            except asyncio.TimeoutError:
                log_fail("Timeout waiting for worker result (Is the worker running?)")
                return False

            # 4. Finish Session
            finish_msg = {
                "action": "finish",
                "session_id": start_msg["session_id"]
            }
            await ws.send(json.dumps(finish_msg))
            
            final_msg = json.loads(await ws.recv())
            if final_msg.get("type") == "final_result":
                log_pass("Received Final Result")
            else:
                log_fail(f"Failed to finish session: {final_msg}")
                return False
                
            return True

    except Exception as e:
        log_fail(f"End-to-End Test Failed: {e}")
        return False

def main():
    print("🔍 Starting System Integration Test...\n")
    
    # 1. Redis Connection
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        r.ping()
        log_pass("Redis Connection Successful")
    except Exception as e:
        log_fail(f"Redis Connection Failed: {e}")
        sys.exit(1)

    # 2. Worker Availability Check
    print("\n--- 🕵️ Checking Worker Availability ---")
    keys = r.keys("worker:*:heartbeat")
    if not keys:
        log_fail("No active workers found! (Check if unified_worker.py is running)")
        sys.exit(1)
    else:
        log_pass(f"Found {len(keys)} active worker(s): {keys}")
        # Inspect one heartbeat
        hb = json.loads(r.get(keys[0]))
        print(f"   Sample Heartbeat: {hb}")

    # 3. Stream Check
    print("\n--- 🌊 Checking Redis Stream ---")
    try:
        info = r.xinfo_stream(STREAM_NAME)
        log_pass(f"Stream '{STREAM_NAME}' exists. Length: {info['length']}")
        
        # Verify groups
        groups = r.xinfo_groups(STREAM_NAME)
        found_group = False
        for g in groups:
            if g['name'] == "asr_workers":
                found_group = True
                log_pass(f"Consumer Group 'asr_workers' exists. Consumers: {g['consumers']}")
                break
        
        if not found_group:
            log_fail("Consumer Group 'asr_workers' NOT found!")
    except redis.ResponseError as e:
        log_fail(f"Stream Check Failed: {e}")
        # We don't exit here, as the stream might be created on first request if not present (though worker creates it)

    # 4. Run End-to-End Test
    if not asyncio.run(test_end_to_end()):
        sys.exit(1)

    print("\n🎉 \033[1mSYSTEM TEST PASSED\033[0m 🎉")

if __name__ == "__main__":
    main()
