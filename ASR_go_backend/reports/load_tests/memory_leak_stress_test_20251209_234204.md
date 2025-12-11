# Memory Leak & Stress Test Report

**Generated:** 2025-12-09T23:43:30.855179

**Total Tests:** 3


## Phase 1: Memory Leak Verification

### Long Audio Test (long_audio_test.wav)

- **Status:** success
- **Processing Time:** 126.6s
- **RTF:** 0.172 ✅ (Faster than real-time)
- **Worker RSS Before:** 12.5 MB
- **Worker RSS After:** 13.3 MB
- **Memory Delta:** +0.9 MB ✅

> [!NOTE]
> **Memory Leak Fix VERIFIED** ✅
> Memory delta (+0.9 MB) is well below the 200 MB threshold.
> Previous issue: +3867 MB → Current: +0.9 MB

### Short Audio Test (20251207_1033_recording.wav)

- **Status:** success
- **RTF:** 0.574
- **Memory Delta:** -0.8 MB

## Detailed Results

| Test ID | Audio | Concurrency | Status | RTF | Memory Δ (MB) |
|:--------|:------|:-----------:|:------:|:---:|:-------------:|
| 20251207_1033_recording_c1_176... | 20251207_1033_record... | 1 | ✅ success | 0.574 | -0.8 |
| long_audio_test_c1_1765277015... | long_audio_test.wav | 1 | ✅ success | 0.172 | +0.9 |
| 20251207_1033_recording_c1_t0_... | 20251207_1033_record... | 1 | ✅ success | 0.532 | -1.0 |