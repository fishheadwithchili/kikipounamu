#!/usr/bin/env python3
"""
Zombie Horde (Slow Loris):
- 2000 connections
- Sends 1 byte every 30s
- Checks if server memory explodes or connections time out
"""

import asyncio
import websockets
import json
import base64
import time
import argparse

WS_URI = "ws://localhost:8080/ws/asr"
ZOMBIES = 1000 # 2000 might hit OS limits easily with python overhead, let's start with 1000

async def be_zombie(index):
    try:
        async with websockets.connect(f"{WS_URI}?uid=zombie_{index}", ping_interval=None) as ws:
            await ws.send(json.dumps({
                "action": "start", 
                "session_id": f"zombie_{index}"
            }))
            
            # Wait for ack
            try:
                await asyncio.wait_for(ws.recv(), timeout=5.0)
            except:
                pass
                
            print(f"🧟 Zombie {index} infected (connected)")
            
            # Slow loop
            for i in range(10): # Stay alive for ~5 minutes
                await asyncio.sleep(30)
                # Send garbage/heartbeat
                # The server expects audio chunks.
                # Let's send a tiny chunk.
                # 1 byte of audio (invalid but keeps conn open)
                await ws.send(json.dumps({
                    "action": "chunk",
                    "session_id": f"zombie_{index}",
                    "chunk_index": i,
                    "audio_data": "" # Empty payload
                }))
                print(f"🧟 Zombie {index} groaned (ping)")
                
            return "survived"
    except Exception as e:
        return f"died: {e}"

async def main():
    print(f"🧟 Raising {ZOMBIES} Zombies...")
    
    tasks = []
    # Ramp up to avoid "connection refused" due to backlog
    for i in range(ZOMBIES):
        tasks.append(asyncio.create_task(be_zombie(i)))
        if i % 50 == 0:
            await asyncio.sleep(0.1)
            
    print("🧠 Brains... (All Zombies connected, waiting)")
    
    # Monitor for a while
    results = await asyncio.gather(*tasks)
    
    survivors = sum(1 for r in results if r == "survived")
    print(f"💀 Apocalypse over.")
    print(f"   Survivors: {survivors}/{ZOMBIES}")

if __name__ == "__main__":
    asyncio.run(main())
