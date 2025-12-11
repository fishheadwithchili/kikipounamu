import asyncio
import websockets
import json
import base64
import os
import time

async def test_audio_merge():
    uri = "ws://localhost:8080/ws/asr"
    session_id = f"test_merge_{int(time.time())}"
    
    # Create dummy audio data (silence)
    # 16kHz 16bit mono (32000 bytes = 1 second)
    chunk_size = 32000
    dummy_audio = b'\x00' * chunk_size
    
    async with websockets.connect(uri) as websocket:
        print(f"Connected, starting session: {session_id}")
        
        # 1. Start Session
        await websocket.send(json.dumps({
            "action": "start",
            "session_id": session_id
        }))
        resp = await websocket.recv()
        print(f"Start response: {resp}")

        # 2. Send Chunks
        for i in range(3):
            print(f"Sending chunk {i}...")
            await websocket.send(json.dumps({
                "action": "chunk",
                "session_id": session_id,
                "chunk_index": i,
                "audio_data": base64.b64encode(dummy_audio).decode('utf-8')
            }))
            # Receive ACK and potentially chunk result
            # Depending on server speed, we might get multiple messages
            # Just consume briefly to clear buffer
            try:
                msg = await asyncio.wait_for(websocket.recv(), timeout=0.5)
                # print(f"Chunk response: {msg}")
            except asyncio.TimeoutError:
                pass

        # 3. Finish Session
        print("Finishing session...")
        await websocket.send(json.dumps({
            "action": "finish",
            "session_id": session_id
        }))
        
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            print(f"Received: {data['type']}")
            if data['type'] == 'final_result':
                print("Final result received!")
                break
            
        # 4. Verify File
        # Default user is "anonymous" if not specified
        expected_path = f"storage/recordings/anonymous/{session_id}.wav"
        if os.path.exists(expected_path):
             file_size = os.path.getsize(expected_path)
             print(f"SUCCESS: Audio file created at {expected_path}, size: {file_size} bytes")
             # Expected size: 44 header + 3 * 32000 = 96044
             if file_size >= 96044: 
                 print("Size looks correct (Header + Audio)")
             else:
                 print("WARNING: File size seems too small")
        else:
            print(f"FAILURE: Audio file not found at {expected_path}")

if __name__ == "__main__":
    asyncio.run(test_audio_merge())
