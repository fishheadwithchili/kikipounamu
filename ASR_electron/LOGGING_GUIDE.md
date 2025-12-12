# Electron Logging System Guide

This document describes the logging system implemented for the ASR Electron application using `electron-log`.

## Overview

The application uses **electron-log** v5 for unified logging across both main and renderer processes. All logs are automatically written to platform-specific locations and include automatic log rotation.

## Log File Location

Logs are automatically saved to the following locations based on your operating system:

- **Linux**: `~/.config/asr-electron/logs/main.log`
- **macOS**: `~/Library/Logs/asr-electron/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\asr-electron\logs\main.log`

In development mode, logs are also written to `<project-root>/logs/main.log` for easier access.

## Log Rotation

The logging system automatically manages disk space:

- **File Size Limit**: 5MB per log file
- **Retention**: Keeps the 10 most recent log files
- **Auto-cleanup**: Older log files are automatically deleted
- **Maximum Disk Usage**: ~50MB (5MB × 10 files)

When a log file reaches 5MB, it's renamed to `main.old.log` and a new `main.log` is created.

## Log Levels

The system supports the following log levels (from most to least severe):

| Level | Description | Example |
|-------|-------------|---------|
| `error` | Critical errors that need immediate attention | WebSocket connection failures, VAD initialization errors |
| `warn` | Warning conditions that should be investigated | Invalid states, deprecated usage |
| `info` | Informational messages about normal operations | Recording started/stopped, connections established |
| `verbose` | Detailed operational information | Internal state changes |
| `debug` | Debugging information | Message payloads, detailed flow information |
| `silly` | Very verbose debugging | Extremely detailed trace information |

### Environment-Based Levels

The logging system automatically adjusts verbosity based on the environment:

- **Development** (`NODE_ENV=development` or not packaged):
  - File: `debug` level and above
  - Console: `debug` level and above
  
- **Production** (packaged app):
  - File: `info` level and above
  - Console: `warn` level and above

## Usage

### Main Process

```typescript
import { createLogger } from './logger';

const logger = createLogger('ComponentName');

// Logging examples
logger.info('User action completed', { userId: '123', action: 'save' });
logger.warn('Deprecated API used', { api: 'oldMethod' });
logger.error('Failed to connect', errorObject);
logger.debug('Processing chunk', { chunkIndex: 42, size: 1024 });
```

### Renderer Process

```typescript
import { createLogger } from '../utils/loggerRenderer';

const logger = createLogger('ComponentName');

// Same API as main process
logger.info('Component mounted');
logger.error('Failed to render', error);
```

## Structured Logging

The logger supports structured logging with context objects:

```typescript
// Good: Structured logging
logger.info('Recording started', {
  sessionId: '123-456',
  sampleRate: 16000,
  mode: 'unlimited'
});

// Avoid: String interpolation
logger.info(`Recording started with session ${sessionId} and rate ${sampleRate}`);
```

Structured logs are easier to parse, search, and analyze.

## Component-Specific Loggers

Each component should create its own logger instance with a descriptive name:

```typescript
// Main Process
const logger = createLogger('ASRClient');
const logger = createLogger('IPC');
const logger = createLogger('Main');

// Renderer Process
const logger = createLogger('VADRecording');
const logger = createLogger('Waveform');
const logger = createLogger('App');
```

This makes it easy to filter logs by component when troubleshooting.

## Error Logging Best Practices

When logging errors, pass the Error object directly:

```typescript
try {
  // ... some operation
} catch (err) {
  // Good: Pass Error object
  logger.error('Operation failed', err as Error);
  
  // Also acceptable: Provide context
  logger.error('Operation failed', {
    error: err.message,
    stack: err.stack,
    context: 'additional info'
  });
}
```

## Viewing Logs

### During Development

1. **Console**: Logs are displayed in the terminal where you ran `pnpm dev`
2. **DevTools**: Renderer process logs also appear in Electron's DevTools console
3. **Log File**: Check the `logs/main.log` file in your project directory

### In Production

1. Navigate to the log file location for your OS (see above)
2. Use any text editor to view the logs
3. Consider using log analysis tools like:
   - `tail -f` (Linux/macOS) to watch logs in real-time
   - Text editors with large file support
   - Log aggregation services for advanced analysis

## Performance Considerations

The logging system is designed to have minimal performance impact:

- **Asynchronous**: Logs are written asynchronously to avoid blocking
- **Efficient**: Uses optimized serialization for structured data
- **Conditional**: Debug logs are disabled in production to reduce overhead

## Troubleshooting

### Logs not appearing

1. Check that the logger is initialized: Look for "Logger initialized" message
2. Verify log level: Ensure you're using a level that's enabled for your environment
3. Check file permissions: Ensure the app can write to the log directory

### Log file too large

The log rotation should prevent this, but if needed:
1. Delete old log files manually
2. Reduce logging verbosity by increasing the minimum log level
3. Check for log spam (excessive logging in loops)

### Performance issues

If logging is impacting performance:
1. Reduce log level in production
2. Avoid logging in tight loops
3. Use `debug` level for verbose logs so they're filtered out in production

## Security and Privacy

> [!WARNING]
> **Never log sensitive information**
>
> Do not log:
> - Passwords or authentication tokens
> - Personal identifiable information (PII)
> - Credit card or payment information
> - API keys or secrets
>
> If sensitive data must be logged for debugging, redact or encrypt it first.

## Examples

### Recording Session

```typescript
// Start
logger.info('Recording started', {
  sessionId: session.id,
  mode: 'vad',
  sampleRate: 16000
});

// Progress
logger.debug('Audio chunk processed', {
  chunkIndex: 42,
  size: 2048,
  duration: 0.128
});

// End
logger.info('Recording stopped', {
  sessionId: session.id,
  totalChunks: 100,
  duration: 12.8
});
```

### Error Handling

```typescript
try {
  await asrClient.connect();
} catch (err) {
  logger.error('Failed to connect to ASR backend', err as Error);
  // Show user-friendly error
  showError('Unable to connect. Please check your network.');
}
```

### WebSocket Events

```typescript
ws.onopen = () => {
  logger.info('WebSocket connected', { url: ws.url });
};

ws.onclose = () => {
  logger.warn('WebSocket disconnected, will retry');
};

ws.onerror = (err) => {
  logger.error('WebSocket error', { error: err.message });
};
```

## Advanced Topics

### Custom Transports

electron-log supports custom transports for advanced use cases:

```typescript
import log from 'electron-log/main';

// Add custom transport
log.transports.myCustomTransport = (message) => {
  // Send to external service, database, etc.
};
```

### Log Filtering

Filter logs by level or component:

```bash
# Linux/macOS: Show only errors
grep '\[error\]' ~/.config/asr-electron/logs/main.log

# Show logs from specific component
grep '\[ASRClient\]' ~/.config/asr-electron/logs/main.log
```

### Integration with Error Tracking

Consider integrating with error tracking services like Sentry:

```typescript
import * as Sentry from '@sentry/electron';

logger.errorHandler.startCatching({
  onError: ({ error }) => {
    logger.error('Uncaught error', error);
    Sentry.captureException(error);
  }
});
```

## Summary

- ✅ Logs automatically go to standard OS locations
- ✅ Automatic rotation prevents disk space issues
- ✅ Works seamlessly across main and renderer processes
- ✅ Structured logging for better analysis
- ✅ Environment-aware log levels
- ✅ Minimal performance impact
- ✅ Easy to use and maintain

For more information, see the [electron-log documentation](https://github.com/megahertz/electron-log).
