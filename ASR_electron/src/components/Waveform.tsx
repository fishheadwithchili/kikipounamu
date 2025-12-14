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

    // Fallback animation ref (for simulating "alive" state when no audio or waiting)
    // However, per requirements: "Fallback mechanism: Ensure in no audio stream (stream is empty), show a static but nice placeholder"
    // The design uses "Simulated random voice waves" in some contexts, but requirements say:
    // "Ensure in no audio stream (stream is empty), show a static but nice placeholder, rather than a blank space."

    useEffect(() => {
        if (isRecording && stream) {
            startVisualization(stream);
        } else {
            stopVisualization();
            drawFallback();
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

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            const source = audioContext.createMediaStreamSource(audioStream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 64; // Reduced for chunkier, distinct bars like design
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

        if (audioContextRef.current) {
            if (audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(e => logger.warn('Error closing AudioContext', { error: String(e) }));
            }
            audioContextRef.current = null;
        }

        // Don't clear rect immediately if we want fallback, but drawFallback handles it
    };

    const drawFallback = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Draw a static "ready" state - maybe a straight muted line or subtle pulses
        // Design request: "Static but nice placeholder"
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Simple subtle baseline
        const barCount = 20;
        const spacing = 4;
        const totalWidth = canvas.width;
        const barWidth = (totalWidth - (barCount - 1) * spacing) / barCount;

        for (let i = 0; i < barCount; i++) {
            const x = i * (barWidth + spacing);
            const height = 4; // Minimal height
            const y = (canvas.height - height) / 2;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(x, y, barWidth, height, 4);
            } else {
                ctx.rect(x, y, barWidth, height);
            }
            ctx.fill();
        }
    }

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

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Settings for design match
            const barCount = 24; // Limit bars for cleaner look
            const spacing = 6;
            const totalWidth = canvas.width;
            // Calculate bar width based on available space
            const barWidth = (totalWidth - (barCount - 1) * spacing) / barCount;

            // We'll increment through the logic carefully to spread FFT data
            const step = Math.floor(bufferLength / barCount);

            for (let i = 0; i < barCount; i++) {
                // Get average value for this chunk to smooth it out
                let value = 0;
                for (let j = 0; j < step; j++) {
                    value += dataArray[i * step + j] || 0;
                }
                value = value / step;

                // Scale value
                // Design has "soft" waves. 
                const percent = value / 255;
                const height = Math.max(percent * canvas.height * 0.9, 4); // Min height 4px

                const x = i * (barWidth + spacing);
                const y = (canvas.height - height) / 2; // Center vertically

                // Gradient: #3b82f6 (blue-500) to #a855f7 (purple-500)
                // We can create a vertical gradient for the bar
                const gradient = ctx.createLinearGradient(x, y, x, y + height);
                gradient.addColorStop(0, '#a855f7');
                gradient.addColorStop(1, '#3b82f6');

                ctx.fillStyle = gradient;

                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, barWidth, height, 999); // Pill shape
                } else {
                    ctx.rect(x, y, barWidth, height);
                }
                ctx.fill();
            }
        };

        render();
    };

    return (
        <canvas
            ref={canvasRef}
            width={300}
            height={40}
            style={{
                borderRadius: '8px',
                // Removed background color for cleaner look as per "transparent" vibe in design
                // backgroundColor: 'rgba(30, 41, 59, 0.5)', 
                maxHeight: '40px',
                contain: 'strict',
            }}
        />
    );
};
