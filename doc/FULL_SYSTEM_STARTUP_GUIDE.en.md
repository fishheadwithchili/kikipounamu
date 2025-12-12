# ASR System Unified Deployment Guide

> **Language**: [English](FULL_SYSTEM_STARTUP_GUIDE.en.md) | [简体中文](FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md)

This guide provides instructions for deploying the full ASR system on a target machine (e.g., a main workstation with an RTX 5060).

---

## ⚡ Performance Configuration (GPU Acceleration)

Your workstation is equipped with an **RTX 5060**. It is highly recommended to enable GPU acceleration for optimal recognition speed.

### 1. Ensure CUDA-enabled PyTorch is Installed

Verify that the `ASR_server` environment has a GPU-enabled PyTorch installed:

```bash
# Check if GPU is available
python3 -c "import torch; print(torch.cuda.is_available())"
# Should output: True
```

### 2. Configure ASR_server to use GPU

Check the model loading section in the `ASR_server` source code (usually in `recognizer.py` or `funasr_server.py`).

**Recommended Modification**:
Find where `AutoModel(...)` is initialized and change `device="cpu"` to be dynamic:

```python
import os
import torch

# Smart device selection
device = "cuda" if torch.cuda.is_available() else "cpu"
# Or forced via env: device = os.getenv("ASR_DEVICE", "cuda")

print(f"🚀 ASR Running on: {device} (RTX 5060 Ready!)")

# Load Model
model = AutoModel(
    model="...",
    device=device,  # <--- Critical Change
    ...
)
```

---

## 📋 1. Basic Environment Preparation

Ensure the following software is installed before starting:

*   **Redis**: For the Python backend task queue.
*   **PostgreSQL**: For the Go backend history storage.
*   **Python 3.8+**: To run ASR_server.
*   **Go 1.21+**: To run ASR_go_backend.
*   **Node.js & pnpm**: To run the frontend.

### Start Infrastructure

```bash
# Start Redis
redis-server &

# Start PostgreSQL (Ensure service is running)
# Windows:
# net start postgresql-x64-14
# Linux:
sudo service postgresql start
```

### 1. Database Configuration
The project is configured to connect using the `postgres` user (password `123456`).
The backend will automatically create the `kikipounamu` database on startup; manual creation is not required.

Ensure the `postgres` user password is correct:
```bash
# Change postgres user password to 123456
echo "ALTER USER postgres WITH PASSWORD '123456';" | sudo -u postgres psql
```

---

## 🐍 2. Deploy ASR_server (Python)

1.  **Enter Directory**:
    ```bash
    cd /home/tiger/Projects/kikipounamu/ASR_server
    ```

2.  **Set GPU Environment Variable (Process-Dependent)**:
    ```bash
    export ASR_DEVICE=cuda
    ```

3.  **Start Worker**:
    ```bash
    ./scripts/start_unified_worker.sh
    # Avoid manual start if script is available
    ```

4.  **Start API Service**:
    ```bash
    ./scripts/start_api_server.sh
    # API Service will start at http://0.0.0.0:8000
    ```

---

## 🐹 3. Deploy ASR_go_backend (Go)

### 1. Start Service (Auto-Dependency, Compile & Run)

Run the start script directly. It will check dependencies, compile the code, and start the service:

```bash
cd /home/tiger/Projects/kikipounamu/ASR_go_backend
./scripts/start_backend.sh
```

## 🌐 Nginx Reverse Proxy (Optional)

If you need domain access, configure Nginx:

```nginx
server {
    listen 80;
    server_name asr.example.com;

    location / {
        proxy_pass http://localhost:5173; # Frontend
    }

    location /api/ {
        proxy_pass http://localhost:8080; # Backend API
    }

    location /ws/ {
        proxy_pass http://localhost:8080; # WebSocket
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## ⚛️ 4. Deploy ASR_electron (Electron/React)

### 1. Start Application (Auto-Dependency)

Run the start script directly. It will check and install system dependencies (may require sudo password):

```bash
cd /home/tiger/Projects/kikipounamu/ASR_electron
./scripts/start_electron.sh
```

---

## ✅ Verify GPU Acceleration

When you speak into the frontend and see results, observe the `ASR_server` console logs.
If you see something like `Processing on cuda:0` or increased GPU memory usage, **the RTX 5060 is working at full speed!**

Compared to CPU mode:
*   **CPU**: Latency ~200-500ms, long sentences may lag.
*   **RTX 5060**: Latency < 50ms, real-time response.
