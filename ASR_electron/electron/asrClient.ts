import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import path from 'path';
import { createLogger } from './logger';

// Load .env from project root
dotenv.config({ path: path.join(process.cwd(), '.env') });

const USER_ID = process.env.VITE_USER_ID || 'anonymous';

const logger = createLogger('ASRClient');

export class ASRClient {
    private ws: WebSocket | null = null;
    private mainWindow: BrowserWindow;
    private url: string = 'ws://localhost:8080/ws/asr';
    private sessionId: string | null = null;
    private isRecording: boolean = false;
    private chunkIndex: number = 0;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        logger.debug('ASRClient instance created');
    }

    connect() {
        logger.info('Connecting to ASR backend', { url: this.url });
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            logger.info('WebSocket connected to ASR backend');
            this.mainWindow.webContents.send('asr-status', 'connected');
        };

        this.ws.onmessage = (event) => {
            if (this.mainWindow.isDestroyed()) return;
            try {
                const message = JSON.parse(event.data.toString());
                logger.debug('Received ASR message', { type: message.type });

                switch (message.type) {
                    case 'ack':
                        if (message.status === 'session_started') {
                            logger.info('ASR session started');
                            this.mainWindow.webContents.send('asr-status', 'ready');
                        } else if (message.status === 'received') {
                            // Chunk received, show processing indicator
                            this.mainWindow.webContents.send('asr-processing', {
                                chunkIndex: message.chunk_index,
                                status: 'processing'
                            });
                        }
                        break;
                    case 'chunk_result':
                        // Partial result
                        logger.debug('Received chunk result', { chunkIndex: message.chunk_index, textLength: message.text?.length });
                        this.mainWindow.webContents.send('asr-result', {
                            text: message.text,
                            is_final: false,
                            chunk_index: message.chunk_index
                        });
                        break;
                    case 'final_result':
                        // Final result
                        logger.info('Received final ASR result', {
                            duration: message.duration,
                            chunkCount: message.chunk_count,
                            textLength: message.text?.length
                        });
                        this.mainWindow.webContents.send('asr-result', {
                            text: message.text,
                            is_final: true,
                            duration: message.duration,
                            chunk_count: message.chunk_count
                        });
                        this.mainWindow.webContents.send('asr-processing', { status: 'done' });
                        break;
                    case 'error':
                        logger.error('ASR backend error', { message: message.message });
                        this.mainWindow.webContents.send('asr-error', message.message);
                        break;
                }
            } catch (e) {
                logger.error('Failed to parse ASR message', e as Error);
            }
        };

        this.ws.onclose = () => {
            logger.warn('WebSocket disconnected, retrying in 3s');
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('asr-status', 'disconnected');
            }
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (err) => {
            logger.error('WebSocket error', { error: err.message || String(err) });
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('asr-status', 'error');
            }
        };
    }

    startRecording() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('Cannot start recording: WebSocket not connected');
            return;
        }

        this.sessionId = uuidv4();
        this.chunkIndex = 0;
        this.isRecording = true;

        // Send start message
        this.ws.send(JSON.stringify({
            action: 'start',
            session_id: this.sessionId,
            user_id: USER_ID
        }));

        this.mainWindow.webContents.send('asr-processing', { status: 'recording' });
        logger.info('Recording started', { sessionId: this.sessionId, userId: USER_ID });
    }

    stopRecording() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionId) {
            logger.warn('Cannot stop recording: invalid state');
            return;
        }

        this.isRecording = false;

        // Send finish message
        this.ws.send(JSON.stringify({
            action: 'finish',
            session_id: this.sessionId
        }));

        this.mainWindow.webContents.send('asr-processing', { status: 'finalizing' });
        logger.info('Recording stopped, waiting for final result', { sessionId: this.sessionId, chunkCount: this.chunkIndex });
    }

    // Called from renderer process with audio data
    sendAudioChunk(audioData: string) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionId || !this.isRecording) {
            return;
        }

        this.ws.send(JSON.stringify({
            action: 'chunk',
            session_id: this.sessionId,
            chunk_index: this.chunkIndex,
            audio_data: audioData // Base64 encoded audio
        }));

        this.chunkIndex++;
    }

    getSessionId(): string | null {
        return this.sessionId;
    }

    getIsRecording(): boolean {
        return this.isRecording;
    }
}
