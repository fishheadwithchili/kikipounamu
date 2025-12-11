"""
Script to recover and format all chat history from asr_history.jsonl
"""

import json
import os
from pathlib import Path
from datetime import datetime

def recover_history():
    # Define paths
    project_root = Path("/home/tiger/Projects/Katydid")
    log_file = project_root / "ASR_server/src/storage/logs/asr_history.jsonl"
    output_file = project_root / "all_chat_history_recovered.txt"
    
    if not log_file.exists():
        print(f"Error: Log file not found at {log_file}")
        return

    print(f"Reading from: {log_file}")
    
    records = []
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    text = data.get('text', '').strip()
                    created_at = data.get('created_at', '')
                    
                    if text and created_at:
                        # Parse timestamp for sorting
                        try:
                            # Handle potential format variations if necessary
                            # Assuming ISO format as seen in the file
                            dt = datetime.fromisoformat(created_at)
                            records.append({
                                'text': text,
                                'timestamp': dt,
                                'raw_time': created_at
                            })
                        except ValueError:
                            # Keep record even if timestamp parsing fails (use string sort as fallback)
                            records.append({
                                'text': text,
                                'timestamp': datetime.min,
                                'raw_time': created_at
                            })
                            
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"Error reading file: {e}")
        return

    # Sort by timestamp
    records.sort(key=lambda x: x['timestamp'])
    
    # Deduplicate logic
    # 1. Remove consecutive duplicates
    # 2. Remove duplicates of long text (> 50 chars) that appear globally
    
    cleaned_records = []
    seen_long_texts = set()
    
    if records:
        prev_text = None
        for record in records:
            text = record['text']
            
            # Skip consecutive duplicates
            if text == prev_text:
                continue
                
            # Skip global duplicates for long text (likely system loops)
            if len(text) > 50:
                if text in seen_long_texts:
                    continue
                seen_long_texts.add(text)
            
            cleaned_records.append(record)
            prev_text = text

    print(f"Found {len(records)} raw records.")
    print(f"Recovered {len(cleaned_records)} unique records after cleanup.")

    # Write to output file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(f"=== Chat History Recovered (Cleaned) ===\n")
            f.write(f"Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"Total Unique Records: {len(cleaned_records)}\n")
            f.write("=" * 50 + "\n\n")
            
            for record in cleaned_records:
                f.write(f"[{record['raw_time']}]\n")
                f.write(f"{record['text']}\n")
                f.write("-" * 30 + "\n\n")
                
        print(f"Successfully saved to: {output_file}")
        

    except Exception as e:
        print(f"Error writing output: {e}")

    # Part 2: Logical Recovery - Rebuild Index from Audio Files
    print("\n=== Checking for Orphaned Audio Files (Rebuilding Index) ===")
    
    recordings_dir = project_root / "ASR_server/src/storage/recordings"
    if not recordings_dir.exists():
        print(f"Recordings directory not found: {recordings_dir}")
        return

    # Get all audio files in the directory
    audio_files = {f.name: f for f in recordings_dir.glob("*.wav")}
    print(f"Found {len(audio_files)} audio files on disk.")

    # Get all filenames currently referenced in the history
    referenced_filenames = set()
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip(): continue
                try:
                    data = json.loads(line)
                    if 'filename' in data:
                        referenced_filenames.add(data['filename'])
                except: continue
    except: pass
    
    print(f"Found {len(referenced_filenames)} referenced files in history log.")

    # Identify orphans
    orphans = []
    for filename, path in audio_files.items():
        if filename not in referenced_filenames:
            # Reconstruct metadata from filename
            # Format: YYYY-MM-DD_{seq}_{task_id}.wav
            try:
                parts = filename.replace('.wav', '').split('_')
                if len(parts) >= 3:
                    date_str = parts[0]
                    task_id = parts[-1]
                    # Estimate creation time from file stats
                    stats = path.stat()
                    created_time = datetime.fromtimestamp(stats.st_mtime)
                    
                    orphans.append({
                        'filename': filename,
                        'task_id': task_id,
                        'created_at': created_time,
                        'text': "[RECOVERED_FROM_AUDIO_FILE] No text transcript available."
                    })
            except Exception:
                continue
    
    if orphans:
        print(f"⚠️ Found {len(orphans)} orphaned audio files (missing from history).")
        orphans.sort(key=lambda x: x['created_at'])
        
        output_orphans = project_root / "recovered_missing_index_entries.txt"
        with open(output_orphans, 'w', encoding='utf-8') as f:
            f.write("=== Recovered Missing Index Entries (Orphaned Audio) ===\n")
            f.write("These entries exist as files but were missing from the chat history log.\n\n")
            for o in orphans:
                f.write(f"Filename: {o['filename']}\n")
                f.write(f"Task ID:  {o['task_id']}\n")
                f.write(f"Time:     {o['created_at']}\n")
                f.write("-" * 40 + "\n")
        print(f"Saved recovered index entries to: {output_orphans}")
    else:
        print("✅ No orphaned audio files found. All files are indexed.")

if __name__ == "__main__":
    recover_history()

