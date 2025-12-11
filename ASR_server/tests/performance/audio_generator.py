import os
import subprocess
import sys
from pathlib import Path

def generate_audio_if_needed(file_path: str, source_short_audio: str) -> bool:
    """
    Checks if file_path exists. If not, attempts to generate it from source_short_audio.
    Returns True if a new file was generated, False otherwise.
    """
    if os.path.exists(file_path):
        return False
    
    filename = os.path.basename(file_path)
    
    # Determine duration from filename
    duration_sec = 0
    if "1h" in filename:
        duration_sec = 3600
    elif "30m" in filename:
        duration_sec = 1800
    elif "10m" in filename:
        duration_sec = 600
    elif "5m" in filename:
        duration_sec = 300
    elif "1m" in filename:
        duration_sec = 60
        
    if duration_sec == 0:
        # If we can't guess duration, assume we shouldn't auto-generate it
        # unless user explicitly wants a mechanism for custom lengths.
        # For now, sticking to what user implied (long audio).
        return False
        
    # Check if source exists
    if not os.path.exists(source_short_audio):
        print(f"⚠️ Source audio not found: {source_short_audio}")
        return False
        
    print(f"🔨 Generating temporary file {filename} ({duration_sec}s) from short audio...")
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(os.path.abspath(file_path)), exist_ok=True)
    
    # ffmpeg command
    cmd = [
        "ffmpeg",
        "-y",
        "-stream_loop", "-1",
        "-i", source_short_audio,
        "-t", str(duration_sec),
        "-c:a", "pcm_s16le", # Use Standard PCM to avoid codec issues
        file_path
    ]
    
    try:
        # Run ffmpeg, suppressing output unless error
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        print(f"✅ Generated {filename}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to generate {filename}: {e.stderr.decode()}")
        return False
