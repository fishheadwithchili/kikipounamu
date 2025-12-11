# ASR Electron Client

这是 ASR 项目的桌面客户端，基于 Electron + React + TypeScript + Vite 构建。

## 🚀 启动指南

在启动客户端之前，请确保 **ASR_server** (Python) 和 **ASR_go_backend** (Go) 都已经正常运行。

### 1. 安装依赖

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

## 🛠️ 常见问题

- **界面显示空白**？
  检查控制台是否有报错，通常是因为 React 开发服务器启动较慢，Electron 窗口加载时页面还没准备好。按 `Ctrl+R` (或 `Cmd+R`) 刷新窗口即可。

- **无法连接后端**？
  请检查 `ASR_go_backend` 是否运行在 `:8080` 端口。默认 WebSocket 地址为 `ws://localhost:8080/ws/asr`。
