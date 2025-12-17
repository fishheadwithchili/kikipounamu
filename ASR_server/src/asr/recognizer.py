"""Speech Recognition Module"""
import gc
import os
import socket
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
    
    def _detect_network_region(self) -> str:
        """
        Detect network region by checking access to Google DNS (8.8.8.8).
        
        Uses direct socket connection which is more reliable than HTTP:
        - Bypasses DNS resolution issues (DNS pollution in China)
        - Faster response time
        - Google DNS is 100% blocked in China mainland
        
        Returns:
            "hf" if can access Google (overseas), "ms" otherwise (China mainland)
        """
        print("🔍 Detecting network environment...")
        try:
            # Connect to Google's public DNS server on port 53
            # This is blocked in China but fast elsewhere
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(5)  # 5 second timeout
            result = sock.connect_ex(('8.8.8.8', 53))
            sock.close()
            
            if result == 0:
                print("🌍 Overseas network detected. Using HuggingFace (faster for overseas).")
                return "hf"
            else:
                print("🇨🇳 Mainland China network detected. Using ModelScope.")
                return "ms"
        except Exception:
            print("🇨🇳 Mainland China network detected. Using ModelScope.")
            return "ms"
    
    def __init__(self):
        """Initialize the recognizer (only once)"""
        if self._initialized:
            return
            
        print("🔄 Loading ASR model resources, please wait...")
        device = "cuda" if config.use_gpu else "cpu"
        
        # Determine download source (hub)
        if config.model_hub == "auto":
            hub = self._detect_network_region()
        else:
            hub = config.model_hub
            if hub == "hf":
                print("📦 Using configured HuggingFace source")
            elif hub == "ms":
                print("📦 Using configured ModelScope source")
        
        # Initialize FunASR Pipeline
        model_name = config.model_name
        vad_model = config.vad_model
        punc_model = config.punc_model

        # Ensure sub-models also use the correct hub
        sub_model_kwargs = {"hub": hub, "device": device} if hub == "hf" else {"device": device}

        model_kwargs = {
            "model": model_name,
            "vad_model": vad_model,
            "punc_model": punc_model,
            "device": device,
            "hub": hub,  # Set download source
            "disable_update": True,
            "vad_kwargs": sub_model_kwargs,
            "punc_kwargs": sub_model_kwargs,
        }
        
        # Add model_path if specified
        if config.model_path:
            model_kwargs["model_dir"] = config.model_path
        
        self.model = AutoModel(**model_kwargs)
        
        # Load hotwords
        self.hotwords = self._load_hotwords(config.hotwords_path)
        
        self._initialized = True
        print("✅ ASR model loaded. Service ready.")
    
    def _load_hotwords(self, filepath: str) -> str:
        """Load hotwords from file"""
        if not os.path.exists(filepath):
            print(f"⚠️  Hotwords file not found: {filepath}")
            return ""
        
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f.readlines() if line.strip()]
                hotwords = " ".join(lines)
                print(f"✅ Loaded {len(lines)} hotwords")
                return hotwords
        except Exception as e:
            print(f"⚠️  Failed to load hotwords: {e}")
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
                "error": f"File not found: {audio_path}",
                "text": "",
                "duration": 0.0
            }
        
        try:
            print(f"🎤 Recognizing: {os.path.basename(audio_path)}")
            
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
                    "error": "Empty recognition result",
                    "text": "",
                    "duration": 0.0
                }
                
        except Exception as e:
            print(f"❌ Recognition failed: {e}")
            self.cleanup()  # Cleanup on error too
            return {
                "status": "failed",
                "error": str(e),
                "text": "",
                "duration": 0.0
            }
