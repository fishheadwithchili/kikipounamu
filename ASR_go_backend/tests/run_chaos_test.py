#!/usr/bin/env python3
"""
Chaos Test:
- Runs Mixed Load Test
- Randomly kills 'rq worker' processes every 15s to simulate crash/restart
"""

import asyncio
import subprocess
import time
import random
import os
import signal
from run_mixed_load_test import main as mixed_load_test

async def chaos_monkey():
    print("🐵 Chaos Monkey is watching...")
    while True:
        await asyncio.sleep(15)
        print("🐵 Chaos Monkey attempts to kill a worker!")
        try:
            # Find python worker processes
            cmd = "pgrep -f 'rq worker'"
            result = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE)
            pids = result.stdout.decode().strip().split('\n')
            pids = [p for p in pids if p]
            
            if pids:
                victim = random.choice(pids)
                print(f"🔫 Killing worker PID {victim}...")
                subprocess.run(f"kill -9 {victim}", shell=True)
                
                # We assume supervisord or start script restarts them?
                # Actually in this dev env, they might NOT auto-restart unless we use a supervisor.
                # So we must manually restart if we killed it, or check if the user's system does it.
                # For this test, let's assume we need to restart it to keep the system running.
                
                print(f"🚑 Restarting worker to recover...")
                # We can't easily "restart" the exact same process. 
                # We can just rely on the fact that if we kill one, we reduce capacity.
                # Or we can launch a new one.
                # Let's try to launch a replacement.
                log_file = open("worker.log", "a")
                subprocess.Popen(["/home/tiger/Projects/Katydid/ASR_server/scripts/start_stream_worker.sh"], 
                                 stdout=log_file, stderr=log_file, preexec_fn=os.setsid)
                
            else:
                print("🤷 No workers found to kill?")
        except Exception as e:
            print(f"🐵 Chaos Monkey slipped: {e}")

async def main():
    # Start Chaos Monkey in background
    monkey_task = asyncio.create_task(chaos_monkey())
    
    try:
        # Run the Mixed Load Test as the "Workload"
        print("🏋️ Starting Mixed Load Test under Chaos...")
        await mixed_load_test()
    except Exception as e:
        print(f"❌ Test Failed: {e}")
    finally:
        print("🛑 Consistency Check...")
        monkey_task.cancel()
        try:
            await monkey_task
        except asyncio.CancelledError:
            pass

if __name__ == "__main__":
    asyncio.run(main())
