# Windows 11 启动器部署指南 (Launcher Guide)

本指南介绍如何使用 **KikiPounamu Launcher (托盘启动器)** 来一键管理和运行 ASR 系统的所有组件。这是目前推荐的启动方式，替代了繁琐的手动 PowerShell 脚本。

> **语言切换**: [English](WIN11_LAUNCHER_GUIDE.en.md) | [简体中文](WIN11_LAUNCHER_GUIDE.zh-CN.md)

---

## 🚀 简介

**KikiPounamu Launcher** 是一个轻量级的 Windows 托盘程序，它能帮你：
1.  **一键启动/停止** 所有服务 (Python Worker, API, Go Backend, Electron)。
2.  **自动管理配置**：通过可视化的向导设置端口、GPU 模式等。
3.  **进程守护**：确保所有子进程在退出时被正确清理，不留残留。

---

## 🛠️ 前置准备 (Prerequisites)

虽然启动器能自动管理进程，但你需要确保基础环境已就绪：

1.  **基础软件**: 确保已安装 Python 3.10+, Go 1.24+, Node.js 24+。
2.  **FFmpeg**: 确保 `ffmpeg` 命令在终端中可用 (已添加到 PATH)。
3.  **数据库**:
    *   **Redis**: 确保 Redis 服务已安装并运行 (或 `redis-server` 可用)。
    *   **PostgreSQL**: 确保 PostgreSQL 服务已安装并运行。

---

## 📥 获取启动器

你可以通过以下两种方式获取启动器：

### 方法 A: 使用安装包 (推荐)
如果你有 `KikiPounamuSetup.exe` (或类似名称的安装包)，直接双击安装。安装完成后，桌面会出现快捷方式。

### 方法 B: 源码编译
如果你是开发者，可以从源码编译最新版：
1.  进入 `launcher` 目录。
2.  运行 `compile.bat`。
3.  生成的 `KikiPounamuLauncher.exe` 将位于当前目录下。

---

## 🎮 使用指南

### 1. 首次运行与配置

双击运行 `KikiPounamuLauncher.exe`。如果是第一次运行，它会自动弹出 **配置向导 (Configuration Wizard)**：

*   **ASR Worker Count**: 设置并行处理音频的 Worker 数量 (默认 1)。
*   **Device Mode**: 选择 `cpu` 或 `cuda` (如有 NVIDIA 显卡)。
*   **Ports**: 确认 API (8000) 和 Backend (8080) 端口不冲突。

点击 **"Save & Continue"** 保存配置。这些设置会自动写入各组件的 `.env` 文件。

### 2. 托盘控制

启动器运行后，会在屏幕右下角的系统托盘显示一个小图标 (通常是一个 K 字或默认图标)。

*   **右键点击图标** 打开菜单：
    *   **Start All Services**: 一键启动所有 4 个核心服务。
    *   **Stop All**: 停止所有服务。
    *   **Open Client**: 仅打开 Electron 客户端界面。
    *   **Settings...**: 重新打开配置向导修改设置。
    *   **Exit**: 停止服务并退出启动器。

### 3. 查看状态

启动服务后，你可以观察托盘图标的状态变化（如有），或者直接尝试访问客户端。
*   如果启动成功，Electron 窗口会自动弹出。

---

## ❓ 常见问题 (Troubleshooting)

### Q: 点击 "Start All" 后没有反应？
*   **检查端口**: 确保 8000, 8080 端口没有被其他程序占用。
*   **检查 Redis**: 确保 Redis 服务正在运行 (`redis-cli ping` 返回 PONG)。
*   **管理员权限**: 尝试以"管理员身份运行"启动器。

### Q: 怎么修改配置？
*   右键托盘图标 -> 选择 **Settings...**。修改后下次启动服务时生效。

### Q: 依然报错？
*   启动器会在同目录下生成日志文件 (如有)，或尝试在终端中通过命令行运行 exe 查看输出：
    ```powershell
    .\KikiPounamuLauncher.exe
    ```
