# VAD Diagnosis Report

> **Language**: [English](VAD_DIAGNOSIS.en.md) | [简体中文](VAD_DIAGNOSIS.zh-CN.md)

## Symptoms

1. **Stuck Processing** - Always in processing state after sending audio.
2. **No Audio Split** - No evidence of VAD splitting in logs.
3. **Buffer Empty** - "Buffer empty" warning when stopping recording.

## Root Cause Analysis

### 🔴 Core Issue: Fatal Defect in VAD Logic

Based on logs and code analysis:

```
Log shows:
useVADRecording.ts:187 🔈 VAD Silence Prob: 0.004  ← This is problematic!
```

**Issue 1: Confusing Logs**

In code lines 186-188:
```typescript
if (Math.random() < 0.05) {
    console.log(`🔈 VAD Silence Prob: ${speechProb.toFixed(3)}`);
}
```

This code is inside `else if (speechProb < VAD_CONFIG.silenceThreshold)`, but it shows "Silence Prob: 0.004". This value is indeed **far less than** `silenceThreshold` (0.35), meaning:

- **speechProb = 0.004** (Very low speech probability)
- **0.004 < 0.35 (silenceThreshold)** - Meets silence condition ✅
- **But 0.004 < 0.2 (speechThreshold)** - Does not meet speech condition ❌

Wait, `speechProb` means probability of SPEECH.
So VAD **correctly detected silence**, but the log label "Silence Prob" is misleading (it printed speech probability).

**Issue 2: Meaning of speechProb**

FunASR VAD output `speechProb` means:
- **Higher value = More likely Speech**
- **Lower value = More likely Silence**

So:
- `speechProb >= 0.2` → Speech
- `speechProb < 0.35` → Silence

**Issue 3: What actually happened**

From log `🔈 VAD Silence Prob: 0.004`:
1. User spoke.
2. VAD detected prob 0.004 (Extremely low).
3. VAD thinks it is **Silence**.
4. Thus **No audio buffered** (Line 199-203 logic).

```typescript
} else {
    // vad mode: only buffer if we were speaking (hangover)
    if (isSpeaking) {
        speechBufferRef.current.push(inputBuffer.slice());
    }
}
```

If `isSpeaking` never becomes true, silence is not buffered, resulting in empty buffer!

### 🔴 Secondary Issue: Why Stuck Processing?

From `App.tsx`:

```typescript
// Lines 148-152
vad.onChunkReady((chunkIndex, audioData, _rawPCM) => {
    console.log(`Sending chunk #${chunkIndex}, size: ${audioData.byteLength}`);
    const base64 = arrayBufferToBase64(audioData);
    window.ipcRenderer.invoke('send-audio-chunk', base64);
});
```

**Problem:**
1. `onChunkReady` sends audio.
2. Logs show **callback didn't trigger** (No "Sending chunk").
3. Means **No audio sent**.
4. But `queueCount` incremented in `stopRecording` (Line 106).
5. Frontend waits for result, backend received nothing!

### 🔴 Tertiary Issue: VAD Model Detection Failure

**Possible Causes:**
1. **Mic Volume too low**.
2. **Noise interference**.
3. **Threshold too high** (`0.2` might be too high).
4. **Model State** needs reset.

## Solutions

### Solution 1: Lower Speech Threshold

```typescript
const VAD_CONFIG = {
    speechThreshold: 0.1,       // Lowered from 0.2 to 0.1
    silenceThreshold: 0.35,     
    minSpeechDurationMs: 200,   
    minSilenceDurationMs: 500,  
};
```

### Solution 2: Add Energy Detection Pre-check

```typescript
function calculateEnergy(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
}
// Skip VAD if energy < 0.01
```

### Solution 3: Fix queueCount Logic

Only increment when actually sending:

```typescript
// In App.tsx
vad.onChunkReady((chunkIndex, audioData, _rawPCM) => {
    // ... send ...
    setQueueCount(prev => prev + 1);
});
// Remove queueCount++ in toggleRecording
```

### Solution 4: Force Buffer in VAD Mode

```typescript
} else {
    // Buffer silence too (preserve context)
    speechBufferRef.current.push(inputBuffer.slice());
}
```

## Recommendations

I suggest fixing in this order:

1. **Immediate**: Lower speech threshold to 0.1.
2. **Immediate**: Buffer silence frames in VAD mode.
3. **Immediate**: Fix `queueCount` logic.
4. **Debug**: Add detailed logs.
5. **Long-term**: Add Energy Detection.
