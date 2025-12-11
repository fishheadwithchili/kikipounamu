"""Speech Recognition Module"""
import gc
import os
from typing import Optional

import torch
from funasr import AutoModel
from .config import config


class SpeechRecognizer:
    """Speech Recognition using FunASR"""
    
    _instance: Optional['SpeechRecognizer'] = None
    
    def __new__(cls):
        """Singleton pattern to avoid loading model multiple times"""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize the recognizer (only once)"""
        if self._initialized:
            return
            
        print("🔄 正在加载 ASR 模型资源，请稍候...")
        device = "cuda" if config.use_gpu else "cpu"
        
        # Initialize FunASR Pipeline
        model_kwargs = {
            "model": config.model_name,
            "vad_model": config.vad_model,
            "punc_model": config.punc_model,
            "device": device,
            "disable_update": True,
        }
        
        # Add model_path if specified
        if config.model_path:
            model_kwargs["model_dir"] = config.model_path
        
        self.model = AutoModel(**model_kwargs)
        
        # Load hotwords
        self.hotwords = self._load_hotwords(config.hotwords_path)
        
        self._initialized = True
        print("✅ ASR 模型加载完毕，服务就绪。")
    
    def _load_hotwords(self, filepath: str) -> str:
        """Load hotwords from file"""
        if not os.path.exists(filepath):
            print(f"⚠️  热词文件不存在: {filepath}")
            return ""
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f.readlines() if line.strip()]
                hotwords = " ".join(lines)
                print(f"✅ 已加载 {len(lines)} 个热词")
                return hotwords
        except Exception as e:
            print(f"⚠️  加载热词失败: {e}")
            return ""
    
    def cleanup(self):
        """Force memory cleanup after inference to prevent memory leaks"""
        gc.collect()
        gc.collect()  # Run twice to handle weak references
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.synchronize()
    
    def recognize(self, audio_path: str) -> dict:
        """
        Recognize speech from audio file
        
        Args:
            audio_path: Path to audio file
            
        Returns:
            dict with keys: text, duration, status, error (optional)
        """
        if not os.path.exists(audio_path):
            return {
                "status": "failed",
                "error": f"文件不存在: {audio_path}",
                "text": "",
                "duration": 0.0
            }
        
        try:
            print(f"🎤 正在识别: {os.path.basename(audio_path)}")
            
            # Perform recognition
            res = self.model.generate(
                input=audio_path,
                hotword=self.hotwords,
                use_itn=config.use_itn,
                batch_size_s=config.batch_size,
                merge_vad=config.merge_vad,
                merge_length_s=config.merge_length_s
            )
            
            # Extract result
            if res and len(res) > 0:
                text = res[0].get("text", "")
                
                # Get duration
                duration = res[0].get("duration", 0.0)
                if duration == 0.0:
                    try:
                        import soundfile as sf
                        duration = sf.info(audio_path).duration
                    except ImportError:
                        pass
                
                # Cleanup intermediate tensors and release memory
                del res
                self.cleanup()
                
                return {
                    "status": "success",
                    "text": text,
                    "duration": duration,
                }
            else:
                del res
                self.cleanup()
                return {
                    "status": "failed",
                    "error": "识别结果为空",
                    "text": "",
                    "duration": 0.0
                }
                
        except Exception as e:
            print(f"❌ 识别失败: {e}")
            self.cleanup()  # Cleanup on error too
            return {
                "status": "failed",
                "error": str(e),
                "text": "",
                "duration": 0.0
            }
