# Linux Full "3+2" System Deployment Guide

This guide is designed for **Linux (Ubuntu/Debian)** users to help you deploy all components of the ASR system on a server or workstation.

> **Language**: [English](LINUX_DEPLOYMENT_GUIDE.en.md) | [简体中文](LINUX_DEPLOYMENT_GUIDE.zh-CN.md)

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

## 🛠️ Prerequisites

Before you begin, ensure your system (Ubuntu 22.04 LTS or higher recommended) has the following software installed:

### 1. Basic Tools & Language Environment

```bash
sudo apt update && sudo apt install -y git curl wget build-essential
```

**Python 3.10**:
Ubuntu 22.04+ typically includes Python 3.10 or higher by default.
```bash
python3 --version
# If a specific 3.10 version is required, use the deadsnakes PPA:
# sudo add-apt-repository ppa:deadsnakes/ppa
# sudo apt install python3.10 python3.10-venv python3.10-dev
```

**Go 1.24.5**:
```bash
wget https://go.dev/dl/go1.24.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.24.5.linux-amd64.tar.gz
# Add to PATH (recommended to add to ~/.bashrc or ~/.profile)
export PATH=$PATH:/usr/local/go/bin
```

**Node.js 24.11.1** (If running frontend):
```bash
# Install using NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**FFmpeg**:
```bash
sudo apt install -y ffmpeg
```

### 2. Database Dependencies

**Redis (5.0+)**:
```bash
sudo apt install -y redis-server
# Start and enable on boot
sudo systemctl enable --now redis-server
# Verify
redis-cli ping
# Should return PONG
```

**PostgreSQL (14+)**:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

**Configure Database User**:
```bash
# Change postgres user password to 123456 (Project default)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';"
```

---

## 🚀 Deployment Steps

### 1. Start Python Services (Worker & API)

We recommend using `screen`, `tmux`, or `nohup` to run services in the background.

**Terminal A: Start Worker (Task Processing)**
```bash
cd ASR_server
# The script will automatically create a virtual environment and install dependencies
chmod +x scripts/start_unified_worker.sh
./scripts/start_unified_worker.sh
```

**Terminal B: Start API Service**
```bash
cd ASR_server
chmod +x scripts/start_api_server.sh
./scripts/start_api_server.sh
```

### 2. Start Go Backend

**Terminal C:**
```bash
cd ASR_go_backend
chmod +x scripts/start_backend.sh
./scripts/start_backend.sh
```

### 3. Start Electron Client

> **Note**: The client usually runs on the user's local machine (Windows/Mac). If you are deploying the backend on a server, you do not need to perform this step. If deploying locally on a Linux desktop, proceed:

**Terminal D:**
```bash
cd ASR_electron
chmod +x scripts/start_electron.sh
./scripts/start_electron.sh
```

---

## ⚡ GPU Acceleration (NVIDIA)

If your Linux machine is equipped with an NVIDIA GPU (e.g., RTX 3090/4090/5060), ensure NVIDIA drivers and CUDA Toolkit are installed.

**Verify CUDA Availability**:
Observe the logs after starting the Worker. Or check manually:

```bash
cd ASR_server
source .venv/bin/activate
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

If `True`, the Worker will automatically prioritize the GPU.
You can force the device via environment variable:
```bash
export ASR_DEVICE=cuda
./scripts/start_unified_worker.sh
```

---

## ✅ Verification & Troubleshooting

1.  **API Docs**: Visit `http://localhost:8000/docs` (or `http://<ServerIP>:8000/docs` if on a server).
2.  **Go Health Check**: Visit `http://localhost:8080/health`.

**Common Issues**:
*   **Permission Error**: Ensure scripts have execution permissions (`chmod +x`).
*   **Redis Connection Failed**: Check `bind` configuration in `/etc/redis/redis.conf`. Default might only allow 127.0.0.1. If Worker and Redis are on the same machine, this is fine.
*   **PostgreSQL Auth Failed**: Ensure password is correctly set to `123456`, and `pg_hba.conf` allows password login (md5/scram-sha-256).
