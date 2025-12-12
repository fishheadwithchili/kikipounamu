# VAD Real World Test Summary

> **Language**: [English](REAL_TEST_SUMMARY.en.md) | [简体中文](REAL_TEST_SUMMARY.zh-CN.md)

## Problem Identification

After attempting to create automated Node.js tests, I identified several key points:

### ✅ Model Successfully Loaded
- ONNX model file loaded correctly.
- Input nodes: `speech, in_cache0, in_cache1, in_cache2, in_cache3`.
- Output nodes: `logits, out_cache0, out_cache1, out_cache2, out_cache3`.

### 🔍 Model Input Requirements
- Expected input dimensions: `[1, frames, 400]` (not 80).
- This indicates a need for LFR (Low Frame Rate) feature concatenation.
- LFR Context = 5, so 80 × 5 = 400 dimensions.

### ⚠️ Complexity of Full Implementation
A real FunASR VAD requires:
1. ✅ Reading WAV files.
2. ✅ Normalizing PCM data.
3. ❌ **Full Fbank Feature Extraction** (Requires FFT, Mel filters, etc.).
4. ❌ **LFR (Low Frame Rate) Concatenation** (5 frames context).
5. ✅ CMVN Normalization.
6. ✅ ONNX Inference and FSMN cache management.

The browser versions `funasrVAD.ts` and `fbank.ts` have already implemented the full process.

## 📋 Actual Test Plan

Since full automation logic is complex to replicate in Node, I recommend the following:

### Plan A: Direct Test via Electron App ⭐ Recommended

**Steps:**
1. Electron App is already running (`npm run dev`).
2. Open Developer Tools (Ctrl+Shift+I or F12).
3. Switch to VAD Mode (F9 → VAD Mode).
4. Start recording and speak.
5. Observe console logs.

**Expected Logs:**
```javascript
🎤 [VAD] Speech detected | prob=0.XXX | frames=X | buffer=X
🔊 [VAD] Speaking started (prob=0.XXX, frames=X)
🔇 [VAD Mode] Silence detected 512ms, executing split
🎵 [VAD] Chunk #0 split | Size=XXXbytes | Duration=X.XXs
Sending chunk #0, size: XXXX
```

**Success Criteria:**
- ✅ "Speech detected" logs visible.
- ✅ "Speaking started" logs visible.
- ✅ "Silence detected" and split logs visible after pause.
- ✅ "Sending chunk" logs visible.
- ✅ `queueCount` correctly increments and decrements.
- ✅ Transcription results received.

## 🎯 Verification Checklist

When investigating using the Electron App, please verify:

- [ ] **VAD Model Loaded Success**: Check startup logs for "✅ FunASR VAD Model Loaded".
- [ ] **Speech Detection**: `speechProb > 0.1` when speaking.
- [ ] **Silence Detection**: `speechProb < 0.35` when silent.
- [ ] **Splitting Function**: Auto-split after 0.5s silence; split logs visible.
- [ ] **Data Sending**: "Sending chunk" logs visible; `queueCount` increases.
- [ ] **Backend Processing**: Go backend receives data; starts transcription.
- [ ] **Result Return**: `asr-result` event received; `queueCount` decreases; text displayed.

## 💡 Debugging Tips

If you encounter issues:

### 1. VAD Not Detecting Speech
```typescript
// Temporarily add more logs in useVADRecording.ts
console.log(`[DEBUG] Every frame: prob=${speechProb.toFixed(3)}, buffer=${speechBuffer.length}`);
```

### 2. Check Feature Extraction
```typescript
// In fbank.ts
console.log('[DEBUG] LFR features:', lfrFeatures.length);
console.log('[DEBUG] Feature dim:', lfrFrame.length);
```

## ✅ Fixes I Have Completed

1. **Lowered Speech Detection Threshold** (0.2 → 0.1).
2. **Fixed Buffering Logic** (Always buffer in VAD mode).
3. **Fixed queueCount** (Increment only on actual send).
4. **Enhanced Debug Logs** (More detailed status output).

These fixes have been applied to the code and should resolve previous issues.

## 🚀 Next Steps

**Please test directly in the Electron App and tell me:**
1. Can you see "Speech detected" logs?
2. What is the speech probability value?
3. Does it successfully split and send audio?
4. Do you receive transcription results?
