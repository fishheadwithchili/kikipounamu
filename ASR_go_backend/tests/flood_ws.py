import asyncio
import websockets
import sys

async def connect_client(i):
    uri = "ws://localhost:8080/ws/asr?uid=test_user&device_id=stress_test"
    try:
        async with websockets.connect(uri) as websocket:
            # print(f"Client {i} connected")
            await asyncio.Future() # Keep connection open
    except Exception as e:
        print(f"Client {i} failed: {e}")
        return False
    return True

async def main():
    clients = []
    # Create 100 connections
    print("Creating 100 connections...")
    for i in range(100):
        clients.append(asyncio.create_task(connect_client(i)))
        await asyncio.sleep(0.01) # Small delay to avoid overwhelm

    print("100 clients initiated. Waiting a bit...")
    await asyncio.sleep(2)
    
    # Try 101st connection
    print("Attempting 101st connection (Expect Failure)...")
    uri = "ws://localhost:8080/ws/asr?uid=test_user&device_id=stress_test"
    try:
        async with websockets.connect(uri) as ws:
            print("ERROR: 101st connection SUCCESS (Should have failed)")
            sys.exit(1)
    except Exception as e:
        print(f"SUCCESS: 101st connection failed as expected: {e}")

    # Cleanup (optional, script exit will kill tasks)
    print("Test Passed.")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
