/**
 * Renderer Process Logger
 * 
 * This module provides logging capabilities for the renderer process.
 * It uses electron-log/renderer to ensure logs are properly written
 * to the same log file as the main process.
 */

import log from 'electron-log/renderer';

// The renderer logger is automatically configured by the main process
// We just need to wrap it for convenient usage

/**
 * Create a logger instance for a specific component in the renderer process
 * 
 * @param componentName - Name of the component (e.g., 'VADRecording', 'Waveform')
 * @returns A logger instance with component context
 * 
 * @example
 * const logger = createLogger('VADRecording');
 * logger.info('Recording started', { duration: 1000 });
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

// Export default logger for general usage
export const logger = createLogger('Renderer');

export default log;
