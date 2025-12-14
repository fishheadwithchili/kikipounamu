# VAD 模式功能失效分析报告

## 1. 发现 (Findings)

经过对日志文件 (`20251214210405_vad_log.txt` 和 `20251214205740_unlimited_log.txt`) 及源代码的深入分析，我们发现语音活动检测 (VAD) 功能存在严重的**数值缩放不匹配**问题。

具体表现为：
- **Unlimited 模式正常**：该模式下强制认为用户在说话 (`isSpeaking=true`)，音频数据通过 `audioHelper` 转换（包含正确的缩放）并发往后端，因此后端能正常识别。
- **VAD 模式失效**：该模式依赖前端的 ONNX 模型实时判断。尽管麦克风录入的声音振幅很大（Amplitude > 0.5），但 VAD 模型输出的语音概率（Probability）始终维持在极低的基准值 (`0.0040`)，导致系统认为全是静音，从未触发切片逻辑。

## 2. 发现依据 (Evidence)

### A. 日志数据对比
在 `ASR_electron/test/special/20251214210405_vad_log.txt` 中：
```text
[AudioFlow] Amp=0.7538 Avg=0.1039 | Mode=vad ...
[VAD-Detect] Prob=0.0040 | Amp=0.7538
```
可以看到，**Amp (振幅)** 已经高达 `0.75`（Float32 的最大值是 1.0），这是一个非常响亮的声音。然而 **Prob (语音概率)** 依然是 `0.0040`，这通常是模型对“绝对静音”的预测值。

### B. 代码逻辑审查
1.  **输入源**: `useVADRecording.ts` 通过 Web Audio API (`ScriptProcessorNode`) 获取音频，得到的数据是 `Float32Array`，范围在 `[-1.0, 1.0]` 之间。
2.  **VAD 调用**: 在 `processAudioChunk` 函数中，这个原始的微小数值被直接传给了 `funasrVAD.detect(inputBuffer)`。
3.  **模型期望**: FunASR (FSMN-VAD) 这类基于 Kaldi 特征提取的模型，在计算 Fbank/Mel 特征时，通常期望输入的波形数据对应 16-bit 整数的数值范围，即 `[-32768, 32767]`。
4.  **对比验证**: 查看 `src/utils/audioHelper.ts` 中的 `float32ToWav` 函数，可以看到在发送给后端时做了正确的缩放处理：
    ```typescript
    // src/utils/audioHelper.ts
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    ```
    而在 `src/services/funasrVAD.ts` 或 `src/services/fbank.ts` 中，**完全缺失**了类似的 `* 32768` 的缩放操作。

## 3. 结论 (Conclusion)

VAD 模块失效的根本原因是**输入数据未进行正确的幅度缩放 (Amplitude Scaling)**。

将 `[-1.0, 1.0]` 范围的浮点数直接喂给需要 `[-32768, 32767]` 范围的模型，对模型而言，相当于输入了振幅只有 `1/32768` 的极其微弱的信号。这种信号强度远低于任何语音阈值，因此模型判断结果永久为“静音”。

## 4. 建议 (Suggestions)

在特征提取之前，必须将浮点音频数据放大到 16-bit 整数范围。

**建议修复方案**：
在 `src/services/funasrVAD.ts` 的 `detect` 方法中，或者在 `useVADRecording.ts` 调用 `detect` 之前，将输入数据乘以 `32768`。

例如：
```typescript
// 伪代码示例
const scaledBuffer = inputBuffer.map(sample => sample * 32768);
const speechProb = await vadRef.current.detect(scaledBuffer);
```

## 5. 代码问题定位 (Code Issues)

以下是具体的代码问题位置：

1.  **`src/hooks/useVADRecording.ts`**:
    在调用 VAD 检测处 (Line 247)，直接传递了未缩放的 `inputBuffer`。
    ```typescript
    const speechProb = await vadRef.current.detect(inputBuffer);
    ```

2.  **`src/services/funasrVAD.ts`**:
    `detect` 方法 (Line 104) 及其下游的 `computeLogMelFrames` 均假设输入数据已经是正确的量级，缺乏必要的预处理或校验。
