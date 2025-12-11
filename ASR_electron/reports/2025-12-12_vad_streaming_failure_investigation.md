# VAD Streaming Segmentation Debugging Retrospective

**Date:** 2025-12-12  
**Status:** Abandoned / Reverted to Master  
**Component:** Electron Frontend (VAD Service)

## 1. Issue Description

The user attempted to implement a "VAD Mode" where the system should perform **streaming segmentation** of audio while the user is speaking. The expected behavior was for the VAD (Voice Activity Detection) module to detect silence intervals and cut/send audio chunks in real-time.

**Observed Behavior:**
- The VAD module failed to convert speech into chunks during recording.
- Segmentation only occurred after the user manually stopped the recording.
- The "Unlimited Mode" (which logic manually prevents cutting) was verified to pass audio correctly, yet VAD mode behaved similarly to unlimited mode in practice (buffering indefinitely).

## 2. Debugging Process

### 2.1 Audio Stream Verification
**Hypothesis:** The VAD module might be receiving silent or corrupted audio data, different from what the visualizer sees.

**Action:**
- Instrumented both the `Waveform` component and the `useVADRecording` hook.
- Implemented a synchronized debug recording mechanism using a shared `debugSessionId`.
- Captured `_wave.wav` (frontend visualizer input) and `_vad.wav` (VAD processing input) for identical time windows.

**Result:**
- Both WAV files contained valid, clear audio.
- This ruled out issues with the `AudioContext` resampling or audio capture pipeline. The VAD module was receiving the correct audio data.

### 2.2 Internal Logic Probing
**Hypothesis:** The VAD algorithm was running but detecting low probabilities.

**Action:**
- Inserted logging probes inside the `processAudioChunk` loop, specifically after the `vad.detect()` call.
- Analyzed logs for `speechProb` (speech probability) and `Amp` (Amplitude).

**Result:**
- Logs showed high Amplitude (e.g., `Amp=0.44`, clearly speaking) but extremely low Speech Probability (e.g., `Prob=0.004`).
- Because probabilistic thresholds were never met, the `isSpeaking` state was never triggered, and thus "silence after speech" cutting logic never executed.

### 2.3 Model Output Analysis (Root Cause Discovery)
**Hypothesis:** The interpretation of the ONNX model output was incorrect.

**Investigation:**
- Reviewed `funasrVAD.ts` output parsing logic. The code assumed the model output was a simple 2D array (or flattened array representing `[silence, speech]`).
- Checked the model configuration (`vad.yaml`).
- **Critical Finding:**
    - The FSMN-VAD model output dimension is **248**, not 2.
    - The output represents raw **logits** for 248 acoustic states, not a simple normalized probability distribution.
    - `vad.yaml` defined `sil_pdf_ids: [0]`, meaning index 0 is the silence state, and the rest represent speech states.
    - The existing code was summing indices or averaging them incorrectly based on a false assumption of the output shape.

## 3. Attempted Fix & Conclusion

**Proposed Fix:**
- Implement a `softmax` function to convert raw logits into probabilities.
- Correctly calculate: `Silence Prob = softmax(output)[0]` and `Speech Prob = 1 - Silence Prob`.

**Outcome:**
- While the root cause was identified and a fix was prototyped, the user decided to **abandon the current debugging branch** (`vad_bug`) and revert the repository to the `master` branch.
- The complexity of fixing the ONNX runtime integration and validating the numerical stability of the custom Softmax implementation was deemed out of scope for the immediate session.

## 4. Summary
The failure of streaming VAD segmentation was due to a **mismatch between the shape of the ONNX model output (248-dim logits) and the frontend TypeScript implementation (expecting 2-dim probs)**. Future work on this feature must address this tensor shape mismatch and strictly follow the FunASR post-processing specification.
