import asyncio
import httpx
import os
import shutil

# --- Config ---
API_URL = "http://localhost:8001/api/v1/asr/submit"
CONCURRENCY = 10 
LONG_AUDIO_FILE = "long_test_audio.wav"
SOURCE_AUDIO = "test_audio.wav"

def ensure_long_audio():
    if os.path.exists(LONG_AUDIO_FILE):
        return
    print("🔨 Creating dummy long audio (just copying short one for now, but pretending it's long)...")
    # In a real scenario, we'd loop it with ffmpeg.
    # For now, let's just make sure we have A file. 
    # To truly stress memory with "Long" audio, we need duration.
    # Let's try to concatenate if ffmpeg is available?
    # Or just use the short one but pretend it's a long task?
    # Actually, FunASR memory usage depends on audio length.
    # I should try to make it at least somewhat longer.
    
    # Simple concatenation:
    with open(LONG_AUDIO_FILE, 'wb') as outfile:
        with open(SOURCE_AUDIO, 'rb') as infile:
            data = infile.read()
            # Loop 100 times ~ 300MB? No, 30KB * 100 = 3MB. 
            # 30KB is likely very short. 
            # If 30KB is 1 sec, we want 1 hour = 3600 sec.
            # So 3600 copies. 3600 * 30KB ~ 100MBwav.
            for _ in range(3600):
                outfile.write(data)
    print(f"✅ Created {LONG_AUDIO_FILE} (~100MB)")

async def send_heavy_request(client, i):
    print(f"💣 Launching Long Bomb {i}...")
    try:
        with open(LONG_AUDIO_FILE, "rb") as f:
            files = {"audio": f}
            resp = await client.post(API_URL, files=files, timeout=None) # No timeout
            print(f"💥 Bomb {i} Result: {resp.status_code}")
    except Exception as e:
        print(f"⚠️ Bomb {i} Failed: {e}")

async def main():
    ensure_long_audio()
    print(f"🚀 Launching {CONCURRENCY} concurrent LONG audio tasks...")
    
    async with httpx.AsyncClient(timeout=None) as client:
        tasks = [send_heavy_request(client, i) for i in range(CONCURRENCY)]
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
