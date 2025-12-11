import asyncio
import websockets
import json
import base64
import requests
import os

# Configuration
WS_URI = "ws://localhost:8080/ws/asr?uid=e2e_tester&device_id=script"
API_URL = "http://localhost:8080/api/v1"
TEST_AUDIO_FILE = "tests/test_audio.wav" # We need a dummy audio file

def create_dummy_wav():
    # Create 1 second of silence or random noise if file doesn't exist
    if not os.path.exists("tests"):
        os.makedirs("tests")
    
    # Simple WAV header + 1 sec of silence (16kHz, 16bit, mono)
    # Header 44 bytes.
    # Data: 16000 * 2 bytes = 32000 bytes.
    # Total: 32044 bytes.
    with open(TEST_AUDIO_FILE, "wb") as f:
        # RIFF header
        f.write(b'RIFF')
        f.write((32036).to_bytes(4, 'little')) # Size
        f.write(b'WAVE')
        # fmt subchunk
        f.write(b'fmt ')
        f.write((16).to_bytes(4, 'little')) # Subchunk1Size
        f.write((1).to_bytes(2, 'little')) # AudioFormat (PCM)
        f.write((1).to_bytes(2, 'little')) # NumChannels (1)
        f.write((16000).to_bytes(4, 'little')) # SampleRate
        f.write((32000).to_bytes(4, 'little')) # ByteRate
        f.write((2).to_bytes(2, 'little')) # BlockAlign
        f.write((16).to_bytes(2, 'little')) # BitsPerSample
        # data subchunk
        f.write(b'data')
        f.write((32000).to_bytes(4, 'little'))
        f.write(b'\x00' * 32000)
    print(f"Created dummy audio file: {TEST_AUDIO_FILE}")

async def run_session():
    print(f"Connecting to {WS_URI}...")
    async with websockets.connect(WS_URI) as ws:
        # 1. Start Session
        # Wait - the hook sends 'start' action.
        session_id = f"test-session-{os.urandom(4).hex()}"
        print(f"Starting session: {session_id}")
        await ws.send(json.dumps({
            "action": "start",
            "session_id": session_id
        }))
        
        # 2. Send Audio Chunks
        with open(TEST_AUDIO_FILE, "rb") as f:
            # Skip header for raw PCM simulation if needed, but backend likely accepts whatever or VAD slicing handles it.
            # Start from 44
            f.seek(44)
            data = f.read()
            
        # Send in chunks of 3200 bytes (0.1s)
        chunk_size = 3200
        total_chunks = len(data) // chunk_size
        
        for i in range(total_chunks):
            chunk = data[i*chunk_size : (i+1)*chunk_size]
            b64_data = base64.b64encode(chunk).decode('utf-8')
            
            await ws.send(json.dumps({
                "action": "chunk",
                "session_id": session_id,
                "chunk_index": i,
                "audio_data": b64_data
            }))
            # Simulate real-time
            await asyncio.sleep(0.01)
            
        # 3. Finish Session
        print("Sending finish signal...")
        await ws.send(json.dumps({
            "action": "finish",
            "session_id": session_id
        }))
        
        # 4. Wait for Final Result
        print("Waiting for result...")
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
                data = json.loads(msg)
                print(f"Received: {data}")
                
                if data.get("type") == "final_result":
                    print(f"Final Result: {data.get('text')}")
                    break
                if data.get("type") == "error":
                    print(f"Error from server: {data.get('message')}")
                    return None
            except asyncio.TimeoutError:
                print("Timeout waiting for result")
                return None

        return session_id

def verify_history(session_id):
    print("Verifying history...")
    try:
        resp = requests.get(f"{API_URL}/history?limit=10")
        if resp.status_code != 200:
            print(f"Failed to get history: {resp.status_code}")
            return False
            
        history = resp.json().get("records", [])
        found = False
        for rec in history:
            # Note: session_id might be stored or we check newly created
            # The backend might generate its own Task ID or use Session ID?
            # Looking at backend code (handler/rest.go), it GetHistory returns records.
            # Let's check if the most recent one matches our expected time or text.
            # Since we sent silence, text might be empty or "" or something from FunASR.
            print(f"Record: {rec}")
            if rec.get("session_id") == session_id:
                found = True
                print("✅ Found session in history!")
                break
        
        if not found:
            print("❌ Session NOT found in history.")
            return False
            
    except Exception as e:
        print(f"History check failed: {e}")
        return False
    return True

if __name__ == "__main__":
    create_dummy_wav()
    try:
        sid = asyncio.run(run_session())
        if sid:
            verify_history(sid)
    except Exception as e:
        print(f"Test failed: {e}")
