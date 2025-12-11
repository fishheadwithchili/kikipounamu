import asyncio
import websockets
import json
import base64
import os
import shutil
import time

async def run_session(session_idx, user_id):
    uri = "ws://localhost:8080/ws/asr"
    session_id = f"test_retention_{user_id}_{session_idx}_{int(time.time()*1000)}"
    
    # Dummy audio: 0.1s silence
    chunk_size = 3200
    dummy_audio = b'\x00' * chunk_size
    
    async with websockets.connect(uri) as websocket:
        # 1. Start Session
        await websocket.send(json.dumps({
            "action": "start",
            "session_id": session_id,
            "user_id": user_id
        }))
        await websocket.recv() # Start ACK

        # 2. Send Chunk
        await websocket.send(json.dumps({
            "action": "chunk",
            "session_id": session_id,
            "chunk_index": 0,
            "audio_data": base64.b64encode(dummy_audio).decode('utf-8')
        }))
        await websocket.recv() # Chunk ACK
        
        # 3. Finish Session
        await websocket.send(json.dumps({
            "action": "finish",
            "session_id": session_id
        }))
        
        # Wait for completion
        while True:
            msg = await websocket.recv()
            data = json.loads(msg)
            if data['type'] == 'final_result':
                break
    
    print(f"✅ Session {session_idx} completed: {session_id}")
    return session_id

async def test_retention():
    user_id = "retention_user"
    max_files = 3
    total_sessions = 5
    
    # Cleanup previous run
    user_dir = f"storage/recordings/{user_id}"
    if os.path.exists(user_dir):
        shutil.rmtree(user_dir)
    
    print(f"🚀 Starting retention test for user '{user_id}'")
    print(f"📝 Creating {total_sessions} sessions, expecting only latest {max_files} to remain...")

    created_sessions = []
    for i in range(total_sessions):
        sid = await run_session(i, user_id)
        created_sessions.append(sid)
        # Wait a bit to ensure distinct timestamps
        time.sleep(0.5) 
        
    # Check files
    if not os.path.exists(user_dir):
        print(f"❌ User directory not found: {user_dir}")
        return

    files = [f for f in os.listdir(user_dir) if f.endswith('.wav')]
    files.sort(key=lambda x: os.path.getmtime(os.path.join(user_dir, x)))
    
    print(f"📂 Files in directory ({len(files)}):")
    for f in files:
        print(f" - {f}")

    if len(files) == max_files:
        print("✅ SUCCESS: File count matches limit!")
        
        # Verify it's the latest files
        latest_sessions = [s + ".wav" for s in created_sessions[-max_files:]]
        latest_sessions_set = set(latest_sessions)
        files_set = set(files)
        
        if latest_sessions_set == files_set:
             print("✅ SUCCESS: The files retained are indeed the latest ones.")
        else:
             print(f"❌ FAILURE: Files do not match latest sessions.\nExpected: {latest_sessions_set}\nGot: {files_set}")

    else:
        print(f"❌ FAILURE: File count {len(files)} != limit {max_files}")

if __name__ == "__main__":
    asyncio.run(test_retention())
