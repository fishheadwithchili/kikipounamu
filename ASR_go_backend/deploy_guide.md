# ASR System Unified Deployment Guide

> **Languages**: [English](deploy_guide.md) | [简体中文](deploy_guide.zh-CN.md)

This guide is for fully deploying the ASR system on a target machine (e.g., a main machine equipped with RTX 5060).

---

## ⚡ Performance Configuration (GPU Acceleration)

Your machine has an **RTX 5060**, so it is strongly recommended to enable GPU acceleration for ultimate recognition speed.

### 1. Ensure PyTorch with CUDA Support is Installed

On the main machine, ensure the `ASR_server` environment has the GPU version of PyTorch installed:

```bash
# Check if GPU is available
python3 -c "import torch; print(torch.cuda.is_available())"
# Should output: True
```

### 2. Configure ASR_server to Use GPU

Check the model loading part in `ASR_server` source code (usually in `recognizer.py` or `funasr_server.py`).

**Modification Suggestion**:
Find where `AutoModel(...)` is initialized and change `device="cpu"` to dynamic acquisition:

```python
import os
import torch

# Smart device selection
device = "cuda" if torch.cuda.is_available() else "cpu"
# Or force specify: device = os.getenv("ASR_DEVICE", "cuda")

print(f"🚀 ASR running on: {device} (RTX 5060 ready for takeoff!)")

# Load model
model = AutoModel(
    model="...",
    device=device,  # <--- Critical change
    ...
)
```

---

## 📋 1. Basic Environment Preparation

Before starting, ensure the following software is installed:

*   **Redis**: Task queue for Python backend.
*   **PostgreSQL**: History storage for Go backend.
*   **Python 3.8+**: Run ASR_server.
*   **Go 1.21+**: Run ASR_go_backend.
*   **Node.js & pnpm**: Run frontend.

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
Since the project defaults to the `root` user, it is recommended to create the corresponding role:

```sql
CREATE USER root WITH PASSWORD '123456';
CREATE DATABASE root OWNER root;
GRANT ALL PRIVILEGES ON DATABASE root TO root;
```

---

## 🐍 2. Deploy ASR_server (Python)

1.  **Enter Directory**:
    ```bash
    cd path/to/ASR_server
    ```

2.  **Set GPU Env Var (If supported by code)**:
    ```bash
    export ASR_DEVICE=cuda
    ```

3.  **Start Worker**:
    ```bash
    rq worker -c src.config &
    ```

4.  **Start API Service**:
    ```bash
    uvicorn src.main:app --host 0.0.0.0 --port 8000
    ```

---

## 🐹 3. Deploy ASR_go_backend (Go)

### 1. Compile Go Service

```bash
cd ASR_go_backend
go mod tidy
go build -o asr-backend cmd/server/main.go
```

### 2. Configure Systemd Service

Create `/etc/systemd/system/asr-backend.service`:

```ini
[Unit]
Description=ASR Go Backend Service
After=network.target postgresql.service

[Service]
Type=simple
User=tiger
WorkingDirectory=/home/tiger/Projects/ASR_go_backend
ExecStart=/home/tiger/Projects/ASR_go_backend/asr-backend
Restart=always
Environment="PORT=8080"
Environment="DB_USER=root"
Environment="DB_PASSWORD=123456"
Environment="DB_NAME=root"
Environment="FUNASR_ADDR=localhost:8000"

[Install]
WantedBy=multi-user.target
```

### 3. Start

```bash
sudo systemctl daemon-reload
sudo systemctl enable asr-backend
sudo systemctl start asr-backend
```

## 🌐 Nginx Reverse Proxy (Optional)

If you need domain access, it is recommended to configure Nginx:

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

## ⚛️ 4. Deploy ASR_pc_front (React)

1.  **Enter Directory**:
    ```bash
    cd path/to/ASR_pc_front
    ```

2.  **Install Dependencies**:
    ```bash
    pnpm install
    ```

3.  **Start**:
    ```bash
    pnpm dev
    ```

---

## ✅ Verify GPU Acceleration

When you speak on the frontend and see the recognition results, observe the `ASR_server` console logs.
If you see something like `Processing on cuda:0` or increased video memory usage, it means **RTX 5060 is working at full speed!**

Compared to CPU mode:
*   **CPU**: Latency ~200-500ms, recognition of long sentences may stutter.
*   **RTX 5060**: Latency < 50ms, extremely real-time, basically display as you speak.
