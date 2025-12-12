import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Mock Electron app
const mockGetPath = vi.fn();
const mockGetVersion = vi.fn();
const mockIsPackaged = { value: false };

vi.mock('electron', () => ({
    app: {
        getPath: mockGetPath,
        getVersion: mockGetVersion,
        get isPackaged() { return mockIsPackaged.value; },
    },
}));

describe('Logging System', () => {
    let tempDir: string;

    beforeEach(() => {
        vi.resetModules();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-electron-test-'));
        mockGetPath.mockReturnValue(tempDir);
        mockGetVersion.mockReturnValue('1.0.0');
        mockIsPackaged.value = false;
    });

    afterEach(() => {
        // Clean up temp dir
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            console.error('Failed to clean up temp dir', e);
        }
        vi.clearAllMocks();
    });

    it('should configure logger for development environment', async () => {
        mockIsPackaged.value = false;

        // Import logger after mocking
        const { logger, default: log } = await import('../electron/logger');

        expect(log.transports.file.level).toBe('debug');
        expect(log.transports.console.level).toBe('debug');

        // Verify log path (in dev it uses process.cwd()/logs)
        // Note: The actual code uses process.cwd(), so we might need to check relative path or mock process.cwd if strict
        // But let's check if it created the directory or set the path
        const expectedLogPath = path.join(process.cwd(), 'logs', 'main.log');
        expect(log.transports.file.resolvePathFn!()).toBe(expectedLogPath);
    });

    it('should configure logger for production environment', async () => {
        mockIsPackaged.value = true;

        // Re-import to trigger top-level logic again
        const { logger, default: log } = await import('../electron/logger');

        expect(log.transports.file.level).toBe('info');
        expect(log.transports.console.level).toBe('warn');

        // In prod it uses app.getPath('userData')/logs
        const expectedLogPath = path.join(tempDir, 'logs', 'main.log');
        expect(log.transports.file.resolvePathFn!()).toBe(expectedLogPath);
    });

    it('should write logs to file', async () => {
        mockIsPackaged.value = true; // Use prod mode to use tempDir for clean testing

        const { logger } = await import('../electron/logger');

        const testMessage = `Test log message ${Date.now()}`;
        logger.info(testMessage);

        // Wait a bit for async write
        await new Promise(resolve => setTimeout(resolve, 500));

        const logFile = path.join(tempDir, 'logs', 'main.log');
        expect(fs.existsSync(logFile)).toBe(true);

        const content = fs.readFileSync(logFile, 'utf-8');
        expect(content).toContain(testMessage);
        expect(content).toContain('[Main]'); // Verify component name
    });

    it('should format structured logs', async () => {
        mockIsPackaged.value = true;
        const { createLogger } = await import('../electron/logger');
        const logger = createLogger('TestComponent');

        const context = { userId: 123, action: 'test' };
        logger.info('Structured log', context);

        await new Promise(resolve => setTimeout(resolve, 500));

        const logFile = path.join(tempDir, 'logs', 'main.log');
        const content = fs.readFileSync(logFile, 'utf-8');

        // electron-log default stringifies objects
        expect(content).toContain('Structured log');
        expect(content).toContain('TestComponent');
        // The exact format of the object depends on electron-log implementation, 
        // but it usually includes the JSON representation
        // Let's just check for presence of keys
        expect(content).toContain('userId');
        expect(content).toContain('123');
    });
});
