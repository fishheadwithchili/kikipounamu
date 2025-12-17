# Windows 11 Launcher Deployment Guide

This guide describes how to use the **KikiPounamu Launcher (Tray Launcher)** to manage and run all components of the ASR system with a single click. This is the recommended method, replacing the manual PowerShell scripts.

> **Language**: [English](WIN11_LAUNCHER_GUIDE.en.md) | [简体中文](WIN11_LAUNCHER_GUIDE.zh-CN.md)

---

## 🚀 Introduction

**KikiPounamu Launcher** is a lightweight Windows tray application that helps you:
1.  **One-Click Start/Stop**: Manage all services (Python Worker, API, Go Backend, Electron).
2.  **Auto Configuration**: Visual wizard to set ports, GPU mode, etc.
3.  **Process Guard**: Ensures all child processes are cleanly terminated upon exit.

---

## 🛠️ Prerequisites

Although the Launcher manages processes automatically, ensure the base environment is ready:

1.  **Base Software**: Ensure Python 3.10+, Go 1.24+, and Node.js 24+ are installed.
2.  **FFmpeg**: Ensure `ffmpeg` command is available in your terminal (added to PATH).
3.  **Database**:
    *   **Redis**: Ensure Redis service is installed and running (or `redis-server` is available).
    *   **PostgreSQL**: Ensure PostgreSQL service is installed and running.

---

## 📥 Getting the Launcher

You can get the launcher in two ways:

### Method A: Installer (Recommended)
If you have the `KikiPounamuSetup.exe` (or similar), simply run it. A shortcut will appear on your desktop after installation.

### Method B: Source Compilation
If you are a developer:
1.  Navigate to the `launcher` directory.
2.  Run `compile.bat`.
3.  The generated `KikiPounamuLauncher.exe` will be in the current directory.

---

## 🎮 Usage Guide

### 1. First Run & Configuration

Double-click `KikiPounamuLauncher.exe`. On the first run, a **Configuration Wizard** will appear:

*   **ASR Worker Count**: Number of parallel audio processing workers (Default: 1).
*   **Device Mode**: Choose `cpu` or `cuda` (if you have an NVIDIA GPU).
*   **Ports**: Confirm API (8000) and Backend (8080) ports.

Click **"Save & Continue"**. These settings will be automatically written to the respective `.env` files.

### 2. Tray Control

Once running, the launcher sits in the system tray (bottom-right corner).

*   **Right-click the icon** to open the menu:
    *   **Start All Services**: Start all 4 core services.
    *   **Stop All**: Stop all services.
    *   **Open Client**: Open the Electron client interface only.
    *   **Settings...**: Re-open the wizard to change settings.
    *   **Exit**: Stop services and close the launcher.

### 3. Check Status

After starting, the Electron window should pop up automatically.

---

## ❓ Troubleshooting

### Q: No response after clicking "Start All"?
*   **Check Ports**: Ensure ports 8000 and 8080 are free.
*   **Check Redis**: Ensure Redis is running (`redis-cli ping` returns PONG).
*   **Admin Rights**: Try running the launcher as Administrator.

### Q: How to change settings?
*   Right-click Tray Icon -> Select **Settings...**. Changes apply on next start.

### Q: Still have errors?
*   Try running the exe from a terminal to see console output:
    ```powershell
    .\KikiPounamuLauncher.exe
    ```
