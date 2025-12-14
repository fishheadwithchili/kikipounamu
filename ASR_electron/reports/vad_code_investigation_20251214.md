# VAD 模式代码调研与问题定位报告

**作者**: Antigravity (AI Coding Assistant by Google DeepMind)  
**日期**: 2025年12月14日 21:32 NZDT  
**分析范围**: `ASR_electron/src/services/funasrVAD.ts`, `useVADRecording.ts`, `fbank.ts`

---

## 一、核心发现

### 🚨 致命问题：VAD 语音概率值始终固定为 0.0040

通过对日志和代码的深度分析，我发现：

| 观察现象 | 具体数据 |
|----------|----------|
| VAD日志总行数 | 6568 行 |
| `Prob` 值变化次数 | **0 次** (始终 0.0040) |
| 音频振幅范围 | 0.0012 ~ 1.0053 (正常活跃) |
| `isSpeaking` 状态 | **永远为 false** |
| 切分事件数 | **0 次** |

### 对比：Unlimited 模式表现正常

```
// Unlimited模式 - 正常
[AudioFlow] Amp=0.5496 | isSpeaking=true  ✅ 检测到语音
[AudioFlow] Amp=0.3406 | isSpeaking=true  ✅ 持续追踪

// VAD模式 - 异常
[VAD-Detect] Prob=0.0040 | Amp=0.9207     ❌ 振幅92%，概率仍为0.004
[VAD-Detect] Prob=0.0040 | Amp=1.0053    ❌ 振幅100%，概率依然固定
```

---

## 二、结论

### 根本原因分析

VAD 模型在 `funasrVAD.ts` 的 `detect()` 方法中执行推理后，返回的语音概率值始终为固定的极低值 **0.0040**。这表明：

1. **模型推理输出异常** - ONNX 模型可能未正确加载或执行
2. **输入特征格式不匹配** - 传入模型的 Log Mel + LFR 特征可能与模型期望的格式不符
3. **CMVN 归一化问题** - 归一化参数可能与模型不匹配

### 为什么 `0.0040` 是一个可疑值？

- 这个值是 **sigmoid(约-5.5)** 的结果，表明模型几乎100%确定"不是语音"
- 正常的 VAD 模型在有语音时应输出 0.5~0.99，静音时输出 0.01~0.3
- **完全不变的输出值**表明模型可能：
  - 收到的是全零或无效数据
  - 使用了错误的模型权重
  - 存在维度/形状不匹配

---

## 三、问题代码定位

### 🔴 高度怀疑：`funasrVAD.ts` 第 283-304 行

```typescript
// 10. 解析结果
const outputName = this.session.outputNames[0];
const outputData = results[outputName].data as Float32Array;

let speechProb = 0;
// 输出 shape [1, numInferFrames, 2] ? 或者是 [1, numInferFrames, 1] ?

if (outputData.length === numInferFrames * 2) {
    for (let i = 0; i < outputData.length; i += 2) {
        speechProb += outputData[i + 1];  // ⚠️ 假设 [silence, speech] 布局
    }
    return speechProb / numInferFrames;
} else {
    // Fallback
    for (let i = 0; i < outputData.length; i++) {
        speechProb += outputData[i];
    }
    return speechProb / outputData.length;
}
```

**问题分析：**
- 代码假设模型输出 shape 为 `[1, numFrames, 2]`，其中索引1是语音概率
- **但如果实际输出 shape 或语义不同，这里的解析就完全错误**
- 需要验证 ONNX 模型的实际输出 shape 和语义

---

### 🟠 次要怀疑：特征提取流程

#### 位置：`fbank.ts` + `funasrVAD.ts` 特征管道

```
PCM 音频 → 分帧 → Hamming窗 → FFT → Mel滤波 → Log → LFR拼接 → CMVN → 模型
```

**潜在问题：**

1. **CMVN 参数可能错误** (`vad.mvn` 文件解析)
   - 代码在第 213-227 行应用 CMVN：`(features[i] + means[dimIdx]) * scales[dimIdx]`
   - 需要验证 `means` 和 `scales` 是否正确解析

2. **LFR 上下文处理**
   - 流式处理中的 LFR 帧索引管理复杂
   - 第 198-204 行可能存在边界条件问题

---

### 🟡 低优先级：`useVADRecording.ts` 逻辑

#### 位置：第 246-327 行 VAD 模式处理

代码逻辑本身正确：
- 调用 `vadRef.current.detect(inputBuffer)` 获取概率
- 根据阈值判断是否说话
- 在静音时切分发送

**但由于上游的 `detect()` 始终返回 0.0040，导致：**
- `speechProb >= VAD_CONFIG.speechThreshold (0.1)` **永远为 false**
- `isSpeakingRef.current` **永远无法变为 true**
- 切分逻辑永远不触发

---

## 四、推荐修复方案

### 🔴 立即调试步骤

```typescript
// 在 funasrVAD.ts detect() 方法中添加调试日志
console.log('[VAD DEBUG] Input tensor shape:', inputTensor.dims);
console.log('[VAD DEBUG] Output data length:', outputData.length);
console.log('[VAD DEBUG] Expected frames:', numInferFrames);
console.log('[VAD DEBUG] First 10 output values:', 
    Array.from(outputData.slice(0, 10)).map(v => v.toFixed(4)));
```

### 🟠 验证步骤顺序

1. **验证模型输出格式**
   ```javascript
   // 检查实际输出 shape
   console.log('Output names:', this.session.outputNames);
   console.log('Output[0] dims:', results[outputName].dims);
   ```

2. **验证 CMVN 参数**
   ```javascript
   // 确认 means 和 scales 不是全零
   console.log('CMVN means sum:', this.cmvnMeans.reduce((a,b) => a+b, 0));
   console.log('CMVN scales sum:', this.cmvnScales.reduce((a,b) => a+b, 0));
   ```

3. **验证输入特征统计**
   ```javascript
   // 已有日志，但建议增加更详细的检查
   // 第 237-247 行的 [VAD Input Test] 日志只有 2% 采样率，建议提高
   ```

### 🟢 长期建议

1. **单元测试**：为 VAD 模块添加独立测试用例
2. **参考实现对比**：与 Python 版 FunASR VAD 的输出对比
3. **模型版本确认**：确认 ONNX 模型与 CMVN 参数是配套版本

---

## 五、依据总结

| 证据类型 | 内容 |
|----------|------|
| **日志证据** | 6568行VAD日志中 `Prob` 值无任何变化 |
| **对比证据** | Unlimited模式 `isSpeaking=true`，VAD模式永远 `false` |
| **代码分析** | `detect()` 返回值解析逻辑假设了特定的输出格式 |
| **数学分析** | 0.0040 ≈ sigmoid(-5.5)，表示模型极度确信"非语音" |

---

## 六、快速验证命令

```bash
# 1. 检查模型文件
ls -la ASR_electron/public/models/

# 2. 检查 CMVN 文件内容
head -20 ASR_electron/public/models/vad.mvn

# 3. 搜索相关日志
grep "VAD Input Test" ASR_electron/test/special/20251214210405_vad_log.txt
```

---

*本报告由 Antigravity AI Assistant 自动生成*  
*基于日志分析、代码审查和技术推理*
