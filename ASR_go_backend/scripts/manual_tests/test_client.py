
import asyncio
import websockets
import json
import base64
import sys
import uuid
import time
import os

# Configuration
WS_URL = "ws://localhost:8080/ws/asr"
FILE_PATH = "/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav"
CHUNK_SIZE = 3200  # Adjust based on expected chunk size (e.g. 100ms at 16khz)

async def test_asr():
    if not os.path.exists(FILE_PATH):
        print(f"Error: File not found at {FILE_PATH}")
        return

    session_id = str(uuid.uuid4())
    print(f"Connecting to {WS_URL} with Session ID: {session_id}")

    try:
        async with websockets.connect(WS_URL) as websocket:
            # 1. Start Session
            start_msg = {
                "action": "start",
                "session_id": session_id,
                "audio_format": "wav" # Or webm, assume wav for this test file
            }
            await websocket.send(json.dumps(start_msg))
            print(">> Sent START command")

            # Wait for ACK
            response = await websocket.recv()
            print(f"<< Received: {response}")
            
            # 2. Stream Audio
            chunk_index = 0
            with open(FILE_PATH, "rb") as f:
                # Skip header if necessary or just stream raw bytes. 
                # For simplicity, we just stream the file in chunks.
                while True:
                    data = f.read(CHUNK_SIZE)
                    if not data:
                        break
                    
                    encoded_data = base64.b64encode(data).decode('utf-8')
                    chunk_msg = {
                        "action": "chunk",
                        "session_id": session_id,
                        "chunk_index": chunk_index,
                        "audio_data": encoded_data
                    }
                    await websocket.send(json.dumps(chunk_msg))
                    # print(f">> Sent Chunk {chunk_index}")
                    chunk_index += 1
                    await asyncio.sleep(0.01) # Simulate real-time

            print(f">> Finished sending {chunk_index} chunks")

            # 3. Finish Session
            finish_msg = {
                "action": "finish",
                "session_id": session_id
            }
            await websocket.send(json.dumps(finish_msg))
            print(">> Sent FINISH command")

            # Keep listening for a bit to see any results
            try:
                while True:
                    response = await websocket.recv()
                    print(f"<< Received: {response}")
                    msg = json.loads(response)
                    if msg.get("type") == "final_result" or msg.get("status") == "finished":
                         break
            except websockets.exceptions.ConnectionClosed:
                print("Connection closed")
            except asyncio.TimeoutError:
                print("Timeout waiting for response")

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Install websockets if needed: pip install websockets
    try:
        import websockets
    except ImportError:
        print("Please install websockets: pip install websockets")
        sys.exit(1)

    asyncio.run(test_asr())
