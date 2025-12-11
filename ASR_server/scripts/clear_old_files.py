"""
Clean up old recordings and history
"""
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.file_handler import file_handler
from src.utils.redis_client import redis_client


def main():
    """Clean up old files and optionally clear history"""
    print("🧹 ASR Storage Cleanup Tool\n")
    
    # Clean up audio files
    print("📁 Cleaning up old audio files...")
    deleted = file_handler.cleanup_old_files(max_files=10)
    
    if deleted:
        print(f"✅ Deleted {len(deleted)} old files:")
        for filename in deleted:
            print(f"   - {filename}")
    else:
        print("✅ No files to delete (10 or fewer files exist)")
    
    # Optionally clear history
    print("\n📚 Current history count:", len(redis_client.get_history(limit=100)))
    
    response = input("\n⚠️  Clear all history from Redis? (y/N): ")
    if response.lower() == 'y':
        redis_client.client.delete("asr:history:latest")
        print("✅ History cleared from Redis")
        print("ℹ️  Note: JSON log file (asr_history.jsonl) is NOT deleted")
    else:
        print("ℹ️  History preserved")
    
    print("\n✅ Cleanup complete")


if __name__ == "__main__":
    main()
