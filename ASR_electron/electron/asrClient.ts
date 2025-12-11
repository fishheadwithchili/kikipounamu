import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';

export class ASRClient {
    private ws: WebSocket | null = null;
    private mainWindow: BrowserWindow;
    private url: string = 'ws://localhost:8080/ws/asr';
    private sessionId: string | null = null;
    private isRecording: boolean = false;
    private chunkIndex: number = 0;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('Connected to ASR backend');
            this.mainWindow.webContents.send('asr-status', 'connected');
        };

        this.ws.onmessage = (event) => {
            if (this.mainWindow.isDestroyed()) return;
            try {
                const message = JSON.parse(event.data.toString());
                console.log('ASR message:', message);

                switch (message.type) {
                    case 'ack':
                        if (message.status === 'session_started') {
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
                        this.mainWindow.webContents.send('asr-result', {
                            text: message.text,
                            is_final: false,
                            chunk_index: message.chunk_index
                        });
                        break;
                    case 'final_result':
                        // Final result
                        this.mainWindow.webContents.send('asr-result', {
                            text: message.text,
                            is_final: true,
                            duration: message.duration,
                            chunk_count: message.chunk_count
                        });
                        this.mainWindow.webContents.send('asr-processing', { status: 'done' });
                        break;
                    case 'error':
                        console.error('ASR error:', message.message);
                        this.mainWindow.webContents.send('asr-error', message.message);
                        break;
                }
            } catch (e) {
                console.error('Failed to parse ASR message', e);
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from ASR backend, retrying in 3s...');
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('asr-status', 'disconnected');
            }
            setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (err) => {
            console.error('ASR WebSocket error:', err);
            if (!this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('asr-status', 'error');
            }
        };
    }

    startRecording() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected');
            return;
        }

        this.sessionId = uuidv4();
        this.chunkIndex = 0;
        this.isRecording = true;

        // Send start message
        this.ws.send(JSON.stringify({
            action: 'start',
            session_id: this.sessionId
        }));

        this.mainWindow.webContents.send('asr-processing', { status: 'recording' });
        console.log('Recording started, session:', this.sessionId);
    }

    stopRecording() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.sessionId) {
            return;
        }

        this.isRecording = false;

        // Send finish message
        this.ws.send(JSON.stringify({
            action: 'finish',
            session_id: this.sessionId
        }));

        this.mainWindow.webContents.send('asr-processing', { status: 'finalizing' });
        console.log('Recording stopped, waiting for final result');
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
