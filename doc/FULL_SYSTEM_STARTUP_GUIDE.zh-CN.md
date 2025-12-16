# ASR 系统统一部署指南

> **语言切换**: [English](FULL_SYSTEM_STARTUP_GUIDE.en.md) | [简体中文](FULL_SYSTEM_STARTUP_GUIDE.zh-CN.md)


本指南用于在目标机器（如配备 RTX 5060 的主力机）上完整部署 ASR 系统。

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
*   **Python 3.10.11**: 运行 ASR_server。
*   **Go 1.24.5**: 运行 ASR_go_backend。
*   **Node.js & pnpm**: 运行前端。

### 启动基础设施

```bash
# 启动 Redis
cd ASR_server
redis-server &

# 启动 PostgreSQL (确保服务已运行)
# Windows:
# net start postgresql-x64-14
# Linux:
sudo service postgresql start
```

### 1. 数据库配置
项目已配置为使用 `postgres` 用户（密码 `123456`）连接。
后端启动时会自动创建名为 `kikipounamu` 的数据库，无需手动创建。

确保 `postgres` 用户密码正确：
```bash
# 修改 postgres 用户密码为 123456
echo "ALTER USER postgres WITH PASSWORD '123456';" | sudo -u postgres psql
```

---

## 🐍 2. 部署 ASR_server (Python)

1.  **进入目录**:
    ```bash
    cd ASR_server
    ```

2.  **设置 GPU 环境变量 (如果代码支持)**:
    ```bash
    export ASR_DEVICE=cuda
    ```

3.  **启动 Worker**:
    ```bash
    cd ASR_server
    # Linux/Mac
    ./scripts/start_unified_worker.sh
    # Windows
    .\scripts\start_unified_worker.ps1
    ```

4.  **启动 API 服务**:
    ```bash
    # Linux/Mac
    ./scripts/start_api_server.sh
    # Windows
    .\scripts\start_api_server.ps1
    # API 服务将在 http://0.0.0.0:8000 启动
    ```

---

## 🐹 3. 部署 ASR_go_backend (Go)

### 1. 启动服务 (自动处理依赖、编译和运行)

直接运行启动脚本即可，它会自动检查依赖、编译代码并启动服务：

```bash
cd ASR_go_backend
# Linux/Mac
./scripts/start_backend.sh
# Windows
.\scripts\start_backend.ps1
```



---

## ⚛️ 4. 部署 ASR_electron (Electron/React)

### 1. 启动应用 (自动处理依赖)

直接运行启动脚本即可，它会自动检查并安装所需的系统依赖（可能需要输入 sudo 密码）：

直接运行启动脚本即可：

```bash
```bash
cd ASR_electron
# Linux/Mac
./scripts/start_electron.sh
# Windows
.\scripts\start_electron.ps1
```

---

## ✅ 验证 GPU 加速

当你在前端说话并看到识别结果时，观察 `ASR_server` 的控制台日志。
如果看到类似 `Processing on cuda:0` 或显存占用增加，说明 **RTX 5060 正在全速工作！**

相比 CPU 模式：
*   **CPU**: 延迟约 200-500ms，识别长句可能卡顿。
*   **RTX 5060**: 延迟 < 50ms，高性能体验。

## 🧪 系统验证 (System Verification)

要验证所有组件（Redis, ASR Server, WebSocket）是否协同工作正常，请运行系统测试：

```bash
python3 tests/system_test.py
```

