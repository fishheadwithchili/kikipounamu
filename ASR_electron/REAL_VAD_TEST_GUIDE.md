# FunASR VAD 真实模型测试指南

## 测试环境

已启动的服务：
- ✅ HTTP 服务器: `http://localhost:8888`
- ✅ Electron 开发服务器: `npm run dev`

## 测试步骤

### 方式 1: 浏览器测试（推荐）

这是最直接的测试方式，使用真实的 FunASR ONNX 模型。

1. **打开测试页面**
   ```
   http://localhost:8888/test_real_vad.html
   ```

2. **等待模型加载**
   - 页面会自动加载 `/models/model.onnx` 和 `/models/vad.mvn`
   - 看到 "✅ FunASR VAD 模型加载完成" 表示成功

3. **选择测试音频**
   - 点击 "选择文件" 按钮
   - 选择: `/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav`
   - 等待音频加载完成

4. **开始测试**
   - 点击 "开始测试" 按钮
   - 观察实时日志和进度条
   - 查看检测到的切片数量

5. **查看结果**
   - 测试完成后会显示切片卡片
   - 日志中会显示每个切片的详细信息
   - 对比切片数量和时长分布

### 方式 2: 直接在 Electron 应用中测试

1. **打开 Electron 应用**
   - 应用应该已经在运行 (`npm run dev`)
   - 查看开发者工具控制台

2. **切换到 VAD 模式**
   - 按 F9 打开设置
   - 选择 "VAD Mode"
   - 设置时间限制（如 180 秒）

3. **开始录音**
   - 点击录音按钮（或按 Ctrl+Space）
   - 对着麦克风说话
   - 说一段话后停顿 0.5 秒以上

4. **观察日志**
   应该看到类似的日志：
   ```
   🎤 [VAD] Speech detected | prob=0.XXX | frames=X | buffer=X
   🔊 [VAD] 开始说话 (prob=0.XXX, frames=X)
   🔇 [VAD模式] 检测到静音 512ms，执行切分
   🎵 [VAD] 音频块 #0 已切分 | 大小=XXXbytes | 时长=X.XXs
   Sending chunk #0, size: XXXX
   ```

5. **停止录音**
   - 再次点击录音按钮
   - 查看是否有剩余音频被发送
   - 检查 queueCount 和 processing 状态

## 预期结果

### 浏览器测试
- ✅ 模型成功加载
- ✅ 检测到 100+ 个切片（取决于音频内容）
- ✅ 平均切片时长 4-7 秒
- ✅ 所有切片都在静音处切分
- ✅ 无 "缓冲区为空" 警告

### Electron 应用测试
- ✅ 能够检测到语音开始
- ✅ 在停顿 0.5 秒后自动切分并发送
- ✅ 看到 "Sending chunk #X" 日志
- ✅ 后端收到音频并开始转录
- ✅ queueCount 正确递增
- ✅ 收到转录结果后 queueCount 递减
- ✅ 不会出现 "一直 processing" 的问题

## 关键观察点

### 1. VAD 检测灵敏度
- 语音概率 (prob) 应该在说话时 > 0.1
- 静音时应该 < 0.35
- 如果一直检测不到语音，可能需要：
  - 调整麦克风音量
  - 降低 speechThreshold
  - 检查麦克风权限

### 2. 切分准确性
- 切分应该发生在静音处
- 不应该在说话到一半时切分
- 切片长度应该合理（2-10秒）

### 3. 性能表现
- 浏览器测试：12分钟音频应该在 30 秒内完成
- Electron 测试：实时检测无延迟
- CPU 占用应该合理（< 30%）

## 故障排查

### 问题 1: 模型加载失败
```
❌ 检查文件是否存在:
   - /home/tiger/Projects/ASR_electron/public/models/model.onnx
   - /home/tiger/Projects/ASR_electron/public/models/vad.mvn
```

### 问题 2: 检测不到语音
```
🔧 调整阈值:
   - 降低 speechThreshold 到 0.05
   - 增加日志输出观察概率值
   - 检查音频是否有声音
```

### 问题 3: 切片过于频繁
```
🔧 调整静音触发时长:
   - 增加 minSilenceDurationMs 到 800ms
   - 调整 silenceThreshold
```

### 问题 4: 一直 processing
```
🔧 检查:
   1. 是否有 "Sending chunk" 日志
   2. queueCount 是否在递增
   3. 后端是否收到数据
   4. 是否收到 asr-result 事件
```

## 测试文件位置

- **测试页面**: `http://localhost:8888/test_real_vad.html`
- **测试音频**: `/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav`
- **VAD 配置**: `/home/tiger/Projects/ASR_electron/src/hooks/useVADRecording.ts` (第 33-38 行)
- **模型文件**: `/home/tiger/Projects/ASR_electron/public/models/`

## 下一步

测试完成后，根据结果：

1. **如果测试通过** → 部署到生产环境
2. **如果检测不准** → 调整阈值参数
3. **如果性能问题** → 优化缓冲策略
4. **如果模型问题** → 检查模型文件或使用备用方案

---

**现在请打开浏览器访问测试页面开始测试！** 🚀
