# Linux Electron Frameless Window Offset Issue Investigation

## Context
**Goal:** Upgrade Electron app UI to expert level (Glassmorphism + Dark Theme) with frameless window (`frame: false`).
**Environment:** Windows 11 running WSL2 (Ubuntu 22.04.3 LTS).
**Problem:** Abnormal vertical offset in UI content when recording starts. Content shifts upwards, and the recording button appears deformed.

## Initial Hypothesis & Research
Initially, we suspected a rendering issue common to Electron on Linux/WSL2:
1.  **WSL2 Rendering Layer:** Double rendering (Electron -> Linux GUI -> X Server -> Windows) often introduces offsets.
2.  **Frameless Window Bug:** `frame: false` on Linux has known issues with window maximize/restore coordinates.
3.  **Dynamic Paint Flashing:** `-webkit-app-region: drag` can trigger layout recalculations during DOM updates.

## Attempted Solutions (Failures)
We systematically tested several standard fixes, but none worked:
1.  **`titleBarStyle: 'hidden'`:** Switching from `frame: false` to the standard title bar style did not fix the offset.
2.  **Forced Bounds Refresh:** Manually resizing the window on `ready-to-show` to force a layout recalculation had no effect.
3.  **CSS Layer Isolation:** Adding `will-change: transform` and `transform: translate3d(0,0,0)` to forced GPU layer isolation for drag regions did not resolve the shift.
4.  **Chromium Flags:** Disabling GPU compositing and hardware acceleration via command line flags (`--disable-gpu-compositing`, `--disable-features=CalculateNativeWinOcclusion`) improved stability but did not fix the recording offset.

## Pivot & Observation
The breakthrough came from observing **when** the offset happened:
- **Observation:** The window was correctly sized and positioned on launch. The offset *only* occurred when clicking the "Record" button.
- **Visual Clue:** The recording button itself was deformed in the screenshot provided by the user.
- **Deduction:** This wasn't a window-level rendering bug, but a **dynamic layout issue** triggered by the state change from "Ready" to "Recording".

## Root Cause Analysis
We examined the component responsible for the recording UI (`ControlDock` in `TranscriptionPane.tsx`) and found a critical CSS size mismatch:

1.  **Container:** The `ControlDock` has a flex container for the visualizer with a fixed height of **40px**.
2.  **Component:** The `Waveform` component (rendered only during recording) had a hardcoded canvas height of **60px**.

When recording started, the 60px canvas was injected into the 40px container. This caused an immediate layout overflow, pushing the parent container and surrounding elements (including the drag region and top bar) upwards, resulting in the visual "offset".

## Final Solution
We applied a precise CSS fix to ensure layout stability:
1.  **Match Heights:** Updated `Waveform.tsx` to set the canvas height to `40px`, matching its container.
2.  **CSS Containment:** Added `contain: strict` to the canvas to isolate its layout calculations.
3.  **Overflow Protection:** Added `overflow: hidden` and `contain: layout size` to the parent container in `TranscriptionPane.tsx` to prevent any future child elements from affecting the parent layout.

## Result
The layout is now stable. Switching between "Ready" and "Recording" states no longer triggers a layout shift, and the visual deformation is gone.
