/**
 * Unified Logging System for ASR Electron
 * 
 * This module provides a centralized logging configuration using electron-log.
 * It handles both main and renderer process logging with automatic rotation,
 * structured formatting, and environment-aware log levels.
 * 
 * Features:
 * - Automatic log rotation (5MB per file, keep 10 files)
 * - Cross-platform log file paths
 * - Structured logging with timestamps and context
 * - Environment-aware log levels (dev: debug, prod: info)
 * - Separate loggers for different components
 */

import log from 'electron-log/main';
import { app } from 'electron';
import path from 'node:path';

// Configure log file location
const isDev = !app.isPackaged;
const logPath = isDev
    ? path.join(process.cwd(), 'logs')
    : path.join(app.getPath('userData'), 'logs');

// Configure main logger
log.transports.file.resolvePathFn = () => path.join(logPath, 'main.log');
log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Set log level based on environment
log.transports.file.level = isDev ? 'debug' : 'info';
log.transports.console.level = isDev ? 'debug' : 'warn';

// Configure console output format
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';

// Enable catching errors
log.errorHandler.startCatching({
    showDialog: false,
    onError: ({ error }) => {
        log.error('Uncaught error:', error);
        log.error('Stack:', error.stack);
    }
});

/**
 * Create a logger instance for a specific component
 * 
 * @param componentName - Name of the component (e.g., 'IPC', 'ASRClient', 'Main')
 * @returns A logger instance with component context
 * 
 * @example
 * const logger = createLogger('ASRClient');
 * logger.info('Connection established', { sessionId: '123' });
 */
export function createLogger(componentName: string) {
    return {
        debug: (message: string, context?: Record<string, any>) => {
            log.debug(`[${componentName}] ${message}`, context || '');
        },
        info: (message: string, context?: Record<string, any>) => {
            log.info(`[${componentName}] ${message}`, context || '');
        },
        warn: (message: string, context?: Record<string, any>) => {
            log.warn(`[${componentName}] ${message}`, context || '');
        },
        error: (message: string, error?: Error | Record<string, any>) => {
            if (error instanceof Error) {
                log.error(`[${componentName}] ${message}`, {
                    error: error.message,
                    stack: error.stack
                });
            } else {
                log.error(`[${componentName}] ${message}`, error || '');
            }
        }
    };
}

// Export default logger instance
export const logger = createLogger('Main');

// Export the base log instance for advanced usage
export default log;

// Log startup information
logger.info('Logger initialized', {
    environment: isDev ? 'development' : 'production',
    logPath,
    logLevel: log.transports.file.level,
    version: app.getVersion()
});
