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
