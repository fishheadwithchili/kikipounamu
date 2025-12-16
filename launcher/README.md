# KikiPounamu 安装器与启动器

这里包含了两部分内容，对应你的需求：

## 1. 托盘启动器 (Tray Launcher) - 升级版

这是一个轻量级的 Windows 原生应用（无依赖，C# 编写），用于一键管理所有后台服务。

*   **位置**: `.\KikiPounamuLauncher.exe` (需使用 `compile.bat` 编译)
*   **新功能**:
    *   **配置向导**: 首次运行会自动弹出配置向导，设置 GPU/CPU 模式、端口号等。
    *   **直接进程管理**: 不再依赖 PowerShell 脚本，直接启动 Python/Go 进程，更干净的进程树。
    *   **环境管理**: 自动读取和写入各组件的 `.env` 配置文件。
*   **功能**:
    *   启动所有服务 (Python Worker, Python API, Go Backend, Electron)
    *   系统托盘图标管理
    *   右键菜单：启动/停止/打开客户端/设置
*   **使用方法**:
    *   双击 `KikiPounamuLauncher.exe` 运行。
    *   首次运行请跟随向导完成配置。
    *   如需修改配置，右键托盘图标选择 "Settings..."。

## 2. 安装器脚本 (Installer Script) - 选项 B

这是 **Inno Setup** 的配置文件，用于打包整个应用为 `.exe` 安装包。

*   **文件**: `setup.iss`
*   **如何生成安装包**:
    1.  下载并安装 **Inno Setup** (Unicode 版): https://jrsoftware.org/isdl.php
    2.  双击打开 `setup.iss`。
    3.  点击 "Build" -> "Compile"。
    4.  生成的安装包将在 `launcher\Output` 目录中。

**注意**: 安装脚本已包含基本的依赖检测逻辑 (Redis/PostgreSQL)，如果检测不到会提示用户。
