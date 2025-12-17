"""ASR Configuration Management"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


# Fix for Windows: Disable symlinks for HuggingFace downloads to avoid [WinError 1314]
# This must be set BEFORE importing any HF libraries or running downloads
os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "0"
# Critical fix for "A required privilege is not held by the client"
os.environ["HF_HUB_DISABLE_SYMLINKS"] = "1" 

class ASRConfig(BaseSettings):
    """ASR Service Configuration"""
    
    # Model Configuration
    model_name: str = "paraformer-zh"
    vad_model: str = "fsmn-vad"
    punc_model: str = "ct-punc"
    model_path: Optional[str] = None
    model_hub: str = "auto"  # "auto", "hf" (HuggingFace), or "ms" (ModelScope)
    
    # Processing Configuration
    use_gpu: bool = True
    batch_size: int = 500
    use_itn: bool = True
    merge_vad: bool = True
    merge_length_s: int = 15
    
    # Hotwords Configuration
    hotwords_path: str = "src/hotwords.txt"
    
    # Storage Configuration
    storage_path: str = "src/storage"
    max_recordings: int = 10
    max_history_records: int = 10
    
    model_config = SettingsConfigDict(
        env_prefix="ASR_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )


# Global configuration instance
config = ASRConfig()
