# VAD 问题诊断报告

> **语言**: [English](VAD_DIAGNOSIS.en.md) | [简体中文](VAD_DIAGNOSIS.zh-CN.md)

## 问题现象

1. **一直显示 processing** - 音频发送后一直在处理状态
2. **没有看到音频拆分** - 日志中没有显示 VAD 切分的证据
3. **缓冲区为空** - 停止录音时提示缓冲区为空

## 根本原因分析

### 🔴 核心问题：VAD 检测逻辑存在致命缺陷

根据日志和代码分析,发现以下问题:

```
日志显示:
useVADRecording.ts:187 🔈 VAD Silence Prob: 0.004  ← 这里有问题!
```

**问题 1: 日志混淆**

在代码的第 186-188 行:
```typescript
if (Math.random() < 0.05) {
    console.log(`🔈 VAD Silence Prob: ${speechProb.toFixed(3)}`);
}
```

这段代码在 `else if (speechProb < VAD_CONFIG.silenceThreshold)` 分支中,
但显示的是 "Silence Prob: 0.004",这个概率值实际上 **远小于** silenceThreshold (0.35),
这意味着:

- **speechProb = 0.004** - 这是一个非常低的语音概率
- **0.004 < 0.35 (silenceThreshold)** - 满足静音条件,进入静音分支 ✅
- **但 0.004 也 < 0.2 (speechThreshold)** - 不满足语音条件 ❌

这说明 VAD **正确地检测到了静音**,但日志显示为 "Silence Prob" 会让人误解。

**问题 2: speechProb 的含义混淆**

FunASR VAD 输出的 `speechProb` 应该理解为:
- **值越大 = 越可能是语音**
- **值越小 = 越可能是静音**

所以:
- `speechProb >= 0.2` → 语音
- `speechProb < 0.35` → 静音
- `0.2 <= speechProb < 0.35` → 中间状态(既不算明确的语音,也不算明确的静音)

**问题 3: 实际发生的情况**

从日志 `🔈 VAD Silence Prob: 0.004` 来看:
1. 用户说话了
2. VAD 检测到的概率是 0.004 (极低)
3. 这意味着 VAD **认为这是静音**,而不是语音
4. 所以 **根本没有缓冲音频数据** (第 199-203 行的逻辑)

```typescript
} else {
    // vad mode: only buffer if speech was active (hangover)
    if (isSpeaking) {
        speechBufferRef.current.push(inputBuffer.slice());
    }
}
```

如果从未进入 "语音" 状态 (`isSpeaking` 始终为 false),那么静音时也不会缓冲,
导致最终 `speechBuffer` 为空!

### 🔴 第二个问题: 为什么一直 processing?

从 `App.tsx` 的代码看:

```typescript
// 第 148-152 行
vad.onChunkReady((chunkIndex, audioData, _rawPCM) => {
    console.log(`Sending chunk #${chunkIndex}, size: ${audioData.byteLength}`);
    const base64 = arrayBufferToBase64(audioData);
    window.ipcRenderer.invoke('send-audio-chunk', base64);
});
```

**问题:**
1. `onChunkReady` 发送音频到后端
2. 但从日志看,**第二次录音并没有触发这个回调** (没有看到 "Sending chunk" 日志)
3. 这意味着 **没有音频被发送到后端**
4. 但 `queueCount` 却在停止录音时 +1 了 (第 106 行)
5. 所以前端以为有音频在处理,实际上后端根本没收到数据!

### 🔴 第三个问题: VAD 模型可能未正确检测语音

**可能的原因:**

1. **麦克风音量太低** - 导致 VAD 误判为静音
2. **环境噪音干扰** - VAD 模型对背景噪音敏感
3. **阈值设置不合理** - `speechThreshold: 0.2` 可能太高
4. **VAD 模型状态异常** - 需要在每次录音开始时重置

## 解决方案

### 方案 1: 降低语音检测阈值

```typescript
const VAD_CONFIG = {
    speechThreshold: 0.1,       // 从 0.2 降低到 0.1
    silenceThreshold: 0.35,     
    minSpeechDurationMs: 200,   
    minSilenceDurationMs: 500,  
};
```

### 方案 2: 添加音频能量检测作为第一道防线

在 VAD 检测之前,先用简单的能量检测:

```typescript
function calculateEnergy(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
}

// 在 processAudioChunk 中:
const energy = calculateEnergy(inputBuffer);
if (energy < 0.01) {
    // 能量太低,直接判定为静音,跳过 VAD 检测
    return;
}
```

### 方案 3: 修复 queueCount 逻辑

只在真正发送音频时才增加 queueCount:

```typescript
// 在 App.tsx 中修改
vad.onChunkReady((chunkIndex, audioData, _rawPCM) => {
    console.log(`Sending chunk #${chunkIndex}, size: ${audioData.byteLength}`);
    const base64 = arrayBufferToBase64(audioData);
    window.ipcRenderer.invoke('send-audio-chunk', base64);
    
    // 在这里增加 queueCount
    setQueueCount(prev => prev + 1);
});

// 删除 toggleRecording 中第 106 行的 queueCount++
```

### 方案 4: 添加详细的调试日志

```typescript
// 在 processAudioChunk 中添加:
console.log(`[DEBUG] speechProb=${speechProb.toFixed(3)}, ` +
            `speechFrames=${speechFramesRef.current}, ` +
            `silenceFrames=${silenceFramesRef.current}, ` +
            `isSpeaking=${isSpeaking}, ` +
            `bufferSize=${speechBufferRef.current.length}`);
```

### 方案 5: 强制在 VAD 模式下也缓冲所有音频

```typescript
// 修改第 198-203 行:
} else {
    // 静音时也缓冲(保留上下文)
    speechBufferRef.current.push(inputBuffer.slice());
}
```

## 测试建议

1. **使用测试页面** - 我已经创建了 `test_vad.html`,请在浏览器中打开:
   ```
   http://localhost:8888/test_vad.html
   ```
   
2. **观察 VAD 实时概率** - 测试页面会显示实时的语音概率

3. **检查是否能检测到语音** - 大声说话,看概率是否能超过 0.2

4. **检查是否能触发切分** - 说一句话后停顿,看是否会生成音频块

## 推荐行动方案

我建议按以下顺序修复:

1. **立即修复**: 降低语音检测阈值到 0.1
2. **立即修复**: 在 VAD 模式下也缓冲静音帧(保留上下文)
3. **立即修复**: 修复 queueCount 逻辑
4. **调试**: 添加详细日志,观察实际的 speechProb 值
5. **长期优化**: 添加能量检测作为辅助判断

你想让我先实施哪个方案?
