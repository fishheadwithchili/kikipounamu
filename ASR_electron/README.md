# ASR Electron Client

This is the desktop client for the ASR project, built with Electron + React + TypeScript + Vite.

## 🚀 Startup Guide

Before starting the client, please ensure that **ASR_server** (Python) and **ASR_go_backend** (Go) are running normally.

### 1. Install Dependencies

```bash
npm install
# or
pnpm install
```

### 2. Start Development Mode

```bash
npm run dev
# or
pnpm dev
```

This will launch the Electron window and load the application.

### 3. Build Production Version

```bash
npm run build
```

Build artifacts will be located in the `dist-electron` and `dist` directories.

## 📝 Logging System

This project integrates `electron-log` v5, providing unified, automatically rotating logging functionality.

### Log Locations
- **Linux**: `~/.config/asr-electron/logs/main.log`
- **macOS**: `~/Library/Logs/asr-electron/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\asr-electron\logs\main.log`
- **Development Mode**: `<project-root>/logs/main.log`

### Key Features
- **Auto-rotation**: 5MB per file, keeping the recent 10 files.
- **Environment Isolation**: Logs `debug` level in development, `info` level in production.
- **Structured Logging**: Supports logging JSON objects for easy analysis.
- **Unified Entry**: Renderer process logs are automatically transmitted to the main process via IPC for unified recording.

### Running Tests
To verify if the logging system is working correctly:
```bash
npm test
# or
npx vitest run
```

For more details, please refer to [LOGGING_GUIDE.md](./LOGGING_GUIDE.md).

## 🛠️ FAQ

- **Interface is blank?**
  Check the console for errors. This is usually because the React dev server starts slowly, and the Electron window loads before the page is ready. Press `Ctrl+R` (or `Cmd+R`) to refresh the window.

- **Cannot connect to backend?**
  Please check if `ASR_go_backend` is running on port `:8080`. The default WebSocket address is `ws://localhost:8080/ws/asr`.
