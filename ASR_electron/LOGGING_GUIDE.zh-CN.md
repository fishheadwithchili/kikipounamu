# Electron 日志系统指南

> **语言**: [English](LOGGING_GUIDE.en.md) | [简体中文](LOGGING_GUIDE.zh-CN.md)

本文档介绍了 ASR Electron 应用程序中基于 `electron-log` 实现的日志系统。

## 概览

应用程序使用 **electron-log** v5 在主进程和渲染进程中进行统一日志记录。所有日志都会自动写入特定于平台的路径，并包含自动日志轮转功能。

## 日志文件位置

日志会根据您的操作系统自动保存到以下位置：

- **Linux**: `~/.config/asr-electron/logs/main.log`
- **macOS**: `~/Library/Logs/asr-electron/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\asr-electron\logs\main.log`

在开发模式下，日志也会写入 `<project-root>/logs/main.log` 以便快速访问。

## 日志轮转 (Log Rotation)

日志系统会自动管理磁盘空间：

- **文件大小限制**: 每个日志文件 5MB
- **保留策略**: 保留最近的 10 个日志文件
- **自动清理**: 较旧的日志文件将被自动删除
- **最大磁盘占用**: 约 50MB (5MB × 10 个文件)

当日志文件达到 5MB 时，它会被重命名为 `main.old.log`，并创建一个新的 `main.log`。

## 日志级别

系统支持以下日志级别（从高到低）：

| 级别 | 描述 | 示例 |
|---|---|---|
| `error` | 需要立即关注的关键错误 | WebSocket 连接失败, VAD 初始化错误 |
| `warn` | 需要调查的警告状况 | 无效状态, 使用了废弃 API |
| `info` | 关于正常运行的信息 | 录音开始/停止, 连接建立 |
| `verbose` | 详细的操作信息 | 内部状态变更 |
| `debug` | 调试信息 | 消息 Payload, 详细流程信息 |
| `silly` | 非常啰嗦的调试信息 | 极度详细的追踪信息 |

### 基于环境的级别

日志系统会根据环境自动调整详细程度：

- **开发环境** (`NODE_ENV=development` 或未打包):
  - 文件: `debug` 级别及以上
  - 控制台: `debug` 级别及以上

- **生产环境** (打包后):
  - 文件: `info` 级别及以上
  - 控制台: `warn` 级别及以上

## 使用方法

### 主进程 (Main Process)

```typescript
import { createLogger } from './logger';

const logger = createLogger('ComponentName');

// 日志示例
logger.info('User action completed', { userId: '123', action: 'save' });
logger.warn('Deprecated API used', { api: 'oldMethod' });
logger.error('Failed to connect', errorObject);
logger.debug('Processing chunk', { chunkIndex: 42, size: 1024 });
```

### 渲染进程 (Renderer Process)

```typescript
import { createLogger } from '../utils/loggerRenderer';

const logger = createLogger('ComponentName');

// API 与主进程相同
logger.info('Component mounted');
logger.error('Failed to render', error);
```

## 结构化日志

Logger 支持带有上下文对象的结构化日志：

```typescript
// 推荐: 结构化日志
logger.info('Recording started', {
  sessionId: '123-456',
  sampleRate: 16000,
  mode: 'unlimited'
});

// 避免: 字符串拼接
logger.info(`Recording started with session ${sessionId} and rate ${sampleRate}`);
```

结构化日志更易于解析、搜索和分析。

## 组件专属 Logger

每个组件应创建一个带有描述性名称的 logger 实例：

```typescript
// 主进程
const logger = createLogger('ASRClient');
const logger = createLogger('IPC');
const logger = createLogger('Main');

// 渲染进程
const logger = createLogger('VADRecording');
const logger = createLogger('Waveform');
const logger = createLogger('App');
```

这使得在故障排查时很容易按组件过滤日志。

## 安全与隐私

> [!WARNING]
> **切勿记录敏感信息**
>
> 请勿记录：
> - 密码或认证 Token
> - 个人身份信息 (PII)
> - 信用卡或支付信息
> - API 密钥或 Secrets
>
> 如果必须记录敏感数据（用于调试），请先进行脱敏或加密。
