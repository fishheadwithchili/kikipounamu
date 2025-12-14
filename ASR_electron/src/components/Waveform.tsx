import React, { useRef, useEffect, useState } from 'react';

interface WaveformProps {
    isRecording: boolean;
    stream: MediaStream | null;
}

export const Waveform: React.FC<WaveformProps> = ({ isRecording, stream }) => {
    const [volumes, setVolumes] = useState<number[]>(new Array(25).fill(0));
    const animationRef = useRef<number>();
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    useEffect(() => {
        if (isRecording && stream) {
            startVisualization(stream);
        } else {
            stopVisualization();
            // Reset volumes to base state
            setVolumes(new Array(25).fill(20)); // Base state
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
            analyser.fftSize = 64; // Small FFT size for chunky bars
            analyser.smoothingTimeConstant = 0.6; // Smooth transitions
            source.connect(analyser);

            sourceRef.current = source;
            analyserRef.current = analyser;

            updateVolumes();
        } catch (error) {
            console.error('Failed to start visualization', error);
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

        // We generally keep the AudioContext alive or suspend it, but closing it is safer for cleanup
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
        }
    };

    const updateVolumes = () => {
        if (!analyserRef.current) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Map FFT data to 25 bars
        // For FFT 64, bufferLength is 32. We need 25 bars.
        // We'll roughly sample the lower-mid frequencies where voice lives.
        const newVolumes: number[] = [];
        const step = Math.floor(bufferLength / 25) || 1;

        for (let i = 0; i < 25; i++) {
            let value = 0;
            // Simple averaging
            const index = Math.min(i * step, bufferLength - 1);
            value = dataArray[index] || 0;

            // Normalize 0-255 to percentage 20-100 (keep min height like design)
            const percent = Math.max((value / 255) * 80 + 20, 20);
            newVolumes.push(percent);
        }
        setVolumes(newVolumes);
        animationRef.current = requestAnimationFrame(updateVolumes);
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '100%',
            width: '100%',
            padding: '0 16px'
        }}>
            {volumes.map((vol, i) => (
                <div
                    key={i}
                    style={{
                        width: '6px',
                        height: `${vol}%`,
                        background: 'linear-gradient(to top, #3b82f6, #a855f7)',
                        borderRadius: '9999px',
                        transition: 'height 50ms ease-out'
                    }}
                ></div>
            ))}
        </div>
    );
};
