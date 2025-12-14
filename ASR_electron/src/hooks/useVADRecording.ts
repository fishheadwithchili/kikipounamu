/// <reference types="vite/client" />

/**
 * VAD 录音 Hook - 使用 FunASR FSMN-VAD ONNX
 * 
 * 特点：
 * - 使用阿里达摩院 FunASR FSMN-VAD 模型
 * - 80维 Fbank 特征 + 5帧 LFR
 * - CMVN 归一化
 * - 实时语音活动检测
 */
import { useState, useRef, useCallback, useEffect } from 'react';
// import { FunASRVAD } from '../services/funasrVAD'; // Removed VAD
import { float32ToWav, float32ToBase64 } from '../utils/audioHelper';
import { createLogger } from '../utils/loggerRenderer';




// Define VAD Modes
export type VADMode = 'vad' | 'time_limit' | 'unlimited';

interface VADRecordingResult {
    isRecording: boolean;
    isVADReady: boolean;
    isSpeaking: boolean;
    chunkCount: number;
    duration: number;
    error: string | null;
    sessionId: string | null;
    startRecording: () => Promise<boolean>;
    stopRecording: () => void;
    onChunkReady: (callback: (chunkIndex: number, audioData: ArrayBuffer, rawPCM: Float32Array) => void) => void;
    stream: MediaStream | null; // Shared stream for Visualizer
}

// VAD 配置
// VAD Config removed
// const VAD_CONFIG = { ... }

// 音频配置
// 音频配置
const SAMPLE_RATE = 16000;
// ScriptProcessorNode bufferSize 必须是 2 的幂次方 (256, 512, 1024, 2048, 4096, 8192, 16384)
const BUFFER_SIZE = 2048; // ~128ms @ 16kHz
const BUFFER_SIZE_MS = Math.floor(BUFFER_SIZE * 1000 / SAMPLE_RATE); // 256ms

const logger = createLogger('VADRecording');

export function useVADRecording(
    initialMode: VADMode = 'unlimited',
    initialTimeLimitMs: number = 180000
): VADRecordingResult & { setVadMode: (mode: VADMode) => void, setTimeLimit: (ms: number) => void } {
    // Current Mode State
    const [, _setVadMode] = useState<VADMode>(initialMode);
    const vadModeRef = useRef<VADMode>(initialMode);
    const timeLimitRef = useRef<number>(initialTimeLimitMs);

    const setVadMode = useCallback((mode: VADMode) => {
        const oldMode = vadModeRef.current;
        console.log(`🔄 [VAD Mode Change] ${oldMode} → ${mode}`);
        _setVadMode(mode);
        vadModeRef.current = mode;
        console.log(`✅ [VAD Mode Updated] vadModeRef.current is now: ${vadModeRef.current}`);
    }, []);

    const setTimeLimit = useCallback((ms: number) => {
        console.log(`Updated Time Limit to: ${ms}ms`);
        timeLimitRef.current = ms;
    }, []);

    const [isRecording, setIsRecording] = useState(false);
    const [isVADReady, setIsVADReady] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const isSpeakingRef = useRef(false); // Ref to avoid closure trap in ScriptProcessor callback
    const [chunkCount, setChunkCount] = useState(0);
    const [duration, setDuration] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);

    // const vadRef = useRef<FunASRVAD | null>(null); // Removed
    const streamRef = useRef<MediaStream | null>(null);
    const [streamState, setStreamState] = useState<MediaStream | null>(null); // Reactive state for stream sharing
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);

    const chunkCallbackRef = useRef<((chunkIndex: number, audioData: ArrayBuffer, rawPCM: Float32Array) => void) | null>(null);
    const chunkIndexRef = useRef(0);
    const durationTimerRef = useRef<number | null>(null);

    // VAD 状态缓冲
    const speechBufferRef = useRef<Float32Array[]>([]);
    const silenceFramesRef = useRef(0);
    const speechFramesRef = useRef(0);

    // Debug Logging State
    const lastLogTimeRef = useRef<number>(0);

    const logDebug = useCallback((message: string) => {
        window.ipcRenderer.invoke('write-debug-log', message);
    }, []);

    // 注册回调
    const onChunkReady = useCallback((callback: (chunkIndex: number, audioData: ArrayBuffer, rawPCM: Float32Array) => void) => {
        chunkCallbackRef.current = callback;
    }, []);

    // 初始化 VAD
    // VAD Initialization Removed
    useEffect(() => {
        setIsVADReady(true); // Always ready as we don't need model
        return () => { };
    }, []);

    // 处理音频块
    const processAudioChunk = useCallback(async (inputBuffer: Float32Array) => {
        // if (!vadRef.current?.ready) return; // Removed check

        try {
            // Calculate Amplitude for frequent logging
            let maxAmp = 0;
            for (let i = 0; i < inputBuffer.length; i++) {
                const abs = Math.abs(inputBuffer[i]);
                if (abs > maxAmp) maxAmp = abs;
            }

            // 获取模式配置
            const vadMode = vadModeRef.current;
            const now = Date.now();

            // Log flow every 100ms
            if (now - lastLogTimeRef.current > 100) {
                logDebug(`[AudioFlow] Amp=${maxAmp.toFixed(4)} | Mode=${vadMode} | Buffer=${speechBufferRef.current.length} | isSpeaking=${isSpeakingRef.current}`);
                lastLogTimeRef.current = now;
            }

            // 1. Always append to Temp Recording
            if (sessionIdRef.current) {
                const base64Coords = float32ToBase64(inputBuffer);
                window.ipcRenderer.invoke('append-temp-recording', sessionIdRef.current, base64Coords)
                    .catch(e => console.error('Temp write failed:', e));
            }

            // --- CONTINUOUS MODES (Unlimited & Time Limit) ---
            // --- CONTINUOUS MODES (Unlimited & Time Limit) ---
            // Treated VAD mode as Unlimited for safety if somehow selected
            if (vadMode === 'unlimited' || vadMode === 'time_limit' || vadMode === 'vad') {
                speechBufferRef.current.push(inputBuffer.slice());

                // Always mark as speaking in continuous modes so UI shows activity
                if (!isSpeaking) {
                    setIsSpeaking(true);
                    isSpeakingRef.current = true;
                }

                // Check Time Limit
                if (vadMode === 'time_limit') {
                    const currentBufferDurationMs = speechBufferRef.current.length * BUFFER_SIZE_MS;
                    if (currentBufferDurationMs >= timeLimitRef.current) {
                        logDebug(`[TimeLimit] Limit met (${timeLimitRef.current}ms) -> CUTTING`);

                        // Perform Cut
                        const totalLength = speechBufferRef.current.reduce((sum, buf) => sum + buf.length, 0);
                        const mergedAudio = new Float32Array(totalLength);
                        let offset = 0;
                        for (const buf of speechBufferRef.current) {
                            mergedAudio.set(buf, offset);
                            offset += buf.length;
                        }

                        const wavBuffer = float32ToWav(mergedAudio, SAMPLE_RATE);
                        const currentIndex = chunkIndexRef.current;
                        chunkIndexRef.current++;
                        setChunkCount((prev: number) => prev + 1);

                        logDebug(`[TimeLimit] Flushed Chunk #${currentIndex} | Size=${wavBuffer.byteLength} | Dur=${(mergedAudio.length / SAMPLE_RATE).toFixed(2)}s`);

                        if (chunkCallbackRef.current) {
                            chunkCallbackRef.current(currentIndex, wavBuffer, mergedAudio);
                        }

                        speechBufferRef.current = [];
                    }
                }

                // Log less frequently
                if (now - lastLogTimeRef.current > 1000) {
                    logDebug(`[Continuous] Mode=${vadMode} | Buffering: ${speechBufferRef.current.length} chunks`);
                }
                return;
            }

            // --- VAD MODE REMOVED ---
            // If we reach here, it's an unknown mode, but we handled 'vad' above as fallback.
        } catch (err) {
            console.error('VAD 处理错误:', err);
            logDebug(`[Error] VAD Processing: ${err}`);
        }
    }, [isSpeaking, logDebug]);

    // 开始录音
    const startRecording = useCallback(async (): Promise<boolean> => {
        if (!isVADReady) {
            setError('VAD 模型尚未加载');
            return false;
        }

        try {
            setError(null);
            chunkIndexRef.current = 0;
            setChunkCount(0);
            setDuration(0);
            speechBufferRef.current = [];
            silenceFramesRef.current = 0;
            speechFramesRef.current = 0;

            // 获取麦克风
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: SAMPLE_RATE,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            streamRef.current = stream;
            setStreamState(stream); // Trigger re-render to share stream with Waveform

            // Start Temp Recording Session
            try {
                const sessionRes = await window.ipcRenderer.invoke('start-temp-recording');
                if (sessionRes.success && sessionRes.sessionId) {
                    sessionIdRef.current = sessionRes.sessionId;
                    setSessionId(sessionRes.sessionId);
                    logger.info('Temp recording session started', { sessionId: sessionRes.sessionId });
                } else {
                    console.error('Failed to start temp recording:', sessionRes.error);
                }
            } catch (e) {
                console.error('IPC error starting temp recording:', e);
            }

            // 创建 AudioContext
            const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);

            // 使用 ScriptProcessorNode 进行实时处理
            const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (event) => {
                const inputData = event.inputBuffer.getChannelData(0);
                processAudioChunk(new Float32Array(inputData));
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            setIsRecording(true);

            // 启动时长计时器
            const startTime = Date.now();
            durationTimerRef.current = window.setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            console.log('🎤 FunASR VAD 录音已启动');
            logger.info('Recording started', { mode: vadModeRef.current, sampleRate: SAMPLE_RATE });
            return true;

        } catch (err) {
            logger.error('Failed to start recording', err as Error);
            setError('麦克风访问失败: ' + (err as Error).message);
            return false;
        }
    }, [isVADReady, processAudioChunk]);

    // 停止录音
    const stopRecording = useCallback(() => {
        if (durationTimerRef.current) {
            clearInterval(durationTimerRef.current);
            durationTimerRef.current = null;
        }

        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
            setStreamState(null); // Clear shared stream state
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        // 处理剩余的语音缓冲
        if (speechBufferRef.current.length > 0) {
            const totalLength = speechBufferRef.current.reduce((sum, buf) => sum + buf.length, 0);
            const mergedAudio = new Float32Array(totalLength);
            let offset = 0;
            for (const buf of speechBufferRef.current) {
                mergedAudio.set(buf, offset);
                offset += buf.length;
            }

            // CHECK MODE: If unlimited or time_limit, do not slice. Send ONE BIG CHUNK.
            const currentMode = vadModeRef.current;

            if (currentMode === 'unlimited' || currentMode === 'time_limit') {
                // --- CONTINUOUS MODES: SINGLE CHUNK ---
                const wavBuffer = float32ToWav(mergedAudio, SAMPLE_RATE);
                const currentIndex = chunkIndexRef.current;
                chunkIndexRef.current++;
                setChunkCount((prev: number) => prev + 1);

                console.log(`🎵 [${currentMode}] 发送剩余录音, 大小: ${wavBuffer.byteLength} bytes, 时长: ${(mergedAudio.length / SAMPLE_RATE).toFixed(2)}s`);
                logger.info('Sending remaining recording', {
                    mode: currentMode,
                    size: wavBuffer.byteLength,
                    duration: (mergedAudio.length / SAMPLE_RATE).toFixed(2)
                });

                if (chunkCallbackRef.current) {
                    chunkCallbackRef.current(currentIndex, wavBuffer, mergedAudio);
                }

            } else {
                // --- VAD MODE: Keep safety slicing if very long (fallback) ---
                // VAD should have cut already. This is just cleanup for leftovers.

                // Slice into smaller chunks for transmission (e.g. 10s = 16000 * 10 = 160000 samples)
                const MAX_CHUNK_SAMPLES = 16000 * 10; // 10 seconds per chunk

                for (let i = 0; i < mergedAudio.length; i += MAX_CHUNK_SAMPLES) {
                    const end = Math.min(i + MAX_CHUNK_SAMPLES, mergedAudio.length);
                    const chunkPCM = mergedAudio.slice(i, end);
                    const wavBuffer = float32ToWav(chunkPCM, SAMPLE_RATE);

                    const currentIndex = chunkIndexRef.current;
                    chunkIndexRef.current++;
                    setChunkCount((prev: number) => prev + 1);

                    console.log(`🎵 [Cleanup] 发送剩余音频片段 #${currentIndex}, 大小: ${wavBuffer.byteLength} bytes`);

                    if (chunkCallbackRef.current) {
                        chunkCallbackRef.current(currentIndex, wavBuffer, chunkPCM);
                    }
                }
            }

            speechBufferRef.current = [];
        } else {
            console.warn('⚠️ 停止录音时缓冲区为空 (VAD 可能未检测到语音)');
        }
        // vadRef.current?.reset(); // Removed
        setIsRecording(false);
        setIsSpeaking(false);
        isSpeakingRef.current = false;

        logger.info('Recording stopped', { chunkCount: chunkIndexRef.current });
        console.log('🛑 录音已停止');

        sessionIdRef.current = null;
    }, []);

    // 清理
    useEffect(() => {
        return () => {
            if (durationTimerRef.current) {
                clearInterval(durationTimerRef.current);
            }
            streamRef.current?.getTracks().forEach(track => track.stop());
            audioContextRef.current?.close();
        };
    }, []);

    return {
        isRecording,
        isVADReady,
        isSpeaking,
        chunkCount,
        duration,
        error,
        startRecording,
        stopRecording,
        onChunkReady,
        setVadMode,
        setTimeLimit,
        sessionId,
        stream: streamState // Reactive state for Waveform visualization
    };
}
