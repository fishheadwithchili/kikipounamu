import React, { useRef, useEffect } from 'react';
import { createLogger } from '../utils/loggerRenderer';

const logger = createLogger('Waveform');

interface WaveformProps {
    isRecording: boolean;
    stream: MediaStream | null;
}

export const Waveform: React.FC<WaveformProps> = ({ isRecording, stream }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);

    useEffect(() => {
        if (isRecording && stream) {
            startVisualization(stream);
        } else {
            stopVisualization();
        }

        return () => {
            stopVisualization();
        };
    }, [isRecording, stream]);

    const startVisualization = async (audioStream: MediaStream) => {
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new AudioContext();
            }
            const audioContext = audioContextRef.current;

            // Resume if suspended (browser auto-play policy)
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const source = audioContext.createMediaStreamSource(audioStream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            sourceRef.current = source;
            analyserRef.current = analyser;

            draw();
            logger.debug('Waveform visualization started');
        } catch (error) {
            logger.error('Failed to start visualization', error as Error);
        }
    };

    const stopVisualization = () => {
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }

        // Fix: Explicitly close AudioContext to prevent "Too many AudioContexts" error
        if (audioContextRef.current) {
            if (audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(e => logger.warn('Error closing AudioContext', { error: String(e) }));
            }
            audioContextRef.current = null;
            logger.debug('Waveform visualization stopped');
        }

        // Clear canvas
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    };

    const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            if (!analyserRef.current) return;

            animationRef.current = requestAnimationFrame(render);
            analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgba(30, 41, 59, 0.3)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

                // Gradient color based on intensity
                const intensity = dataArray[i] / 255;
                const r = Math.floor(59 + intensity * 180);
                const g = Math.floor(130 + intensity * 50);
                const b = Math.floor(246 - intensity * 100);

                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

                x += barWidth;
            }
        };

        render();
    };

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={40}  // FIX: Match container height to prevent layout shift
            style={{
                borderRadius: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                maxHeight: '40px', // Ensure no overflow
                contain: 'strict', // Prevent layout recalculation from affecting parent
            }}
        />
    );
};
