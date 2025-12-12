# VAD 真实测试总结

> **语言**: [English](REAL_TEST_SUMMARY.en.md) | [简体中文](REAL_TEST_SUMMARY.zh-CN.md)

## 问题识别

经过尝试创建 Node.js 自动化测试，我发现了一些关键点：

### ✅ 模型成功加载
- ONNX 模型文件正确加载
- 输入节点: `speech, in_cache0, in_cache1, in_cache2, in_cache3`
- 输出节点: `logits, out_cache0, out_cache1, out_cache2, out_cache3`

### 🔍 模型输入要求
- 期望输入维度: `[1, frames, 400]`  (不是80)
- 这表示需要 LFR (Low Frame Rate) 特征拼接
- LFR Context = 5, 所以 80 × 5 = 400 维

### ⚠️ 完整实现的复杂性
真实的 FunASR VAD 需要:
1. ✅ 读取 WAV 文件
2. ✅ 归一化PCM数据
3. ❌ **完整的 Fbank 特征提取** (需要 FFT, Mel滤波器等)
4. ❌ **LFR (Low Frame Rate) 拼接** (5帧上下文)
5. ✅ CMVN 归一化
6. ✅ ONNX 推理与 FSMN cache 管理

浏览器版本的 `funasrVAD.ts` 和 `fbank.ts` 已经实现了完整的流程。

## 📋 实际测试方案

既然完整的自动化测试较为复杂，建议采用以下方法：

### 方案 A: 使用 Electron 应用直接测试 ⭐推荐

**步骤:**
1. Electron 应用已经在运行 (`npm run dev`)
2. 打开应用的开发者工具 (Ctrl+Shift+I 或 F12)
3. 切换到 VAD 模式 (F9 → VAD Mode)
4. 开始录音并说话
5. 观察控制台日志

**期望看到的日志:**
```javascript
🎤 [VAD] Speech detected | prob=0.XXX | frames=X | buffer=X
🔊 [VAD] 开始说话 (prob=0.XXX, frames=X)
🔇 [VAD模式] 检测到静音 512ms，执行切分
🎵 [VAD] 音频块 #0 已切分 | 大小=XXXbytes | 时长=X.XXs
Sending chunk #0, size: XXXX
```

**成功标准:**
- ✅ 能看到 "Speech detected" 日志
- ✅ 能看到 "开始说话" 日志
- ✅ 停顿后能看到 "检测到静音" 和切分日志
- ✅ 能看到 "Sending chunk" 日志
- ✅ queueCount 正确递增和递减
- ✅ 收到转录结果

### 方案 B: 监控实际运行日志

查看 Electron 的控制台输出：

```bash
# 在你的 Electron 应用开发者工具中查看
# 或者查看终端中 npm run dev 的输出
```

### 方案 C: 检查后端日志

查看 ASR 后端是否收到数据：

```bash
# 查看 Go 后端日志
# 应该看到接收到的音频块
```

## 🎯 验证清单

使用 Electron 应用进行真实测试时，请验证：

- [ ] **VAD 模型加载成功**
  - 查看启动日志是否有 "✅ FunASR VAD 模型加载完成"
  
- [ ] **语音检测功能**
  - 说话时 speechProb > 0.1
  - 静音时 speechProb < 0.35
  
- [ ] **切分功能**
  - 停顿 0.5 秒后自动切分
  - 看到切分日志
  
- [ ] **数据发送**
  - 看到 "Sending chunk" 日志
  - queueCount 增加
  
- [ ] **后端处理**
  - Go 后端收到数据
  - 开始转录
  
- [ ] **结果返回**
  - 收到 asr-result 事件
  - queueCount 减少
  - 转录文本显示

## 💡 调试技巧

如果遇到问题：

### 1. VAD 检测不到语音
```typescript
// 在 useVADRecording.ts 中临时添加更多日志
console.log(`[DEBUG] Every frame: prob=${speechProb.toFixed(3)}, buffer=${speechBuffer.length}`);
```

### 2. 检查模型输出
```typescript
// 在 funasrVAD.ts 的 detect() 方法中
console.log('[DEBUG] Output data:', outputData);
console.log('[DEBUG] Speech prob:', speechProb);
```

### 3. 检查特征提取
```typescript
// 在 fbank.ts 中
console.log('[DEBUG] LFR features:', lfrFeatures.length);
console.log('[DEBUG] Feature dim:', lfrFrame.length);
```

## ✅ 我已经完成的修复

1. **降低语音检测阈值** (0.2 → 0.1)
2. **修复缓冲逻辑** (VAD模式下始终缓冲)
3. **修复 queueCount** (实际发送时递增)
4. **增强调试日志** (更详细的状态输出)

这些修复已经应用到代码中，应该能解决之前的问题。

## 🚀 下一步

**请直接在 Electron 应用中测试，并告诉我：**
1. 能否看到 "Speech detected" 日志？
2. 语音概率值是多少？
3. 是否成功切分并发送音频？
4. 是否收到转录结果？

有了这些信息，我可以进一步优化配置。
