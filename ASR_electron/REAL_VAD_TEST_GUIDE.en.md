# FunASR VAD Real Model Test Guide

> **Language**: [English](REAL_VAD_TEST_GUIDE.en.md) | [简体中文](REAL_VAD_TEST_GUIDE.zh-CN.md)

## Test Environment

Services started:
- ✅ HTTP Server: `http://localhost:8888`
- ✅ Electron Dev Server: `npm run dev`

## Test Steps

### Method 1: Browser Test (Recommended)

This is the most direct way to test, using the real FunASR ONNX model.

1. **Open Test Page**
   ```
   http://localhost:8888/test_real_vad.html
   ```

2. **Wait for Model Load**
   - The page automatically loads `/models/model.onnx` and `/models/vad.mvn`.
   - Seeing "✅ FunASR VAD Model Loaded" indicates success.

3. **Select Test Audio**
   - Click "Choose File" button.
   - Select: `/home/tiger/Projects/ASR_pc_front/recording/long_audio_test.wav`.
   - Wait for audio to load.

4. **Start Test**
   - Click "Start Test" button.
   - Observe dynamic logs and progress bar.
   - View detected chunk count.

5. **View Results**
   - Chunk cards will be displayed upon completion.
   - Logs show detailed info for each chunk.
   - Compare chunk count and duration distribution.

### Method 2: Direct Test in Electron App

1. **Open Electron App**
   - App should be running (`npm run dev`).
   - Open Developer Tools Console.

2. **Switch to VAD Mode**
   - Press F9 to open settings.
   - Select "VAD Mode".
   - Set time limit (e.g., 180 seconds).

3. **Start Recording**
   - Click Record button (or Ctrl+Space).
   - Speak into the microphone.
   - Speak for a bit, then pause for > 0.5s.

4. **Observe Logs**
   You should see logs like:
   ```
   🎤 [VAD] Speech detected | prob=0.XXX | frames=X | buffer=X
   🔊 [VAD] Speaking started (prob=0.XXX, frames=X)
   🔇 [VAD Mode] Silence detected 512ms, executing split
   🎵 [VAD] Chunk #0 split | Size=XXXbytes | Duration=X.XXs
   Sending chunk #0, size: XXXX
   ```

5. **Stop Recording**
   - Click Record button again.
   - Check if remaining audio is sent.
   - Check `queueCount` and processing status.

## Expected Results

### Browser Test
- ✅ Model loads successfully.
- ✅ Detects 100+ chunks (depending on audio content).
- ✅ Average chunk duration 4-7 seconds.
- ✅ All splits occur at silence.
- ✅ No "Buffer Empty" warnings.

### Electron App Test
- ✅ Detects speech start.
- ✅ Auto-splits and sends after 0.5s silence.
- ✅ "Sending chunk #X" log visible.
- ✅ Backend receives audio and starts transcription.
- ✅ `queueCount` increments correctly.
- ✅ `queueCount` decrements after receiving result.
- ✅ No "stuck processing" issues.

## Key Observations

### 1. VAD Detection Sensitivity
- Speech probability (`prob`) should be > 0.1 when speaking.
- Should be < 0.35 when silent.
- If no speech detected:
  - Adjust microphone volume.
  - Lower `speechThreshold`.
  - Check microphone permissions.

### 2. Split Accuracy
- Splits should happen at silence.
- Should not cut speech in the middle.
- Chunk length should be reasonable (2-10s).

### 3. Performance
- Browser Test: 12-minute audio should finish within 30s.
- Electron Test: Detection with minimal latency.
- CPU usage should be reasonable (< 30%).

## Troubleshooting

### Issue 1: Model Load Failure
```
❌ Check file existence:
   - /home/tiger/Projects/ASR_electron/public/models/model.onnx
   - /home/tiger/Projects/ASR_electron/public/models/vad.mvn
```

### Issue 2: Speech Not Detected
```
🔧 Adjust Thresholds:
   - Lower speechThreshold to 0.05.
   - Increase logs to observe probability values.
   - Check if audio has sound.
```

### Issue 3: Too Frequent Splits
```
🔧 Adjust Silence Trigger:
   - Increase minSilenceDurationMs to 800ms.
   - Adjust silenceThreshold.
```

### Issue 4: Stuck Processing
```
🔧 Check:
   1. Is there a "Sending chunk" log?
   2. Is queueCount incrementing?
   3. Is backend receiving data?
   4. Is asr-result event received?
```

## Next Steps

After testing, based on results:

1. **If Passed** → Deploy to production.
2. **If Inaccurate** → Adjust threshold parameters.
3. **If Performance Issues** → Optimize buffering strategy.
4. **If Model Issues** → Check model files or use backup plan.

---

**Now please open browser and visit test page to start!** 🚀
