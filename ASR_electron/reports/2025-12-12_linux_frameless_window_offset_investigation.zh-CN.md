# Linux Electron 无边框窗口偏移问题调查报告

## 背景与需求
**目标:** 将 Electron 应用 UI 升级为专家级设计（Glassmorphism + 深色主题），启用无边框窗口 (`frame: false`)。
**环境:** Windows 11 WSL2 (Ubuntu 22.04.3 LTS)。
**问题:** UI 内容出现异常垂直偏移，红绿灯控件不可见或错位，渲染层级可能存在冲突。

## 根本原因分析 (Root Cause Analysis)

### 1. WSL2 的特殊性 - 核心因素
您的环境（WSL2）是导致此问题的关键：
- **无原生 GUI:** WSL2 本身不支持原生 GUI，必须通过 Windows 上的 X Server（如 VcXsrv）或 WSLg 来显示。
- **双层渲染瓶颈:** Electron → Linux GUI → X Server → Windows 显示。每一层都可能引入偏移。
- **虚拟机网络架构:** WSL2 运行在轻量级虚拟机中，`DISPLAY` 环境变量配置容易出错。

### 2. 已确认的 Electron + Linux 无边框窗口 Bug
调研发现这是 Electron 在 Linux 上的经典问题：
- **最大化偏移:** 无边框窗口在最大化或恢复时，尺寸和位置计算容易出错。
- **次显示器溢出:** 最大化时，未最大化的窗口残影可能会出现在副显示器上。
- **全屏行为异常:** 切换全屏时窗口大小操作行为不可预测。
- **Wayland 问题:** 失去焦点时动态调整大小、缩放错误以及鼠标点击错位。

### 3. WSL2 透明窗口的特殊 Bug
透明窗口 (`transparent: true`) 在 WSL2 中特别容易出问题，主要源于上游 NVIDIA 驱动在 Linux 下 alpha 通道的 Bug。
*临时方案:* 使用 `--enable-transparent-visuals --disable-gpu`（但移除透明属性是更稳妥的做法）。

## 建议解决方案

### 方案 A：WSL2 环境配置修复（优先尝试）
1.  **检查 X Server:** 确保 VcXsrv 或 WSLg 正在运行。
2.  **修复 DISPLAY 变量:**
    ```bash
    export DISPLAY=$(grep -m 1 nameserver /etc/resolv.conf | awk '{print $2}'):0
    ```
3.  **安装缺失依赖:**
    ```bash
    sudo apt install -y libgconf-2-4 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libgbm-dev libnss3-dev libxss-dev
    ```

### 方案 B：Electron 配置调整
1.  **禁用硬件加速:**
    在 `main.ts` 中添加: `app.disableHardwareAcceleration();`
2.  **延迟窗口显示:**
    等待 `ready-to-show` 事件，并使用 `setTimeout(..., 300)` 延迟显示窗口，让布局有时间稳定。
3.  **强制重绘:**
    在 `ready-to-show` 时调用 `win.setBounds(win.getBounds())` 强制刷新布局。

### 方案 C：替代方案
1.  **使用 `titleBarStyle: 'hidden'`:** 代替 `frame: false`，Linux 上行为不同但可能更稳定。
2.  **使用 Windows 版 Electron:** 在 WSL2 中安装并运行 Windows 版本的 Electron (`npm install --platform=win32 electron`)，绕过 Linux GUI 层。
