#!/usr/bin/env python3
"""
Reconnect Storm (Thundering Herd):
- Establish 2000 connections
- Drop them causing a "blink"
- Instant reconnect attempt
"""

import asyncio
import websockets
import time
import argparse
import random

WS_URI = "ws://localhost:8080/ws/asr"
CONCURRENCY = 2000

async def connect_and_hold(index, session_id):
    try:
        async with websockets.connect(f"{WS_URI}?uid=storm_{index}", ping_interval=20, timeout=10) as ws:
            # Send start to be a "real" session
            # await ws.send(f'{{"action": "start", "session_id": "{session_id}"}}')
            # Actually, just being connected is enough for FD exhaustion test.
            
            # Wait for the "Drop Signal"
            while not DROP_SIGNAL.is_set():
                await asyncio.sleep(0.1)
            
            # Drop connection
            await ws.close()
            return "dropped"
    except Exception as e:
        return f"failed_initial: {e}"

async def reconnect(index):
    try:
        start = time.time()
        # Use asyncio.wait_for for timeout instead of passing it to connect
        async with websockets.connect(f"{WS_URI}?uid=storm_re_{index}", ping_interval=None) as ws:
            conn_time = time.time() - start
            return f"success:{conn_time:.4f}"
    except Exception as e:
        # Debug TypeError
        import traceback
        traceback.print_exc()
        return f"failed_reconnect: {e}"

DROP_SIGNAL = asyncio.Event()

async def main():
    print(f"🌩️  Building the storm: Connecting {CONCURRENCY} users...")
    
    # 1. Ramp up
    tasks = []
    for i in range(CONCURRENCY):
        tasks.append(asyncio.create_task(connect_and_hold(i, f"sess_{i}")))
        if i % 100 == 0:
            await asyncio.sleep(0.05) # Ramp up slowly to get them ALL connected first
            print(f"   {i} connected...")
            
    print("✅ 2000 Connected. Ready to drop.")
    await asyncio.sleep(2)
    
    # 2. Drop
    print("⚡ DROP! (Network Blink)")
    DROP_SIGNAL.set()
    await asyncio.gather(*tasks)
    print("✅ All dropped.")
    
    # 3. Thundering Herd Reconnect
    print("🌩️  RECONNECT STORM INCOMING (Instant)...")
    start_time = time.time()
    
    # Try to connect ALL exactly at once
    reconnect_tasks = [reconnect(i) for i in range(CONCURRENCY)]
    results = await asyncio.gather(*reconnect_tasks)
    
    duration = time.time() - start_time
    print(f"🏁 Reconnect blocked finished in {duration:.2f}s")
    
    # Analyze
    success = [r for r in results if r.startswith("success")]
    failures = [r for r in results if not r.startswith("success")]
    
    print(f"📊 Results:")
    print(f"   Success: {len(success)}/{CONCURRENCY}")
    if failures:
        print(f"   Failures: {len(failures)}")
        print(f"   Sample Failure: {failures[0]}")
        
    if len(success) > 0:
        times = [float(r.split(":")[1]) for r in success]
        print(f"   Avg Reconnect Time: {sum(times)/len(times):.4f}s")
        print(f"   Max Reconnect Time: {max(times):.4f}s")

if __name__ == "__main__":
    asyncio.run(main())
