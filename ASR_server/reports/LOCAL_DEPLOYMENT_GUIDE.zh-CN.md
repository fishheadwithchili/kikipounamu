# FunASR 本地离线部署指南 (AI编程领域专用版)

> **语言切换**: [English](LOCAL_DEPLOYMENT_GUIDE.md) | [简体中文](LOCAL_DEPLOYMENT_GUIDE.zh-CN.md)


本指南基于 FunASR 官方文档及最佳实践整理，专为**长音频、中英混合（ABC Style）、AI专业领域、离线高精度**场景定制。

---

## 1. 方案架构

我们采用 **"三合一" 模块化架构**，确保最佳的识别精度和可读性：

| 组件 | 模型名称 | 大小 | 作用 |
| :--- | :--- | :--- | :--- |
| **ASR (核心识别)** | `paraformer-zh` | 220M | 负责将语音转为文字，支持中英混合，6万小时数据训练。 |
| **VAD (端点检测)** | `fsmn-vad` | 0.4M | 负责将20分钟长音频切分为短句，实现并发处理。 |
| **PUNC (标点恢复)** | `ct-punc` | 290M | 负责给文字加上标点符号，避免长篇流水账。 |

*   **总占用空间**: 约 510MB
*   **特性支持**: 
    *   ✅ **ITN (逆文本正则化)**: 自动处理数字、年份、百分比 (e.g., "二零二四" -> "2024")。
    *   ✅ **Hotword (热词增强)**: 增强 AI/编程领域专业术语的识别准确率。

---

## 2. 环境准备

确保已安装 Python 3.8+。

### 安装依赖
在项目根目录执行：

```bash
# 推荐使用 uv (速度快，自动处理环境)
uv sync

# 或者使用 pip (不推荐)
pip install -U funasr modelscope
# 如果需要 GPU 加速（推荐），请确保安装了对应版本的 torch (Stable 2.7.0+)
# pip install torch>=2.7.0 torchaudio>=2.7.0 --index-url https://download.pytorch.org/whl/cu128
```

---

## 3. 资源准备

### 3.1 模型下载脚本
创建一个名为 `download_models.py` 的文件，运行一次即可将模型缓存到本地。

```python
# download_models.py
from funasr import AutoModel
import os

print("🚀 开始下载 FunASR 模型组件...")

# 1. 下载 ASR 核心模型
print("\n[1/3] 下载 Paraformer-zh (ASR)...")
asr = AutoModel(model="paraformer-zh")
print(f"✅ ASR 模型路径: {asr.model_path}")

# 2. 下载 VAD 模型
print("\n[2/3] 下载 FSMN-VAD (端点检测)...")
vad = AutoModel(model="fsmn-vad")
print(f"✅ VAD 模型路径: {vad.model_path}")

# 3. 下载 标点 模型
print("\n[3/3] 下载 CT-PUNC (标点恢复)...")
punc = AutoModel(model="ct-punc")
print(f"✅ PUNC 模型路径: {punc.model_path}")

print("\n🎉 所有模型下载完成！")
print("模型默认缓存位置: ~/.cache/modelscope/hub")
```

### 3.2 准备热词表
创建一个名为 `hotwords.txt` 的文件，填入 AI/编程领域的专业术语。每行一个词，或者用空格分隔。

**推荐内容 (`hotwords.txt`):**
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

## 4. 核心识别脚本

创建一个名为 `asr_worker.py` 的文件，这是你的主工作流脚本。

```python
# asr_worker.py
import os
from funasr import AutoModel

class SpeechRecognizer:
    def __init__(self, use_gpu=True):
        print("正在加载模型资源，请稍候...")
        device = "cuda" if use_gpu else "cpu"
        
        # 初始化 "三合一" Pipeline
        self.model = AutoModel(
            model="paraformer-zh",      # ASR
            vad_model="fsmn-vad",       # VAD
            punc_model="ct-punc",       # PUNC
            device=device,
            disable_update=True         # 禁止自动检查更新，加快启动
        )
        
        # 加载热词
        self.hotwords = self._load_hotwords("hotwords.txt")
        print("✅ 模型加载完毕，服务就绪。")

    def _load_hotwords(self, filepath):
        if not os.path.exists(filepath):
            return ""
        with open(filepath, "r", encoding="utf-8") as f:
            # FunASR 接受空格分隔的字符串
            lines = [line.strip() for line in f.readlines() if line.strip()]
            return " ".join(lines)

    def recognize(self, audio_path):
        if not os.path.exists(audio_path):
            print(f"❌ 错误: 文件不存在 - {audio_path}")
            return None

        print(f"🎤 正在识别: {audio_path} ...")
        
        # 执行推理
        # batch_size_s: 批处理音频时长(秒)，越大越快但显存占用越高。300s 是个不错的平衡点。
        res = self.model.generate(
            input=audio_path,
            hotword=self.hotwords,  # 注入热词
            use_itn=True,           # 开启逆文本正则化 (2024年, 10%)
            batch_size_s=300,       # 批处理大小
            merge_vad=True,         # 合并过短的语音片段
            merge_length_s=15       # 合并后的最大长度
        )
        
        # 提取文本结果
        text = res[0]["text"]
        return text

if __name__ == "__main__":
    # 实例化识别器
    recognizer = SpeechRecognizer(use_gpu=True)
    
    # 测试音频文件路径
    test_file = "test_audio.wav" 
    
    # 开始识别
    if os.path.exists(test_file):
        result = recognizer.recognize(test_file)
        print("\n📝 识别结果:\n" + "="*50)
        print(result)
        print("="*50)
    else:
        print(f"请准备一个测试音频文件: {test_file}")
```

---

## 5. 关键参数说明

在 `model.generate()` 中：

*   **`hotword`**: 传入字符串（空格分隔）。显著提高专业术语的召回率。
*   **`use_itn=True`**: 强烈建议开启。它会将 "二零二三" 转换为 "2023"，"百分之五十" 转换为 "50%"，更符合编程和书面习惯。
*   **`batch_size_s=300`**: 决定了并发处理的效率。
    *   如果你显存(VRAM)较大(>8G)，可以尝试设为 `500` 或更高。
    *   如果是纯 CPU 运行，建议设为 `60` 以避免内存溢出。
*   **`merge_vad=True`**: 让输出的句子长度适中，不会因为 VAD 切太碎导致一句话被切成好几段。

## 6. 常见问题

1.  **Q: 第一次运行很慢？**
    *   A: 第一次需要下载模型，取决于网速。之后运行会直接加载本地缓存，速度很快。

2.  **Q: 报错 `CUDA out of memory`？**
    *   A: 调小 `batch_size_s` 的值（例如从 300 改为 60）。

3.  **Q: 想要时间戳？**
    *   A: `paraformer-zh` 默认返回结果里包含时间戳。在脚本中打印 `res[0]["timestamp"]` 即可查看。
