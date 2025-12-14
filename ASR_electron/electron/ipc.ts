import { ipcMain, app, shell } from 'electron';
import { insertTextAtCursor } from './textInserter';
import { ASRClient } from './asrClient';
import Store from 'electron-store';
import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from './logger';
import { specialLogger } from './specialLogger';

const store = new Store();
const logger = createLogger('IPC');

const DEBUG_LOG_PATH = path.join(process.cwd(), 'debug_flow.log');

export function setupIpc(asrClient: ASRClient) {
    logger.info('Setting up IPC handlers');
    // Clear log on startup
    try {
        fs.writeFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] === NEW SESSION ===\n`);
    } catch (e) {
        console.error('Failed to init debug log:', e);
    }

    ipcMain.handle('write-debug-log', (_event, message: string) => {
        try {
            const timestamp = new Date().toISOString();
            const logLine = `[${timestamp}] ${message}\n`;
            fs.appendFileSync(DEBUG_LOG_PATH, logLine);
            return true;
        } catch (e) {
            console.error('Failed to write debug log:', e);
            return false;
        }
    });

    // --- Special VAD Logger ---
    ipcMain.handle('init-special-log', (_event, logId: string) => {
        return specialLogger.initLog(logId);
    });

    ipcMain.handle('write-vad-special-log', (_event, logId: string, message: string) => {
        specialLogger.appendLog(logId, message);
        return true;
    });

    ipcMain.on('renderer-ready', (_event) => {
        logger.info('Renderer process ready');
    });

    // --- Persistence Store ---
    ipcMain.handle('store-get', (_event, key: string) => {
        return store.get(key);
    });

    ipcMain.handle('store-set', (_event, key: string, value: any) => {
        store.set(key, value);
        return true;
    });

    ipcMain.handle('store-delete', (_event, key: string) => {
        store.delete(key as any);
        return true;
    });

    // Logging helper
    ipcMain.handle('log-message', (_event, level: string, message: string) => {
        logger.debug(`[Renderer ${level.toUpperCase()}] ${message}`);
        return null;
    });

    ipcMain.handle('insert-text', async (_event, text: string) => {
        try {
            logger.debug('Inserting text at cursor', { textLength: text.length });
            await insertTextAtCursor(text);
            return { success: true };
        } catch (error) {
            logger.error('Failed to insert text', error as Error);
            return { success: false, error: String(error) };
        }
    });

    // Forwarding ASR commands from UI
    ipcMain.handle('start-recording', async (_event, logId?: string) => {
        logger.info(`IPC: Start recording requested. LogID: ${logId}`);
        asrClient.startRecording(logId);
        return { success: true };
    });

    ipcMain.handle('stop-recording', async () => {
        logger.info('IPC: Stop recording requested');
        asrClient.stopRecording();
        return { success: true };
    });

    // Handle audio chunks from renderer
    ipcMain.handle('send-audio-chunk', async (_event, audioData: string) => {
        asrClient.sendAudioChunk(audioData);
        return { success: true };
    });

    // --- Audio File Persistence ---
    ipcMain.handle('save-audio-file', async (_event, base64Audio: string, directory: string | null) => {
        try {
            const buffer = Buffer.from(base64Audio, 'base64');
            // If no directory provided, use Documents/ASR_Recordings
            const targetDir = directory || path.join(app.getPath('documents'), 'ASR_Recordings');

            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `recording-${timestamp}.wav`;
            const fullPath = path.join(targetDir, filename);

            fs.writeFileSync(fullPath, buffer);
            logger.info('Saved audio file', { path: fullPath, size: buffer.length });
            return { success: true, filePath: fullPath };
        } catch (error) {
            logger.error('Failed to save audio file', error as Error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle('read-audio-file', async (_event, filePath: string) => {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, error: 'File not found' };
            }
            const buffer = fs.readFileSync(filePath);
            const base64 = buffer.toString('base64');
            return { success: true, base64 };
        } catch (error) {
            console.error('Failed to read audio file:', error);
            return { success: false, error: String(error) };
        }
    });

    ipcMain.handle('open-external', async (_event, url: string) => {
        logger.info(`[IPC] Opening external URL: ${url}`);

        let openSuccess = false;
        let methodUsed = '';
        let errorDetails = '';

        // 1. Detect WSL2 environment
        const isWSL2 = process.platform === 'linux' && fs.existsSync('/proc/version') &&
            fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');

        if (isWSL2) {
            logger.info('[IPC] WSL2 detected, attempting to open URL in Windows host');

            // 2. Try wslview (wslu)
            try {
                const { execSync } = await import('child_process');
                execSync('which wslview', { stdio: 'ignore' }); // Check existence

                const { spawn } = await import('child_process');
                const child = spawn('wslview', [url], { detached: true, stdio: 'ignore' });
                child.unref();
                openSuccess = true;
                methodUsed = 'wsl2-wslview';
            } catch (wslviewErr) {
                // 3. Try explorer.exe fallback
                try {
                    const { spawn } = await import('child_process');
                    const child = spawn('/mnt/c/Windows/explorer.exe', [url], { detached: true, stdio: 'ignore' });
                    child.unref();
                    openSuccess = true;
                    methodUsed = 'wsl2-explorer';
                } catch (explorerErr) {
                    errorDetails += `WSL2 methods failed: wslview(${wslviewErr}), explorer(${explorerErr}). `;
                }
            }
        }

        // 4. Standard shell.openExternal
        if (!openSuccess && !isWSL2) {
            try {
                await shell.openExternal(url);
                openSuccess = true;
                methodUsed = 'shell.openExternal';
            } catch (err) {
                errorDetails += `shell.openExternal failed: ${err}. `;

                // 5. Linux xdg-open fallback
                if (process.platform === 'linux') {
                    try {
                        const { spawn } = await import('child_process');
                        const child = spawn('/usr/bin/xdg-open', [url], { detached: true, stdio: 'ignore' });
                        child.unref();
                        openSuccess = true;
                        methodUsed = 'xdg-open-fallback';
                    } catch (fallbackErr) {
                        errorDetails += `xdg-open failed: ${fallbackErr}. `;
                    }
                }
            }
        }

        if (openSuccess) {
            logger.info(`[IPC] URL opened successfully via ${methodUsed}`);
            return { success: true, method: methodUsed };
        }

        // 6. FINAL FALLBACK: Clipboard
        try {
            const { clipboard } = await import('electron');
            clipboard.writeText(url);
            logger.info('[IPC] All open methods failed. URL copied to clipboard.');
            return {
                success: false,
                copiedToClipboard: true,
                error: errorDetails || 'Unknown error'
            };
        } catch (clipErr) {
            logger.error('[IPC] Clipboard fallback failed', clipErr as Error);
            return { success: false, error: errorDetails + `Clipboard failed: ${clipErr}` };
        }
    });

    ipcMain.handle('get-default-save-path', () => {
        return path.join(app.getPath('documents'), 'ASR_Recordings');
    });

    // --- Crash Protection / Temp Recording ---
    const TEMP_DIR = path.join(app.getPath('userData'), 'temp_recordings');
    if (!fs.existsSync(TEMP_DIR)) {
        fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Map to hold active write streams: sessionId -> fs.WriteStream
    const activeStreams = new Map<string, fs.WriteStream>();

    ipcMain.handle('start-temp-recording', async (_event) => {
        const sessionId = Date.now().toString();
        const fileName = `temp_recording_${sessionId}.raw`; // Raw PCM float32
        const filePath = path.join(TEMP_DIR, fileName);

        logger.debug('Starting temp recording', { sessionId, filePath });

        const stream = fs.createWriteStream(filePath, { flags: 'a' });
        activeStreams.set(sessionId, stream);

        return { success: true, sessionId, filePath };
    });

    ipcMain.handle('append-temp-recording', async (_event, sessionId: string, audioDataBase64: string) => {
        const stream = activeStreams.get(sessionId);
        if (!stream) {
            // If stream is missing (e.g. after main process restart but renderer kept going?), try to re-open? 
            // For now, error out. The renderer should handle this by starting a new one.
            return { success: false, error: 'Session not found or closed' };
        }

        const buffer = Buffer.from(audioDataBase64, 'base64');
        const success = stream.write(buffer);
        return { success };
    });

    ipcMain.handle('finalize-temp-recording', async (_event, sessionId: string, saveDirectory: string | null) => {
        console.log(`[CrashProtect] Finalizing session: ${sessionId}`);
        const stream = activeStreams.get(sessionId);

        // 1. Ensure stream is finished writing
        if (stream) {
            // Remove from active map immediately to prevent new writes
            activeStreams.delete(sessionId);

            // Wrap end() in promise to ensure flush completion
            await new Promise<void>((resolve) => {
                stream.end(() => {
                    resolve();
                });
            });
        }

        const tempFileName = `temp_recording_${sessionId}.raw`;
        const tempFilePath = path.join(TEMP_DIR, tempFileName);

        if (!fs.existsSync(tempFilePath)) {
            return { success: false, error: 'Temp file not found' };
        }

        try {
            const targetDir = saveDirectory || path.join(app.getPath('documents'), 'ASR_Recordings');
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `recording-${timestamp}.wav`;
            const finalPath = path.join(targetDir, filename);

            // 2. Use Async file operations to avoid blocking Main Thread
            const rawBuffer = await fs.promises.readFile(tempFilePath);

            // Add WAV header
            const wavHeader = createWavHeader(rawBuffer.length, 16000);
            const finalBuffer = Buffer.concat([wavHeader, rawBuffer]);

            await fs.promises.writeFile(finalPath, finalBuffer);
            logger.info('Finalized temp recording', { sessionId, path: finalPath, size: finalBuffer.length });

            // Delete temp
            await fs.promises.unlink(tempFilePath);

            return { success: true, filePath: finalPath };
        } catch (err: any) {
            logger.error('Finalize temp recording failed', { sessionId, error: err.message });
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('discard-temp-recording', async (_event, sessionId: string) => {
        const stream = activeStreams.get(sessionId);
        if (stream) {
            stream.end();
            activeStreams.delete(sessionId);
        }

        const tempFileName = `temp_recording_${sessionId}.raw`;
        const tempFilePath = path.join(TEMP_DIR, tempFileName);

        if (fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
            } catch (e) { console.error('Failed to delete temp file', e); }
        }
        return { success: true };
    });

    ipcMain.handle('get-crash-files', async () => {
        try {
            if (!fs.existsSync(TEMP_DIR)) return { success: true, files: [] };

            const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith('temp_recording_') && f.endsWith('.raw'));
            const result = files.map(f => {
                const stat = fs.statSync(path.join(TEMP_DIR, f));
                return {
                    name: f,
                    path: path.join(TEMP_DIR, f),
                    time: stat.mtime,
                    size: stat.size,
                    sessionId: f.replace('temp_recording_', '').replace('.raw', '')
                };
            });
            // Filter out files that are currently being written to? 
            // Simple check: if sessionId is in activeStreams, ignore it.
            const crashedFiles = result.filter(f => !activeStreams.has(f.sessionId));

            return { success: true, files: crashedFiles };
        } catch (e: any) {
            return { success: false, error: e.message };
        }
    });
}

function createWavHeader(dataLength: number, sampleRate: number) {
    const numChannels = 1;
    const bitsPerSample = 32; // Float32
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const buffer = Buffer.alloc(44);

    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(3, 20);  // AudioFormat (3 for IEEE Float)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);

    return buffer;
}



