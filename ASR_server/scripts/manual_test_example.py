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
        self.hotwords = self._load_hotwords("src/hotwords.txt")
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
            batch_size_s=500,       # 批处理大小
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
    test_file = "src/input/20251201_0851_recording.wav" 
    
    # 开始识别
    if os.path.exists(test_file):
        result = recognizer.recognize(test_file)
        print("\n📝 识别结果:\n" + "="*50)
        print(result)
        print("="*50)
    else:
        print(f"请准备一个测试音频文件: {test_file}")