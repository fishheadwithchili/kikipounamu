import React, { useRef, useEffect } from 'react';
import { float32ToBase64 } from '../utils/audioHelper';



interface WaveformProps {
    isRecording: boolean;
    stream: MediaStream | null;
    debugSessionId: string; // Shared session ID from VAD hook
}

export const Waveform: React.FC<WaveformProps> = ({ isRecording, stream, debugSessionId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const debugProcessorRef = useRef<ScriptProcessorNode | null>(null);


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

            // --- DEBUG CAPTURE WAVEFORM INPUT ---
            // We add a ScriptProcessor JUST to capture the audio data for debugging
            const debugProcessor = audioContext.createScriptProcessor(2048, 1, 1);
            debugProcessor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const base64 = float32ToBase64(inputData);
                // We use a fixed ID or similar to recognize it
                // Note: This runs on the Waveform's AudioContext (likely 44.1k or 48k)
                window.ipcRenderer.invoke('save-debug-audio-file', debugSessionId, 'wave', base64);
            };
            source.connect(debugProcessor);
            debugProcessor.connect(audioContext.destination); // Mute loopback? No, simple connect.
            // Be careful about feedback! If destination is speakers, you might hear yourself.
            // To avoid feedback, we can connect to a GainNode with gain 0.
            const gain = audioContext.createGain();
            gain.gain.value = 0;
            debugProcessor.connect(gain);
            gain.connect(audioContext.destination);

            debugProcessorRef.current = debugProcessor;
            // ------------------------------------

            draw();
        } catch (error) {
            console.error('Error starting visualization:', error);
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

        if (debugProcessorRef.current) {
            debugProcessorRef.current.disconnect();
            debugProcessorRef.current = null;
        }

        // Finalize debug wav file
        if (debugSessionId && audioContextRef.current) {
            const rate = audioContextRef.current.sampleRate;
            // Call async but don't wait for it
            window.ipcRenderer.invoke('finalize-debug-audio-file', debugSessionId, 'wave', rate);
        }

        // Fix: Explicitly close AudioContext to prevent "Too many AudioContexts" error
        if (audioContextRef.current) {
            if (audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close().catch(e => console.error('Error closing AudioContext:', e));
            }
            audioContextRef.current = null;
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
            height={60}
            style={{
                borderRadius: '8px',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
            }}
        />
    );
};
