import asyncio
import websockets
import redis
import json
import time
import sys

# Configuration
WS_URI = "ws://localhost:8080/ws/asr?uid=monitor_tester"
REDIS_HOST = "localhost"
REDIS_PORT = 6379

async def test_connection(expected_success: bool, stage_name: str):
    print(f"\n--- Testing Stage: {stage_name} ---")
    try:
        async with websockets.connect(WS_URI) as ws:
            if expected_success:
                print("✅ Connection established as expected.")
                return True
            else:
                print("❌ Connection established but SHOULD HAVE FAILED.")
                return False
    except Exception as e:
        # Handle websockets exception for rejected connection
        if "HTTP 503" in str(e):
            if not expected_success:
                print(f"✅ Connection rejected as expected. Error: {e}")
                return True
            else:
                print(f"❌ Connection rejected but SHOULD HAVE SUCCEEDED. Error: {e}")
                return False
        
        print(f"⚠️ Unexpected error: {e}")
        return False

def set_heartbeat(r, worker_id):
    key = f"worker:{worker_id}:heartbeat"
    payload = {
        "ts": int(time.time()),
        "worker": worker_id,
        "status": "running",
        "load": {}
    }
    r.set(key, json.dumps(payload), ex=30)
    print(f"❤️  Heartbeat sent for {worker_id}")

def main():
    # 1. Setup Redis
    try:
        r = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        r.ping()
    except Exception as e:
        print(f"Failed to connect to Redis: {e}")
        sys.exit(1)

    # 2. Clean existing heartbeats
    keys = r.keys("worker:*:heartbeat")
    if keys:
        r.delete(*keys)
    print("🧹 Cleared existing heartbeats.")

    # Give backend a moment to update its cache (it scans every 15s, but we might need to wait for the next tick)
    # Actually, the backend scans on a ticker. We might need to wait up to 15s.
    # To make test faster, we hope the initial check happened or we wait.
    # Let's wait 16 seconds to be sure the backend has done a fresh scan of "0 workers".
    print("⏳ Waiting 16s for backend to sync (0 workers)...")
    time.sleep(16)

    # 3. Test 0 Workers -> Expect Fail
    if not asyncio.run(test_connection(expected_success=False, stage_name="0 Workers")):
        sys.exit(1)

    # 4. Test 1 Worker -> Expect Fail (Threshold is 2)
    set_heartbeat(r, "test-worker-1")
    print("⏳ Waiting 16s for backend to sync (1 worker)...")
    time.sleep(16)
    
    if not asyncio.run(test_connection(expected_success=False, stage_name="1 Worker")):
        sys.exit(1)

    # 5. Test 2 Workers -> Expect Success
    set_heartbeat(r, "test-worker-1") # Refresh
    set_heartbeat(r, "test-worker-2")
    print("⏳ Waiting 16s for backend to sync (2 workers)...")
    time.sleep(16)

    if not asyncio.run(test_connection(expected_success=True, stage_name="2 Workers")):
        sys.exit(1)

    print("\n🎉 All monitoring tests PASSED!")

if __name__ == "__main__":
    main()
