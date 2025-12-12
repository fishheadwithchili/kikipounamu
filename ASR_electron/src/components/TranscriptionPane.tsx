import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Waveform } from './Waveform';
import { Mic, Square, Copy, Check, X, Loader2, Users } from 'lucide-react';
import { HydroButton } from './HydroButton';

type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'finalizing' | 'done';

interface TranscriptionPaneProps {
    segments: string[];        // Completed segments
    interimText: string;       // Current live text
    isRecording: boolean;
    onToggleRecording: () => void;
    onCopyAll?: () => void;    // Copy all content
    onClear?: () => void;      // Clear workspace
    autoPaste?: boolean;
    processingStatus?: ProcessingStatus;
    isLoading?: boolean;
    queueCount?: number;       // Number of background tasks
    stream?: MediaStream | null; // Shared stream
}

/* --- Internal Components --- */

interface ControlDockProps {
    isRecording: boolean;
    isLoading: boolean;
    queueCount: number;
    onRecordToggle: () => void;
    stream: MediaStream | null;
}

const ControlDock = React.memo(({ isRecording, isLoading, queueCount, onRecordToggle, stream }: ControlDockProps) => (
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
        maxWidth: '672px'
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

        {/* Audio Visualizer Area */}
        <div style={{ flex: 1, height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                fontFamily: 'monospace'
            }}>
                {isLoading ? 'INIT' : (isRecording ? 'REC' : 'READY')}
            </span>
        </div>
    </div>
));

interface SelectionDockProps {
    selectedCount: number;
    onCancel: () => void;
    onCopy: () => void;
    isCopied: boolean;
}

const SelectionDock = React.memo(({ selectedCount, onCancel, onCopy, isCopied }: SelectionDockProps) => (
    <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '8px 16px',
        borderRadius: '9999px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s ease-out'
    }}>
        <div style={{ padding: '0 16px', fontSize: '14px', fontWeight: 600, color: 'white', borderRight: '1px solid rgba(255, 255, 255, 0.1)', marginRight: '4px' }}>
            {selectedCount} Selected
        </div>

        <HydroButton
            onClick={onCopy}
            disabled={selectedCount === 0}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100px',
                padding: '8px 16px',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor: isCopied ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                color: isCopied ? '#4ade80' : 'rgba(255, 255, 255, 0.9)',
            }}
        >
            {isCopied ? <Check size={16} /> : <Copy size={16} />}
            {isCopied ? 'Copied' : 'Copy'}
        </HydroButton>

        <div style={{ height: '16px', width: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 4px' }}></div>

        <HydroButton
            onClick={onCancel}
            style={{
                padding: '8px',
                borderRadius: '9999px',
                color: 'rgba(255, 255, 255, 0.6)',
                transition: 'all 0.2s',
                backgroundColor: 'transparent'
            }}
            onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
            }}
        >
            <X size={18} />
        </HydroButton>
    </div>
));


/* --- Main Workspace Component --- */

export const TranscriptionPane: React.FC<TranscriptionPaneProps> = ({
    segments,
    interimText,
    isRecording,
    onToggleRecording,
    onCopyAll,
    onClear,
    autoPaste = true,
    processingStatus = 'idle',
    isLoading = false,
    queueCount = 0,
    stream = null
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    // Multiselect State
    const [viewMode, setViewMode] = useState<'edit' | 'select'>('edit');
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [isCopied, setIsCopied] = useState(false);

    // Scroll to bottom on new text
    useEffect(() => {
        if (viewMode !== 'select') {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [segments, interimText, viewMode]);

    const handleToggleSelectionMode = () => {
        if (viewMode === 'select') {
            setViewMode('edit');
            setSelectedIndices(new Set());
        } else {
            setViewMode('select');
        }
    };

    const handleSelectSegment = (idx: number) => {
        if (viewMode !== 'select') return;
        const newSet = new Set(selectedIndices);
        if (newSet.has(idx)) {
            newSet.delete(idx);
        } else {
            newSet.add(idx);
        }
        setSelectedIndices(newSet);
    };

    const handleCopySelected = async () => {
        const selectedText = segments
            .filter((_, idx) => selectedIndices.has(idx))
            .join('\n\n');

        if (selectedText) {
            await navigator.clipboard.writeText(selectedText);
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
            // Optionally exit selection mode
            // setViewMode('edit'); 
            // setSelectedIndices(new Set());
        }
    };

    const hasContent = segments.length > 0 || interimText;

    return (
        <div style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden',
            backgroundColor: 'transparent'
        }}>
            {/* Header / Top Bar */}
            <header style={{
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                marginTop: '8px',
                flexShrink: 0
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    backgroundColor: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>
                        {viewMode === 'select' ? 'Select Items' : 'Workspace'}
                        {segments.length > 0 && <span style={{ marginLeft: '8px', opacity: 0.5 }}>({segments.length})</span>}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <HydroButton
                        onClick={handleToggleSelectionMode}
                        disabled={!hasContent}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 16px',
                            borderRadius: '9999px',
                            fontSize: '14px',
                            transition: 'all 0.2s',
                            border: '1px solid',
                            backgroundColor: viewMode === 'select' ? 'white' : 'transparent',
                            color: viewMode === 'select' ? 'black' : 'rgba(255, 255, 255, 0.7)',
                            borderColor: viewMode === 'select' ? 'white' : 'transparent',
                            fontWeight: viewMode === 'select' ? 600 : 400
                        }}
                    >
                        {viewMode === 'select' ? <X size={16} /> : <Check size={16} />}
                        {viewMode === 'select' ? 'Cancel' : 'Select'}
                    </HydroButton>

                    {viewMode === 'edit' && (
                        <HydroButton
                            onClick={onClear}
                            disabled={!hasContent && !isRecording}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                backgroundColor: 'white',
                                color: 'black',
                                padding: '6px 20px',
                                borderRadius: '9999px',
                                fontSize: '14px',
                                fontWeight: 600,
                                boxShadow: '0 0 15px rgba(255, 255, 255, 0.2)',
                                transition: 'all 0.2s'
                            }}
                        >
                            New
                        </HydroButton>
                    )}
                </div>
            </header>

            {/* Dynamic Workspace */}
            <main className="custom-scrollbar mask-gradient" style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px 32px',
                paddingBottom: '160px',
            }}>
                <div style={{ maxWidth: '896px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Empty State */}
                    {!hasContent && !isRecording && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '60vh',
                            opacity: 0.3,
                        }}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎙️</div>
                            <div style={{ fontSize: '18px', fontWeight: 500 }}>Ready to transcribe</div>
                        </div>
                    )}

                    {segments.map((seg, idx) => {
                        const isSelected = selectedIndices.has(idx);
                        const isSelectMode = viewMode === 'select';
                        return (
                            <div
                                key={idx}
                                onClick={() => handleSelectSegment(idx)}
                                style={{
                                    position: 'relative',
                                    border: '1px solid',
                                    borderRadius: '16px',
                                    padding: '8px 16px',
                                    transition: 'all 0.3s',
                                    cursor: isSelectMode ? 'pointer' : 'default',
                                    backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                    borderColor: isSelected ? 'rgba(96, 165, 250, 0.5)' : 'rgba(255, 255, 255, 0.05)',
                                    boxShadow: isSelected ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none'
                                }}
                            >
                                {/* Active Indicator Bar */}
                                <div style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: '8px',
                                    bottom: '8px',
                                    width: '4px',
                                    borderTopRightRadius: '9999px',
                                    borderBottomRightRadius: '9999px',
                                    backgroundColor: 'rgba(96, 165, 250, 0.8)',
                                    boxShadow: '0 0 10px rgba(59, 130, 246, 0.8)',
                                    transition: 'all 0.3s',
                                    opacity: isSelected ? 1 : 0,
                                    transform: isSelected ? 'translateX(0)' : 'translateX(-8px)'
                                }}></div>

                                <div style={{
                                    fontSize: '18px',
                                    lineHeight: '1.6',
                                    color: 'rgba(255, 255, 255, 0.9)',
                                    fontWeight: 300,
                                    letterSpacing: '0.01em',
                                    whiteSpace: 'pre-wrap',
                                    paddingLeft: '8px',
                                    userSelect: isSelectMode ? 'none' : 'text'
                                }}>
                                    {seg}
                                </div>
                            </div>
                        );
                    })}

                    {/* Interim Text */}
                    {interimText && (
                        <div style={{
                            fontSize: '18px',
                            lineHeight: '1.6',
                            color: 'rgba(255, 255, 255, 0.9)',
                            fontWeight: 300,
                            letterSpacing: '0.01em',
                            whiteSpace: 'pre-wrap',
                            padding: '8px 24px',
                            opacity: 0.8
                        }}>
                            {interimText}
                            <span style={{
                                display: 'inline-block',
                                width: '2px',
                                height: '1.2em',
                                backgroundColor: '#3b82f6',
                                marginLeft: '2px',
                                verticalAlign: 'text-bottom',
                                animation: 'pulse-cursor 1s infinite'
                            }} />
                        </div>
                    )}
                    <div ref={endRef} />
                </div>
            </main>

            {/* Footer Dock Switching Logic */}
            <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                zIndex: 20,
                pointerEvents: 'none'
            }}>
                {viewMode === 'select' ? (
                    <SelectionDock
                        selectedCount={selectedIndices.size}
                        onCancel={handleToggleSelectionMode}
                        onCopy={handleCopySelected}
                        isCopied={isCopied}
                    />
                ) : (
                    <>
                        {/* Queue/Processing Status Pill */}
                        <div style={{
                            marginBottom: '16px',
                            pointerEvents: 'auto',
                            transition: 'all 0.5s',
                            transform: ['processing', 'queued'].includes(processingStatus) ? 'translateY(0)' : 'translateY(32px)',
                            opacity: ['processing', 'queued'].includes(processingStatus) ? 1 : 0
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 20px',
                                backgroundColor: 'rgba(31, 41, 55, 0.8)',
                                backdropFilter: 'blur(12px)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '9999px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                            }}>
                                {processingStatus === 'queued' || queueCount > 0 ? (
                                    <>
                                        <Users size={16} color="#facc15" />
                                        <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                            In Queue: <span style={{ color: '#facc15' }}>{queueCount} tasks</span>
                                        </span>
                                    </>
                                ) : processingStatus === 'processing' ? (
                                    <>
                                        <Loader2 size={16} color="#60a5fa" className="animate-spin" />
                                        <span style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.9)', fontWeight: 500 }}>
                                            Processing transcription...
                                        </span>
                                    </>
                                ) : null}
                            </div>
                        </div>

                        <ControlDock
                            isRecording={isRecording}
                            isLoading={isLoading}
                            queueCount={queueCount}
                            onRecordToggle={onToggleRecording}
                            stream={stream}
                        />
                    </>
                )}
            </div>

            <style>{`
                .mask-gradient { 
                    mask-image: linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%); 
                    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 2%, black 98%, transparent 100%); 
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: .5; }
                }
                @keyframes ping {
                    75%, 100% { transform: scale(2); opacity: 0; }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .animate-spin {
                    animation: spin 1s linear infinite;
                }
            `}</style>
        </div>
    );
};
