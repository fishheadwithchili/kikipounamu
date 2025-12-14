# VAD 模式故障分析报告

**检测者**: Antigravity  
**日期**: 2025-12-14  
**目标文件**: `ASR_electron/test/special/20251214214419_vad_log.txt`

## 1. 发现 (Findings)

通过分析提供的日志文件，观察到以下关键现象：

1.  **振幅正常**：
    `[AudioFlow]` 日志显示采集到的音频振幅（Amp）变化正常，经常出现 `0.5`, `0.9` 甚至 `1.0` (归一化 Float32 范围) 的峰值。这证明麦克风输入正常，且 `useVADRecording.ts` 接收到了正确的声音信号。
    
    > 示例: `[2025-12-14T08:45:01.332Z] [AudioFlow] Amp=1.0023 Avg=0.1637`

2.  **概率死锁**：
    `[VAD-Detect]` 日志显示的语音概率（Prob）始终恒定为 `0.0040`。这是极低值（通常是模型的输出下限或 Silence 类的 Softmax 结果），即便在振幅达到 `1.0023` (过载) 时，概率依然纹丝不动。
    
    > 示例: `[2025-12-14T08:45:05.216Z] [VAD-Detect] Prob=0.0040 | Amp=0.0018`
    > 示例: `[2025-12-14T08:44:58.807Z] [VAD-Detect] Prob=0.0040 | Amp=0.8627` (高音量，低概率)

3.  **误判静音**：
    由于概率始终低于 `speechThreshold`，系统不断触发 `Silence threshold met` 事件，导致无法切分语音片段，最终导致缓冲区无限增长（Buffer 达到 2072+ 个片段）。

## 2. 结论 (Conclusion)

**根本原因：VAD 模型输入数据的幅度（Scaling）不匹配。**

FunASR (FSMN-VAD) 以及大多数基于 Kaldi 特征的语音模型，在进行特征提取（Fbank/MFCC）时，通常期望输入的 PCM 数据是 **16-bit 整数范围** (即 +/- 32768)，或者在计算 Log Energy 之前需要将信号缩放到该范围。

- **现状**：Web Audio API 的 `ScriptProcessor` 或 `AudioWorklet` 输出的 PCM 数据是归一化的 **Float32 范围 [-1.0, 1.0]**。
- **问题**：代码直接将 [-1, 1] 的数据传递给了 `funasrVAD` 和 `fbank`。
- **后果**：对于模型而言，幅度 `1.0` (其期望范围是 `32768`) 相当于极度微弱的信号（约 -90dB），几乎被视为绝对静音。因此，无论作为人类听起来多大声，对模型来说都是 "安静"。

## 3. 问题代码位置 (Problematic Code)

代码问题主要在于数据传递给特征提取器之前未进行增益缩放。

**文件**: `ASR_electron/src/services/funasrVAD.ts`  
**位置**: `detect` 方法 或 其调用的 `fbank.ts`

在 `src/services/fbank.ts` 中，`computeLogMelFrames` 直接使用了输入的 float 数组进行 FFT 和 Log 操作，没有乘以 `32768`。

```typescript
// src/services/fbank.ts
// ...
export function extractFbank(audioData: Float32Array): Float32Array {
    // 缺少缩放步骤
    // audioData (max 1.0) -> FFT -> Energy is tiny -> Log Energy is very negative
    // ...
}
```

作为对比，`src/utils/audioHelper.ts` 在保存 WAV 文件时正确地执行了缩放：

```typescript
// src/utils/audioHelper.ts
// 正确的做法 (在保存音频时有做，但在 VAD 检测时没做)
view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
```

## 4. 推荐 (Recommendation)

建议在将音频数据传给 `funasrVAD` 进行检测之前，或者在 `fbank.ts` 内部，将数据乘以 32768。

**方案 A (推荐 - 修改 VAD 服务调用处):**
在 `src/services/funasrVAD.ts` 的 `detect` 方法中，对输入的 `audioData` 进行缩放拷贝。

**方案 B (修改特征提取):**
在 `src/services/fbank.ts` 的 `computeLogMelFrames` 开头添加缩放逻辑。

## 5. 依据 (Basis)

1.  **日志证据**：`Amp=0.8627` 时 `Prob=0.0040`。只有输入数值量级错误（导致 Log Mel 特征值极小）才能解释这种"大音量下的绝对静音判定"。
2.  **代码审查**：`fbank.ts` 中直接对输入执行 FFT，无缩放系数。Web Audio API 标准输出为 [-1, 1]。FunASR 模型训练数据为 16-bit PCM。
3.  **对比验证**：项目中的 `audioHelper.ts` 明确包含了 `sample * 0x8000` 的逻辑，说明项目其他部分遵循 16-bit 标准，但 VAD 模块遗漏了此步骤。
