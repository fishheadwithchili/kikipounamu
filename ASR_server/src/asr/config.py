"""ASR Configuration Management"""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class ASRConfig(BaseSettings):
    """ASR Service Configuration"""
    
    # Model Configuration
    model_name: str = "paraformer-zh"
    vad_model: str = "fsmn-vad"
    punc_model: str = "ct-punc"
    model_path: Optional[str] = None
    
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
    
    class Config:
        env_prefix = "ASR_"
        env_file = ".env"
        env_file_encoding = "utf-8"


# Global configuration instance
config = ASRConfig()
