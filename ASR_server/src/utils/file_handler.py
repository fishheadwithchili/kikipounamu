"""File Upload and Management Utilities"""
import os
import time
from pathlib import Path
from typing import List, Tuple
from datetime import datetime
from .redis_client import redis_client


class FileHandler:
    """Handle file uploads and cleanup"""
    
    def __init__(self, storage_path: str = "src/storage/recordings"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
    
    def generate_filename(self, task_id: str, original_ext: str) -> str:
        """
        Generate filename: YYYY-MM-DD_{序号}_{task_id}.ext
        
        Args:
            task_id: Unique task identifier
            original_ext: File extension (e.g., 'wav', 'mp3')
            
        Returns:
            Generated filename
        """
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Count today's files
        existing = list(self.storage_path.glob(f"{today}_*"))
        seq_num = len(existing) + 1
        
        return f"{today}_{seq_num:03d}_{task_id}.{original_ext}"
    
    def save_upload(self, content: bytes, task_id: str, filename: str) -> Tuple[str, str]:
        """
        Save uploaded file
        
        Args:
            content: File content
            task_id: Task ID
            filename: Original filename
            
        Returns:
            (full_path, saved_filename)
        """
        # Extract extension
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else 'wav'
        
        # Generate new filename
        new_filename = self.generate_filename(task_id, ext)
        full_path = self.storage_path / new_filename
        
        # Save file
        with open(full_path, 'wb') as f:
            f.write(content)
        
        # Add to Redis index
        timestamp = time.time()
        redis_client.add_audio_index(new_filename, timestamp)
        
        return str(full_path), new_filename
    
    def cleanup_old_files(self, max_files: int = 10) -> List[str]:
        """
        Clean up old files, keeping only the latest N
        Uses filesystem modify time as source of truth
        
        Args:
            max_files: Maximum number of files to keep
            
        Returns:
            List of deleted filenames
        """
        try:
            # Get all files in storage path
            files = [f for f in self.storage_path.iterdir() if f.is_file()]
            
            # If count is within limit, do nothing
            if len(files) <= max_files:
                return []
            
            # Sort by modification time (oldest first)
            files.sort(key=lambda f: f.stat().st_mtime)
            
            # Identify files to delete
            num_to_delete = len(files) - max_files
            to_delete = files[:num_to_delete]
            
            deleted = []
            for file_path in to_delete:
                try:
                    filename = file_path.name
                    file_path.unlink()
                    deleted.append(filename)
                except Exception as e:
                    print(f"⚠️  删除文件失败 {filename}: {e}")
            
            # Remove from Redis index (keep it clean)
            if deleted:
                redis_client.remove_audio_index(deleted)
            
            return deleted
            
        except Exception as e:
            print(f"⚠️  Cleanup error: {e}")
            return []
    
    def get_file_path(self, task_id: str) -> str:
        """Get file path by task_id"""
        # Find file with task_id in name
        matches = list(self.storage_path.glob(f"*_{task_id}.*"))
        if matches:
            return str(matches[0])
        return ""
    
    def delete_file(self, task_id: str) -> bool:
        """Delete file by task_id"""
        file_path = self.get_file_path(task_id)
        if file_path and os.path.exists(file_path):
            try:
                os.unlink(file_path)
                # Remove from Redis
                filename = os.path.basename(file_path)
                redis_client.remove_audio_index([filename])
                return True
            except Exception as e:
                print(f"⚠️  删除文件失败: {e}")
        return False


# Global file handler instance
file_handler = FileHandler()
