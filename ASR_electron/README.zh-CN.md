# ASR Electron Client

这是 ASR 项目的桌面客户端，基于 Electron + React + TypeScript + Vite 构建。

## 🚀 启动指南

在启动客户端之前，请确保 **ASR_server** (Python) 和 **ASR_go_backend** (Go) 都已经正常运行。

### 1. 环境准备

*   **Node.js**: 24.11.1

### 2. 安装依赖

```bash
npm install
# 或者
pnpm install
```

### 2. 启动开发模式

```bash
npm run dev
# 或者
pnpm dev
```

这将启动 Electron 窗口并加载应用。

### 3. 构建生产版本

```bash
npm run build
```

构建产物将位于 `dist-electron` 和 `dist` 文档中。

## 📝 日志系统

本项目集成了 `electron-log` v5，提供统一的、自动轮转的日志记录功能。

### 日志位置
- **Linux**: `~/.config/asr-electron/logs/main.log`
- **macOS**: `~/Library/Logs/asr-electron/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\asr-electron\logs\main.log`
- **开发模式**: `<项目根目录>/logs/main.log`

### 主要特性
- **自动轮转**: 单个文件 5MB，保留最近 10 个文件。
- **环境隔离**: 开发环境记录 `debug` 级别，生产环境记录 `info` 级别。
- **结构化日志**: 支持记录 JSON 对象，便于分析。
- **统一入口**: 渲染进程日志自动通过 IPC 传输到主进程统一记录。

### 运行测试
验证日志系统是否正常工作：
```bash
npm test
# 或者
npx vitest run
```

更多详细信息请参阅 [LOGGING_GUIDE.md](./LOGGING_GUIDE.md)。

## 🛠️ 常见问题

- **界面显示空白**？
  检查控制台是否有报错，通常是因为 React 开发服务器启动较慢，Electron 窗口加载时页面还没准备好。按 `Ctrl+R` (或 `Cmd+R`) 刷新窗口即可。

- **无法连接后端**？
  请检查 `ASR_go_backend` 是否运行在 `:8080` 端口。默认 WebSocket 地址为 `ws://localhost:8080/ws/asr`。
