# Memory Leak & Stress Test Report

**Generated:** 2025-12-10T00:07:28.110236

**Total Tests:** 7


## Phase 1: Memory Leak Verification

### Short Audio Test (super_long_1h.wav)

- **Status:** success
- **RTF:** 0.103
- **Memory Delta:** +0.5 MB

## Phase 2: Concurrency Stress Test

### Concurrency Level: 2
- **Tasks:** 2
- **Success:** 2/2
- **Failed:** 0
- **Avg RTF:** 0.189
- **Result:** ✅ Stable

### Concurrency Level: 3
- **Tasks:** 2
- **Success:** 2/2
- **Failed:** 0
- **Avg RTF:** 0.148
- **Result:** ✅ Stable

> [!IMPORTANT]
> **Maximum Stable Concurrency:** 3

## Detailed Results

| Test ID | Audio | Concurrency | Status | RTF | Memory Δ (MB) |
|:--------|:------|:-----------:|:------:|:---:|:-------------:|
| super_long_1h_c1_1765278068... | super_long_1h.wav | 1 | ✅ success | 0.103 | +0.5 |
| super_long_1.5h_c1_1765278458... | super_long_1.5h.wav | 1 | ✅ success | 0.096 | +0.6 |
| super_long_1h_c1_t0_1765279938... | super_long_1h.wav | 1 | ✅ success | 0.218 | -0.9 |
| super_long_1h_c2_t0_1765280452... | super_long_1h.wav | 2 | ✅ success | 0.139 | +1.5 |
| super_long_1h_c2_t1_1765280824... | super_long_1h.wav | 2 | ✅ success | 0.240 | +0.9 |
| super_long_1h_c3_t0_1765281194... | super_long_1h.wav | 3 | ✅ success | 0.099 | N/A |
| super_long_1h_c3_t1_1765281552... | super_long_1h.wav | 3 | ✅ success | 0.197 | -0.8 |