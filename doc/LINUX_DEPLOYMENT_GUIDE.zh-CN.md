# Linux 全 "3+2" 系统部署指南

本指南专为 **Linux (Ubuntu/Debian)** 用户设计，旨在帮助你在服务器或工作站上完整部署 ASR 系统的所有组件。

> **语言切换**: [English](LINUX_DEPLOYMENT_GUIDE.en.md) | [简体中文](LINUX_DEPLOYMENT_GUIDE.zh-CN.md)

---

## 什么是 "3+2" 架构？

本系统由 **3 个核心服务** 和 **2 个基础依赖** 组成，统称为 "3+2" 架构。

### 3 大核心服务 (Core Services)
1.  **ASR Python Worker**: 系统的"大脑"。负责繁重的 AI 计算，从 Redis 队列中获取音频并进行转录。
2.  **ASR Python API**: 系统的"大门"。提供 HTTP 接口，接收前端请求并将任务发送到 Redis。
3.  **ASR Go Backend**: 系统的"管家"。管理业务逻辑、用户历史记录，并与 PostgreSQL 数据库交互。

### 2 大基础依赖 (Infrastructure)
1.  **Redis**: "传令兵"。作为消息队列，连接 API 和 Worker，确保任务高效分发。
2.  **PostgreSQL**: "仓库"。持久化存储所有用户数据和转录历史。

*(以及 1 个客户端: **ASR Electron App**，这是用户直接使用的界面)*

---

## 🛠️ 前置准备 (Prerequisites)

开始之前，请确保你的系统（推荐 Ubuntu 22.04 LTS 或更高）安装了以下软件：

### 1. 基础工具 & 语言环境

```bash
sudo apt update && sudo apt install -y git curl wget build-essential
```

**Python 3.10**:
Ubuntu 22.04+ 通常默认包含 Python 3.10 或更高。
```bash
python3 --version
# 如果版本需要特定 3.10，可使用 deadsnakes PPA:
# sudo add-apt-repository ppa:deadsnakes/ppa
# sudo apt install python3.10 python3.10-venv python3.10-dev
```

**Go 1.24.5**:
```bash
wget https://go.dev/dl/go1.24.5.linux-amd64.tar.gz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf go1.24.5.linux-amd64.tar.gz
# 添加到 PATH (建议添加到 ~/.bashrc 或 ~/.profile)
export PATH=$PATH:/usr/local/go/bin
```

**Node.js 24.11.1** (如果需要运行前端):
```bash
# 使用 NodeSource 安装
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**FFmpeg**:
```bash
sudo apt install -y ffmpeg
```

### 2. 数据库依赖

**Redis (5.0+)**:
```bash
sudo apt install -y redis-server
# 启动并设置为开机自启
sudo systemctl enable --now redis-server
# 验证
redis-cli ping
# 应返回 PONG
```

**PostgreSQL (14+)**:
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

**配置数据库用户**:
```bash
# 修改 postgres 用户密码为 123456 (项目默认配置)
sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD '123456';"
```

---

## 🚀 部署步骤

### 1. 启动 Python 服务 (Worker & API)

建议使用 `screen`, `tmux` 或 `nohup` 在后台运行服务。

**终端 A: 启动 Worker (处理任务)**
```bash
cd ASR_server
# 脚本会自动创建虚拟环境并安装依赖
chmod +x scripts/start_unified_worker.sh
./scripts/start_unified_worker.sh
```

**终端 B: 启动 API 服务**
```bash
cd ASR_server
chmod +x scripts/start_api_server.sh
./scripts/start_api_server.sh
```

### 2. 启动 Go 后端

**终端 C:**
```bash
cd ASR_go_backend
chmod +x scripts/start_backend.sh
./scripts/start_backend.sh
```

### 3. 启动 Electron 客户端

> **注意**: 客户端通常运行在用户的本地机器（Windows/Mac）上。如果你是在服务器上部署后端，则不需要执行此步骤。如果你是在 Linux 桌面使用的本机部署，则继续：

**终端 D:**
```bash
cd ASR_electron
chmod +x scripts/start_electron.sh
./scripts/start_electron.sh
```

---

## ⚡ GPU 加速配置 (NVIDIA)

如果你的 Linux 机器配备了 NVIDIA 显卡（如 RTX 3090/4090/5060 等），请确保安装了 NVIDIA 驱动和 CUDA Toolkit。

**验证 CUDA 可用性**:
Worker 启动后，观察日志。或者手动检查：

```bash
cd ASR_server
source .venv/bin/activate
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}')"
```

如果为 `True`，Worker 将自动优先使用 GPU。
可以通过环境变量强制指定设备：
```bash
export ASR_DEVICE=cuda
./scripts/start_unified_worker.sh
```

---

## 🎙️ 音频输入配置 (Audio Input)

**本系统对音频设备"零依赖"**：只要你的 Linux 系统能识别到的声音输入设备，ASR 客户端就能直接使用。

这意味着你**不需要**为了特定的麦克风安装除了系统驱动以外的任何额外软件。

支持的设备类型包括但不限于：
1.  **内置麦克风** (笔记本自带)
2.  **USB 麦克风** (即插即用，稳定性最好，推荐)
3.  **蓝牙耳机麦克风**
4.  **虚拟麦克风** (如通过 Android 手机映射的音频源)

**验证方法**:
在 Linux 设置 -> 声音 -> 输入设备 中，只要能看到并测试该设备有输入音量，ASR 客户端的下拉菜单中就会自动显示该设备。

---

## ✅ 验证与故障排除

1.  **API 文档**: 访问 `http://localhost:8000/docs` (如果是服务器，访问 `http://<服务器IP>:8000/docs`)。
2.  **Go 健康检查**: 访问 `http://localhost:8080/health`。

**常见问题**:
*   **权限错误**: 确保脚本有执行权限 (`chmod +x`)。
*   **Redis 连接失败**: 检查 `/etc/redis/redis.conf` 中的 `bind` 配置。默认可能只允许 127.0.0.1。如果 Worker 和 Redis 在同一台机器，这没问题。
*   **PostgreSQL 认证失败**: 确保密码已正确修改为 `123456`，且 `pg_hba.conf` 允许密码登录 (md5/scram-sha-256)。
