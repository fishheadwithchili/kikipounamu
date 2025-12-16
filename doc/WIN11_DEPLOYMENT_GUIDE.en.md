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

2.  **Python 3.10+**: [Download](https://www.python.org/downloads/windows/) (Make sure to check "Add Python to PATH" during installation)
3.  **Go 1.21+**: [Download](https://go.dev/dl/)
4.  **Node.js 18+ (LTS)**: [Download](https://nodejs.org/en)
5.  **FFmpeg**: [Download](https://www.gyan.dev/ffmpeg/builds/) (Extract and add the `bin` folder to your System Environment Variables Path)
6.  **Databases**:
    *   **Redis**: Recommended to use WSL2, or download [Redis for Windows](https://github.com/tporadowski/redis/releases).
    *   **PostgreSQL**: [Download Installer](https://www.postgresql.org/download/windows/) (Default user `postgres`, set password to `123456`).

---

## 🟢 Option 1: PowerShell Deployment (Recommended)

If you are comfortable with the native Windows PowerShell, follow these steps.

> **Tip**: If you encounter permission errors, try running PowerShell as **Administrator**.

### 1. Start Infrastructure

Ensure Redis and PostgreSQL are running.

```powershell
# Start Redis (if using Windows native version)
redis-server
```

*PostgreSQL usually runs automatically as a Windows Service. You can verify this in Task Manager.*

### 2. Start Python Services (Worker & API)

We need two separate PowerShell windows (or tabs).

**Window A: Start Worker (Process Tasks)**

```powershell
cd ASR_server

# 1. Install uv package manager (if not installed)
pip install uv

# 2. Sync dependencies
uv sync

# 3. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 4. Start Worker
python src/worker/unified_worker.py --name worker-1 --stream asr_tasks --group asr_workers
```

**Window B: Start API Server (Receive Requests)**

```powershell
cd ASR_server

# 1. Activate virtual environment
.\.venv\Scripts\Activate.ps1

# 2. Start API
uvicorn src.api.main:app --host 0.0.0.0 --port 8000
```

### 3. Start Go Backend

Open a new PowerShell window.

```powershell
cd ASR_go_backend

# 1. Tidy dependencies
go mod tidy

# 2. Run service
go run cmd/server/main.go
```

### 4. Start Electron Client

Open a new PowerShell window.

```powershell
cd ASR_electron

# 1. Install dependencies
npm install

# 2. Start dev mode
npm run dev
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
