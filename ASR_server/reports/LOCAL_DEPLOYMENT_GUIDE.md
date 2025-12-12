# FunASR Local Offline Deployment Guide (AI Coding Edition)

> **Languages**: [English](LOCAL_DEPLOYMENT_GUIDE.md) | [简体中文](LOCAL_DEPLOYMENT_GUIDE.zh-CN.md)

This guide is based on FunASR official documentation and best practices, customized for **Long Audio, Mixed CN/EN (ABC Style), AI Professional Domain, Offline High Accuracy** scenarios.

---

## 1. Solution Architecture

I adopt **"Three-in-One" Modular Architecture** to ensure best recognition accuracy and readability:

| Component | Model Name | Size | Role |
| :--- | :--- | :--- | :--- |
| **ASR (Core)** | `paraformer-zh` | 220M | Converts speech to text, supports CN/EN mix, trained on 60k hours data. |
| **VAD (Endpoint)** | `fsmn-vad` | 0.4M | Slices 20min long audio into short sentences for concurrent processing. |
| **PUNC (Punctuation)** | `ct-punc` | 290M | Adds punctuation to text, avoids long run-on sentences. |

*   **Total Size**: Approx 510MB
*   **Feature Support**: 
    *   ✅ **ITN (Inverse Text Normalization)**: Automatically handles numbers, years, percentages (e.g., "Two Thousand Twenty Four" -> "2024").
    *   ✅ **Hotword**: Enhances recognition accuracy for AI/Programming technical terms.

---

## 2. Environment Preparation

Ensure Python 3.8+ is installed.

### Install Dependencies
Run in project root:

```bash
# Recommended: uv (Fast, auto env handling)
uv sync

# Or pip (Not recommended)
pip install -U funasr modelscope
# If GPU acceleration needed (Recommended), install corresponding torch (Stable 2.7.0+)
# pip install torch>=2.7.0 torchaudio>=2.7.0 --index-url https://download.pytorch.org/whl/cu128
```

---

## 3. Resource Preparation

### 3.1 Model Download Script
Create `download_models.py`, run once to cache models locally.

```python
# download_models.py
from funasr import AutoModel
import os

print("🚀 Starting FunASR Model Download...")

# 1. Download ASR Core
print("\n[1/3] Downloading Paraformer-zh (ASR)...")
asr = AutoModel(model="paraformer-zh")
print(f"✅ ASR Model Path: {asr.model_path}")

# 2. Download VAD Model
print("\n[2/3] Downloading FSMN-VAD (Endpoint)...")
vad = AutoModel(model="fsmn-vad")
print(f"✅ VAD Model Path: {vad.model_path}")

# 3. Download PUNC Model
print("\n[3/3] Downloading CT-PUNC (Punctuation)...")
punc = AutoModel(model="ct-punc")
print(f"✅ PUNC Model Path: {punc.model_path}")

print("\n🎉 All models downloaded!")
print("Default Cache Location: ~/.cache/modelscope/hub")
```

### 3.2 Prepare Hotword List
Create `hotwords.txt`, fill in AI/Programming technical terms. One per line, or space separated.

**Recommended Content (`hotwords.txt`):**
```text
Transformer
BERT
GPT
Claude
ChatGPT
LLM
CUDA
PyTorch
TensorFlow
API
Token
Prompt
Fine-tune
Embedding
Vector
RAG
Agent
Hugging Face
ModelScope
GitHub
Python
TypeScript
JavaScript
Docker
Kubernetes
Anthropic
OpenAI
Gemini
ResNet
Pipeline
Workflow
```

---

## 4. Core Recognition Script

Create `asr_worker.py`, this is your main workflow script.

```python
# asr_worker.py
import os
from funasr import AutoModel

class SpeechRecognizer:
    def __init__(self, use_gpu=True):
        print("Loading model resources, please wait...")
        device = "cuda" if use_gpu else "cpu"
        
        # Init "Three-in-One" Pipeline
        self.model = AutoModel(
            model="paraformer-zh",      # ASR
            vad_model="fsmn-vad",       # VAD
            punc_model="ct-punc",       # PUNC
            device=device,
            disable_update=True         # Disable auto update check for speed
        )
        
        # Load Hotwords
        self.hotwords = self._load_hotwords("hotwords.txt")
        print("✅ Models loaded, service ready.")

    def _load_hotwords(self, filepath):
        if not os.path.exists(filepath):
            return ""
        with open(filepath, "r", encoding="utf-8") as f:
            # FunASR accepts space separated string
            lines = [line.strip() for line in f.readlines() if line.strip()]
            return " ".join(lines)

    def recognize(self, audio_path):
        if not os.path.exists(audio_path):
            print(f"❌ Error: File not found - {audio_path}")
            return None

        print(f"🎤 Recognizing: {audio_path} ...")
        
        # Execute Inference
        # batch_size_s: Audio duration (sec) for batching. Larger is faster but uses more VRAM. 300s is good balance.
        res = self.model.generate(
            input=audio_path,
            hotword=self.hotwords,  # Inject hotwords
            use_itn=True,           # Enable Inverse Text Normalization
            batch_size_s=300,       # Batch size
            merge_vad=True,         # Merge short segments
            merge_length_s=15       # Max merged length
        )
        
        # Extract Text
        text = res[0]["text"]
        return text

if __name__ == "__main__":
    # Instantiate Recognizer
    recognizer = SpeechRecognizer(use_gpu=True)
    
    # Test Audio Path
    test_file = "test_audio.wav" 
    
    # Start Recognition
    if os.path.exists(test_file):
        result = recognizer.recognize(test_file)
        print("\n📝 Result:\n" + "="*50)
        print(result)
        print("="*50)
    else:
        print(f"Please prepare a test audio file: {test_file}")
```

---

## 5. Key Parameters

In `model.generate()`:

*   **`hotword`**: Pass string (space separated). Significantly improves recall of technical terms.
*   **`use_itn=True`**: Strongly recommended. Converts "Two Thousand Twenty Three" to "2023", "Fifty Percent" to "50%", fitting programming/written style.
*   **`batch_size_s=300`**: Determines concurrency efficiency.
    *   If VRAM > 8G, try `500` or higher.
    *   If pure CPU, suggest `60` to avoid OOM.
*   **`merge_vad=True`**: Keeps sentence length moderate, preventing single sentence being sliced into too many fragments.

## 6. FAQ

1.  **Q: Slow first run?**
    *   A: Need to download models first, depends on network. Subsequent runs load local cache, very fast.

2.  **Q: Error `CUDA out of memory`?**
    *   A: Decrease `batch_size_s` (e.g., from 300 to 60).

3.  **Q: Want Timestamps?**
    *   A: `paraformer-zh` returns timestamps by default. Print `res[0]["timestamp"]` in script to view.
