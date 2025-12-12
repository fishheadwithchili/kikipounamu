# Linux Electron Frameless Window Offset Issue Investigation

## Context
**Goal:** Upgrade Electron app UI to expert level (Glassmorphism + Dark Theme) with frameless window (`frame: false`).
**Environment:** Windows 11 running WSL2 (Ubuntu 22.04.3 LTS).
**Problem:** Abnormal vertical offset in UI content, traffic light controls invisible or misplaced, and potential rendering layer conflicts.

## Root Cause Analysis

### 1. WSL2 Specifics
The WSL2 environment is a core factor.
- **No Native GUI:** WSL2 requires an X Server (like VcXsrv) or WSLg to display GUIs.
- **Double Rendering Layers:** Electron → Linux GUI → X Server → Windows Display. Each layer can introduce offsets.
- **Networking:** WSL2 runs in a VM, so `DISPLAY` environment variable misconfiguration is common.

### 2. Confirmed Electron + Linux Frameless Window Bugs
Research confirms this is a classic Electron on Linux issue:
- **Maximized Offset:** Frameless windows often calculate size/position incorrectly when maximized.
- **Secondary Monitor Overflow:** Ghosting on secondary monitors when maximized.
- **Fullscreen Behavior:** Unpredictable behavior when toggling fullscreen.
- **Wayland Issues:** Dynamic resizing on focus loss, incorrect scaling, and mouse click misalignment.

### 3. Transparent Window Bug in WSL2
Transparent windows (`transparent: true`) are notoriously problematic in WSL2 due to upstream NVIDIA driver bugs with the alpha channel.
*Workaround:* Use `--enable-transparent-visuals --disable-gpu` (but removing transparency is safer).

## Recommended Solutions

### Solution A: Fix WSL2 Environment (Priority)
1.  **Check X Server:** Ensure VcXsrv/WSLg is running.
2.  **Fix DISPLAY Variable:**
    ```bash
    export DISPLAY=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}'):0
    ```
3.  **Install Dependencies:**
    ```bash
    sudo apt install -y libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev
    ```

### Solution B: Electron Configuration Tweaks
1.  **Disable Hardware Acceleration:**
    In `main.ts`: `app.disableHardwareAcceleration();`
2.  **Delay Window Show:**
    Wait for `ready-to-show` and then `setTimeout(..., 300)` before showing the window to allow layout to settle.
3.  **Force Layout Refresh:**
    Call `win.setBounds(win.getBounds())` in `ready-to-show`.

### Solution C: Alternatives
1.  **Use `titleBarStyle: 'hidden'`:** Instead of `frame: false`.
2.  **Use Windows Electron:** Run the Windows version of Electron from WSL2 (`npm install --platform=win32 electron`).
