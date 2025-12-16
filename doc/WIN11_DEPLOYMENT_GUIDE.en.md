# Windows 11 Full "3+2" System Deployment Guide

This guide is specifically optimized for **Windows 11** users to fully deploy all components of the ASR system locally.

> **Language Switch**: [English](WIN11_DEPLOYMENT_GUIDE.en.md) | [简体中文](WIN11_DEPLOYMENT_GUIDE.zh-CN.md)

---

## What is the "3+2" Architecture?

The system consists of **3 Core Services** and **2 Infrastructure Dependencies**, collectively referred to as the "3+2" architecture.

### 3 Core Services
1.  **ASR Python Worker**: The "Brain". Handles heavy AI computations, fetching audio from the Redis queue and transcribing it.
2.  **ASR Python API**: The "Gateway". Provides HTTP interfaces, receiving requests from the frontend and dispatching tasks to Redis.
3.  **ASR Go Backend**: The "Steward". Manages business logic, user history, and interactions with the PostgreSQL database.

### 2 Infrastructure Dependencies
1.  **Redis**: The "Messenger". Acts as a message queue connecting the API and Worker, ensuring efficient task distribution.
2.  **PostgreSQL**: The "Warehouse". Persistently stores all user data and transcription history.

*(Plus 1 Client: **ASR Electron App**, which is the user-facing interface)*

---

## 📖 Table of Contents

*   [Prerequisites](#-prerequisites)
*   [**Option 1: PowerShell Deployment (Recommended)**](#-option-1-powershell-deployment-recommended)
    *   [1. Start Infrastructure](#1-start-infrastructure)
    *   [2. Start Python Services (Worker & API)](#2-start-python-services-worker--api)
    *   [3. Start Go Backend](#3-start-go-backend)
    *   [4. Start Electron Client](#4-start-electron-client)
*   [**Option 2: Git Bash Deployment**](#-option-2-git-bash-deployment)
    *   [Jump to Git Bash Guide](#-option-2-git-bash-deployment)
*   [Verification & Troubleshooting](#-verification--troubleshooting)

---

## 🛠️ Prerequisites

Before starting, ensure you have the following installed:

1.  **Git**: [Download](https://git-scm.com/download/win)

22.  **Python 3.10.12**: [Download](https://www.python.org/ftp/python/3.10.12/python-3.10.12-amd64.exe) (Make sure to check "Add Python to PATH" during installation)
3.  **Go 1.24.5**: [Download](https://go.dev/dl/go1.24.5.windows-amd64.msi)
4.  **Node.js 24.11.1**: [Download](https://nodejs.org/dist/v24.11.1/node-v24.11.1-x64.msi)
5.  **FFmpeg (Latest)**: 
    *   [Download 7z archive](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z)
    *   Extract to recommended location: `C:\ffmpeg` (or any directory you prefer)
    *   Add the full path of the `bin` directory to System Environment Variables Path, e.g.: `C:\ffmpeg\bin`
    *   How to configure PATH: `Windows Settings` → `System` → `Advanced system settings` → `Environment Variables` → Find `Path` in `System variables` → `Edit` → `New` → Paste bin path → `OK`
    *   Verify installation: Open a new terminal and run `ffmpeg -version`
6.  **Databases**:
    *   **Redis 5.0.14.1**: [Download MSI Installer](https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.msi) (Native Windows, supports Streams).
        *   **Note**: Ensure you check ✅ `Add the Redis installation folder to the PATH environment variable` during installation.
        *   **Fix**: If `redis-server` or `redis-cli` commands are **not recognized**, manually add `C:\Program Files\Redis` to your system **Path** environment variable and **restart your terminal**.
    *   **PostgreSQL 14.20**: [Download Installer](https://get.enterprisedb.com/postgresql/postgresql-14.20-1-windows-x64.exe) (Default user `postgres`, set password to `123456`).
        *   **Note**: After installation, if prompted for "Stack Builder", click **Cancel** to skip. It is not required for this project.

---

## 🟢 Option 1: PowerShell Deployment (Recommended)

If you are comfortable with the native Windows PowerShell, follow these steps.

> **Tip**: If you encounter permission errors, try running PowerShell as **Administrator**.

### 1. Start Infrastructure

Ensure Redis and PostgreSQL are running.

```powershell
# Start Redis (Assuming installed as Windows Service, usually starts auto)
# If manual start needed:
redis-server
```

*PostgreSQL usually runs automatically as a Windows Service. You can verify this in Task Manager.*

### 2. Start Python Services (Worker & API)

We need two separate PowerShell windows (or tabs).

**Window A: Start Worker (Process Tasks)**

```powershell
cd ASR_server
# Allow scripts to run (Only needed once):
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

.\scripts\start_unified_worker.ps1
```

**Window B: Start API Server (Receive Requests)**

```powershell
cd ASR_server
.\scripts\start_api_server.ps1
```

### 3. Start Go Backend

Open a new PowerShell window.

```powershell
cd ASR_go_backend
.\scripts\start_backend.ps1
```

### 4. Start Electron Client

Open a new PowerShell window.

```powershell
cd ASR_electron
.\scripts\start_electron.ps1
```

---

## 🟠 Option 2: Git Bash Deployment

If you prefer a Unix-like command line experience, you can use Git Bash.

### 1. Start Infrastructure

```bash
# Start Redis in background
redis-server &
```

### 2. Start Python Services

**Window A: Worker**

```bash
cd ASR_server

# Install uv and sync
pip install uv
uv sync

# Activate environment (Note path format)
source .venv/Scripts/activate

# Start Worker
python src/worker/unified_worker.py --name worker-1 --stream asr_tasks --group asr_workers
```

**Window B: API Server**

```bash
cd ASR_server
source .venv/Scripts/activate
uvicorn src.api.main:app --host 0.0.0.0 --port 8000
```

### 3. Start Go Backend

```bash
cd ASR_go_backend
go mod tidy
go run cmd/server/main.go
```

### 4. Start Electron Client

```bash
cd ASR_electron
npm install
npm run dev
```

---

## ✅ Verification & Troubleshooting

### Verification Steps
1.  **API**: Visit `http://localhost:8000/docs`, you should see the Swagger documentation.
2.  **Go Backend**: Visit `http://localhost:8080/health` (assuming port 8080), it should return OK.
3.  **Electron**: The client window should pop up normally.

### Troubleshooting

*   **PowerShell Script Execution Disabled**:
    *   Error: `cannot be loaded because running scripts is disabled on this system`
    *   Fix: Run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.
*   **FFmpeg Not Found**:
    *   Ensure you have downloaded FFmpeg and added its `bin` directory to your Windows System Environment Variables `Path`. Restart your terminal for changes to take effect.
*   **Redis Command Not Found (redis-server / redis-cli)**:
    *   Error: `The term 'redis-server' is not recognized...`
    *   Cause: Redis installation directory is not in the system Path, though the service might be running in the background.
    *   Fix: Add `C:\Program Files\Redis` to your User Environment Variables Path. **You must restart your terminal** for changes to take effect.
