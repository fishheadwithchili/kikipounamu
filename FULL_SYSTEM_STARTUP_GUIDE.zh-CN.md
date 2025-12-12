# ASR 系统统一部署指南

> **语言切换**: [English](FULL_SYSTEM_STARTUP_GUIDE.md) | [简体中文](FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md)


本指南用于在目标机器（如配备 RTX 5060 的主力机）上完整部署 ASR 系统。

---

## ⚡ 性能配置 (GPU 加速)

你的主力机拥有 **RTX 5060**，强烈建议启用 GPU 加速以获得极致的识别速度。

### 1. 确保已安装 CUDA 支持的 PyTorch

在主力机上，确保 ASR_server 的环境安装了 GPU 版 PyTorch：

```bash
# 检查 GPU 是否可用
python3 -c "import torch; print(torch.cuda.is_available())"
# 应输出: True
```

### 2. 配置 ASR_server 使用 GPU

请检查 `ASR_server` 源代码中加载模型的部分（通常在 `recognizer.py` 或 `funasr_server.py`）。

**修改建议**：
找到 `AutoModel(...)` 初始化的地方，将 `device="cpu"` 改为动态获取：

```python
import os
import torch

# 智能选择设备
device = "cuda" if torch.cuda.is_available() else "cpu"
# 或者强制指定：device = os.getenv("ASR_DEVICE", "cuda")

print(f"🚀 ASR 运行在: {device} (RTX 5060 准备起飞!)")

# 加载模型
model = AutoModel(
    model="...",
    device=device,  # <--- 关键修改
    ...
)
```

---

## 📋 1. 基础环境准备

在开始之前，请确保已安装以下软件：

*   **Redis**: 用于 Python 后端的任务队列。
*   **PostgreSQL**: 用于 Go 后端的历史记录存储。
*   **Python 3.8+**: 运行 ASR_server。
*   **Go 1.21+**: 运行 ASR_go_backend。
*   **Node.js & pnpm**: 运行前端。

### 启动基础设施

```bash
# 启动 Redis
redis-server &

# 启动 PostgreSQL (确保服务已运行)
# Windows:
# net start postgresql-x64-14
# Linux:
sudo service postgresql start
```

### 1. 数据库配置
由于项目默认使用 `root` 用户，建议创建对应角色:

```sql
CREATE USER root WITH PASSWORD '123456';
CREATE DATABASE root OWNER root;
GRANT ALL PRIVILEGES ON DATABASE root TO root;
```

---

## 🐍 2. 部署 ASR_server (Python)

1.  **进入目录**:
    ```bash
    cd /home/tiger/Projects/ASR_server
    ```

2.  **设置 GPU 环境变量 (如果代码支持)**:
    ```bash
    export ASR_DEVICE=cuda
    ```

3.  **启动 Worker**:
    ```bash
    ```bash
    ./scripts/start_unified_worker.sh
    # 不建议手动启动统一 Worker
    ```
    ```

4.  **启动 API 服务**:
    ```bash
    uvicorn src.api.main:app --host 0.0.0.0 --port 8000
    ```

---

## 🐹 3. 部署 ASR_go_backend (Go)

### 1. 编译 Go 服务

```bash
cd /home/tiger/Projects/ASR_go_backend
go mod tidy
go build -o asr-backend cmd/server/main.go
```

### 2. 配置 Systemd 服务 (可选)

创建 `/etc/systemd/system/asr-backend.service`:

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

### 3. 启动

```bash
# 直接启动
./asr-backend

# 或者作为服务启动
sudo systemctl start asr-backend
```

## 🌐 Nginx 反向代理 (可选)

如果你需要通过域名访问，建议配置 Nginx:

```nginx
server {
    listen 80;
    server_name asr.example.com;

    location / {
        proxy_pass http://localhost:5173; # 前端
    }

    location /api/ {
        proxy_pass http://localhost:8080; # 后端 API
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

## ⚛️ 4. 部署 ASR_electron (Electron/React)

1.  **进入目录**:
    ```bash
    cd /home/tiger/Projects/ASR_electron
    ```

2.  **安装依赖**:
    ```bash
    pnpm install
    ```

3.  **启动**:
    ```bash
    pnpm dev
    ```

---

## ✅ 验证 GPU 加速

当你在前端说话并看到识别结果时，观察 `ASR_server` 的控制台日志。
如果看到类似 `Processing on cuda:0` 或显存占用增加，说明 **RTX 5060 正在全速工作！**

相比 CPU 模式：
*   **CPU**: 延迟约 200-500ms，识别长句可能卡顿。
*   **RTX 5060**: 延迟 < 50ms，实时性极强，基本是说话即上屏。
