import React from 'react';
import { Waveform } from '../Waveform';
import { Mic, Square, Loader2 } from 'lucide-react';
import { HydroButton } from '../HydroButton';

interface ControlDockProps {
    isRecording: boolean;
    isLoading: boolean;
    onRecordToggle: () => void;
    stream: MediaStream | null;
}

export const ControlDock = React.memo(({ isRecording, isLoading, onRecordToggle, stream }: ControlDockProps) => (
    <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '24px',
        backgroundColor: 'rgba(17, 24, 39, 0.5)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '16px 32px',
        borderRadius: '32px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        transition: 'background-color 0.2s',
        width: '100%',
        maxWidth: 'calc(100% - 48px)'
    }}>
        {/* Main Record Button */}
        <HydroButton
            onClick={onRecordToggle}
            disabled={isLoading}
            aria-label={isRecording ? "Stop Recording" : "Start Recording"}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                backgroundColor: isRecording ? '#ef4444' : '#ffffff',
                color: isRecording ? 'white' : 'black',
                transition: 'all 0.3s'
            }}
        >
            {isRecording && (
                <span style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    opacity: 0.3,
                    animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite'
                }}></span>
            )}
            {isLoading ? (
                <Loader2 className="animate-spin" size={24} />
            ) : (
                isRecording ? <Square fill="currentColor" size={20} style={{ position: 'relative', zIndex: 10 }} /> : <Mic size={24} style={{ position: 'relative', zIndex: 10 }} />
            )}
        </HydroButton>

        {/* Audio Visualizer Area - FIX: Added overflow hidden and contain to prevent layout shift */}
        <div style={{
            flex: 1,
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden', // Prevent any overflow from causing layout shift
            contain: 'layout size', // Isolate layout calculations
            position: 'relative' // Establish containing block
        }}>
            {isRecording ? (
                <Waveform isRecording={isRecording} stream={stream} />
            ) : (
                <div style={{ width: '100%', textAlign: 'center', color: 'rgba(255, 255, 255, 0.5)', fontSize: '14px' }}>
                    Tap microphone to speak
                </div>
            )}
        </div>

        {/* Status Indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: '80px', justifyContent: 'flex-end' }}>
            <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: isRecording ? '#ef4444' : '#10b981',
                boxShadow: isRecording ? 'none' : '0 0 8px rgba(16, 185, 129, 0.6)',
                animation: isRecording ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none'
            }}></span>
            <span style={{
                fontSize: '12px',
                fontWeight: 500,
                color: 'rgba(255, 255, 255, 0.4)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                fontFamily: 'monospace',
                minWidth: '40px',
                textAlign: 'right'
            }}>
                {isLoading ? 'INIT' : (isRecording ? <TimerDisplay /> : 'READY')}
            </span>
        </div>
    </div>
));

const TimerDisplay = () => {
    const [seconds, setSeconds] = React.useState(0);

    React.useEffect(() => {
        const start = Date.now();
        const interval = setInterval(() => {
            setSeconds(Math.floor((Date.now() - start) / 1000));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};
