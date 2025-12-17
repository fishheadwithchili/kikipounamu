# Windows 11 全 "3+2" 系统部署指南

本指南专为 **Windows 11** 用户设计，旨在帮助你在本地完整部署 ASR 系统的所有组件。

> **语言切换**: [English](WIN11_DEPLOYMENT_GUIDE.en.md) | [简体中文](WIN11_DEPLOYMENT_GUIDE.zh-CN.md)

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

## � 目录 (Table of Contents)

*   [前置准备 (Prerequisites)](#-前置准备-prerequisites)
*   [**方案一：PowerShell 部署 (推荐)**](#-方案一-powershell-部署-推荐)
    *   [1. 启动基础依赖](#1-启动基础依赖-infrastructure)
    *   [2. 启动 Python 服务 (Worker & API)](#2-启动-python-服务-worker--api)
    *   [3. 启动 Go 后端](#3-启动-go-后端)
    *   [4. 启动 Electron 客户端](#4-启动-electron-客户端)
*   [**方案二：Git Bash 部署**](#-方案二-git-bash-部署)
    *   [跳转到 Git Bash 指南](#-方案二-git-bash-部署)
*   [验证与故障排除](#-验证与故障排除)

---

## 🛠️ 前置准备 (Prerequisites)

开始之前，请确保安装了以下软件：

1.  **Git**: [下载](https://git-scm.com/download/win)

2.  **Python 3.10.12**: [下载](https://www.python.org/ftp/python/3.10.12/python-3.10.12-amd64.exe) (安装时务必勾选 "Add Python to PATH")
3.  **Go 1.24.5**: [下载](https://go.dev/dl/go1.24.5.windows-amd64.msi)
4.  **Node.js 24.11.1**: [下载](https://nodejs.org/dist/v24.11.1/node-v24.11.1-x64.msi)
5.  **FFmpeg (最新版)**: 
    *   [下载 7z 压缩包](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-full.7z)
    *   解压到推荐位置：`C:\ffmpeg` (或任意你喜欢的目录)
    *   将 `bin` 目录的完整路径添加到系统环境变量 Path，例如：`C:\ffmpeg\bin`
    *   配置 PATH 方法：`Windows 设置` → `系统` → `高级系统设置` → `环境变量` → 在 `系统变量` 中找到 `Path` → `编辑` → `新建` → 粘贴 bin 路径 → `确定`
    *   验证安装：打开新的终端窗口，运行 `ffmpeg -version`
6.  **数据库**:
    *   **Redis 5.0.14.1**: [下载 MSI 安装包](https://github.com/tporadowski/redis/releases/download/v5.0.14.1/Redis-x64-5.0.14.1.msi) (Windows 原生版，支持 Streams)。
        *   **注意**: 安装时务必勾选 ✅ `Add the Redis installation folder to the PATH environment variable`。
        *   **补救措施**: 如果安装后发现 `redis-server` 或 `redis-cli` 无法运行，请手动将 `C:\Program Files\Redis` 添加到系统环境变量 **Path** 中，并**重启终端**。
    *   **PostgreSQL 14.20**: [下载安装包](https://get.enterprisedb.com/postgresql/postgresql-14.20-1-windows-x64.exe) (默认用户 `postgres`，密码设为 `123456`)。
        *   **注意**: 安装完成后会弹出 "Stack Builder" 提示，请直接点击 **Cancel** 取消，本项目不需要此步骤。

---

## 🟢 方案一：PowerShell 部署 (推荐)

如果你习惯使用 Windows 原生的 PowerShell，请按照以下步骤操作。

> **提示**: 如果遇到权限错误，请尝试以**管理员身份**运行 PowerShell。
> **重要**: 首次运行脚本前，必须允许 PowerShell 执行本地脚本。请运行：
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### 1. 启动基础依赖 (Infrastructure)

确保 Redis 和 PostgreSQL 正在运行。

```powershell
# 1. 检查 Redis 状态
# 推荐: 使用 Windows 服务运行(看不到黑窗口，更稳定)
# 检查是否已运行:
redis-cli ping
# 如果返回 "PONG"，说明服务正常，直接跳过。

# 如果连接失败，请以管理员身份运行以下命令启动服务(永久自启):
Start-Service Redis; Set-Service Redis -StartupType Automatic

# 注意: 不要直接运行 'redis-server'，那会占用当前窗口。
```

# 2. 检查 PostgreSQL 状態
# 通常 PostgreSQL 会自动运行。
# 检查命令：
Get-Service postgresql-x64-14

# 如果 Status 不是 "Running"，请以管理员身份运行：
Start-Service postgresql-x64-14; Set-Service postgresql-x64-14 -StartupType Automatic


### 2. 启动 Python 服务 (Worker & API)

我们需要两个独立的 PowerShell 窗口（或标签页）。

**窗口 A: 启动 Worker (处理任务)**

```powershell
cd ASR_server
# 首次运行需要允许脚本执行(只需运行一次)：
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

.\scripts\start_unified_worker.ps1
```

**窗口 B: 启动 API 服务 (接收请求)**

```powershell
cd ASR_server
.\scripts\start_api_server.ps1
```

### 3. 启动 Go 后端

打开一个新的 PowerShell 窗口。

```powershell
cd ASR_go_backend
.\scripts\start_backend.ps1
```

### 4. 启动 Electron 客户端

打开一个新的 PowerShell 窗口。

```powershell
cd ASR_electron
.\scripts\start_electron.ps1
```

---

## 🟠 方案二：Git Bash 部署

如果你更喜欢类 Unix 的命令行体验，可以使用 Git Bash。

### 1. 启动基础依赖

```bash
# 1. 检查 Redis 状态
redis-cli ping
# 如果返回 PONG，则跳过。

# 如果未运行，推荐使用 Windows 服务管理(见上方 PowerShell 方案)，
# 或者在 Git Bash 后台运行:
redis-server &
```

### 2. 启动 Python 服务

**窗口 A: Worker**

```bash
cd ASR_server

# 脚本会自动检查 uv 并激活环境
./scripts/start_unified_worker.sh
```

**窗口 B: API Server**

```bash
cd ASR_server
./scripts/start_api_server.sh
```

### 3. 启动 Go 后端

```bash
cd ASR_go_backend
go mod tidy
go run cmd/server/main.go
```

### 4. 启动 Electron 客户端

```bash
cd ASR_electron
npm install
npm run dev
```

---

## ✅ 验证与故障排除

### 验证步骤
1.  **API**: 访问 `http://localhost:8000/docs`，应看到 Swagger 文档。
2.  **Go Backend**: 访问 `http://localhost:8080/health` (假设端口为 8080)，应返回 OK。
3.  **Electron**: 客户端窗口应正常弹出。

### 常见问题 (Troubleshooting)

*   **PowerShell 禁止运行脚本**:
    *   错误: `无法加载文件...因为在此系统上禁止运行脚本`
    *   解决: 运行 `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`。
*   **找不到 FFmpeg**:
    *   确保已下载 FFmpeg 并将其 `bin` 目录添加到了 Windows 的系统环境变量 `Path` 中。重启终端生效。
*   **找不到 Redis 命令 (redis-server / redis-cli)**:
    *   错误: `The term 'redis-server' is not recognized...`
    *   原因: Redis 安装目录未添加到系统 Path 环境变量，但服务可能已在后台运行。
    *   解决: 将 `C:\Program Files\Redis` 添加到用户环境变量 Path 中。**修改后必须重启终端**才会生效。
