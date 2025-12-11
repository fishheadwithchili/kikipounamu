import React, { useEffect, useRef, useState } from 'react';
import { Waveform } from './Waveform';

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
    const [copyFeedback, setCopyFeedback] = useState(false);

    // Multiselect State
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());

    // Scroll to bottom on new text (only if not selecting to avoid jumping)
    useEffect(() => {
        if (!isSelectionMode) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [segments, interimText, isSelectionMode]);

    const handleCopyAll = async () => {
        const fullText = [...segments, interimText].filter(Boolean).join('\n\n');
        if (!fullText) return;

        try {
            await navigator.clipboard.writeText(fullText);
            setCopyFeedback(true);
            onCopyAll?.();
            setTimeout(() => setCopyFeedback(false), 1500);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const handleToggleSelectionMode = () => {
        if (isSelectionMode) {
            // Exit mode
            setIsSelectionMode(false);
            setSelectedIndices(new Set());
        } else {
            // Enter mode
            setIsSelectionMode(true);
        }
    };

    const handleSelectSegment = (idx: number) => {
        if (!isSelectionMode) return;
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
            // Visual feedback could be here
            setIsSelectionMode(false);
            setSelectedIndices(new Set());
            // alert(`Copied ${selectedIndices.size} items to clipboard`); // Removing annoying alert
            console.log(`Copied ${selectedIndices.size} items to clipboard`);
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
            {/* Sticky Top Toolbar */}
            <div style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 20px',
                backgroundColor: 'rgba(15, 23, 42, 0.8)', // Matching dark theme
                backdropFilter: 'blur(12px)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                zIndex: 20
            }}>
                <div style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--text-muted, #94a3b8)',
                    letterSpacing: '0.5px'
                }}>
                    TRANSCRIPTION
                    {segments.length > 0 && <span style={{ marginLeft: '8px', opacity: 0.7 }}>({segments.length} segments)</span>}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    {/* Select Mode Button */}
                    <button
                        onClick={handleToggleSelectionMode}
                        disabled={!hasContent}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: isSelectionMode ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: isSelectionMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                            color: isSelectionMode ? '#60a5fa' : 'var(--text-primary, #e2e8f0)',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: hasContent ? 'pointer' : 'default',
                            transition: 'all 0.2s ease',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: hasContent ? 1 : 0.5
                        }}
                    >
                        <span>✓</span> {isSelectionMode ? 'Cancel Select' : 'Select'}
                    </button>

                    {/* Copy All Button (Hide in selection mode to avoid confusion?) */}
                    {!isSelectionMode && (
                        <button
                            onClick={handleCopyAll}
                            disabled={!hasContent}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                backgroundColor: copyFeedback ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.05)',
                                color: copyFeedback ? '#4ade80' : 'var(--text-primary, #e2e8f0)',
                                fontSize: '12px',
                                fontWeight: '500',
                                cursor: hasContent ? 'pointer' : 'default',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                opacity: hasContent ? 1 : 0.5
                            }}
                        >
                            {copyFeedback ? (
                                <><span>✓</span> Copied</>
                            ) : (
                                <><span>📋</span> Copy All</>
                            )}
                        </button>
                    )}

                    {/* New Session Button */}
                    <button
                        onClick={onClear}
                        disabled={!hasContent && !isRecording}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-primary, #e2e8f0)',
                            fontSize: '12px',
                            fontWeight: '500',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s ease',
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                    >
                        <span>🆕</span> New
                    </button>
                </div>
            </div>

            {/* Scrollable Content Area */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px',
                paddingBottom: '160px', // Space for floating controls
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
            }}>
                {/* Segments Loop */}
                {segments.map((seg, idx) => {
                    const isSelected = selectedIndices.has(idx);
                    return (
                        <div
                            key={idx}
                            onClick={() => handleSelectSegment(idx)}
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                cursor: isSelectionMode ? 'pointer' : 'default',
                                padding: isSelectionMode ? '8px' : '0',
                                borderRadius: '8px',
                                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                border: isSelected ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                                transition: 'all 0.2s'
                            }}
                        >
                            {/* Checkbox for Selection Mode */}
                            {isSelectionMode && (
                                <div style={{
                                    flexShrink: 0,
                                    width: '20px',
                                    height: '20px',
                                    marginTop: '4px',
                                    borderRadius: '4px',
                                    border: isSelected ? 'none' : '2px solid #475569',
                                    backgroundColor: isSelected ? '#3b82f6' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s'
                                }}>
                                    {isSelected && (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    )}
                                </div>
                            )}

                            <div style={{ flex: 1 }}>
                                <div style={{
                                    fontSize: '1.1rem',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-wrap',
                                    color: 'var(--text-primary, #e2e8f0)',
                                    userSelect: isSelectionMode ? 'none' : 'text'
                                }}>
                                    {seg}
                                </div>
                                {/* Separator Line (Only show if not last, but here it's per item) */}
                                <div style={{
                                    marginTop: '24px',
                                    height: '1px',
                                    backgroundColor: 'rgba(255,255,255,0.1)',
                                    width: '100%'
                                }} />
                            </div>
                        </div>
                    );
                })}

                {/* Interim/Processing Text */}
                {interimText && (
                    <div style={{
                        fontSize: '1.1rem',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        color: 'var(--text-primary, #e2e8f0)',
                        opacity: 0.8,
                        paddingLeft: isSelectionMode ? '32px' : '0' // Indent to align
                    }}>
                        {interimText}
                        {/* Cursor Pulse */}
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

                {/* Empty State */}
                {!hasContent && !isRecording && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        opacity: 0.3,
                        marginTop: '40px'
                    }}>
                        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎙️</div>
                        <div>Ready to transcribe</div>
                    </div>
                )}

                <div ref={endRef} />
            </div>

            {/* Floating Control Area */}
            <div style={{
                position: 'absolute',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'auto',
                minWidth: '320px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '12px',
                padding: '20px 24px',
                zIndex: 30
            }}>
                {/* SELECTION ACTION BAR */}
                {isSelectionMode ? (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 20px',
                        backgroundColor: '#1e293b',
                        borderRadius: '16px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem', marginRight: '8px' }}>
                            {selectedIndices.size} Selected
                        </span>
                        <div style={{ height: '20px', width: '1px', background: 'rgba(255,255,255,0.2)' }}></div>

                        <button
                            onClick={handleCopySelected}
                            disabled={selectedIndices.size === 0}
                            style={{
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: selectedIndices.size > 0 ? 'pointer' : 'not-allowed',
                                fontWeight: 500,
                                opacity: selectedIndices.size > 0 ? 1 : 0.5
                            }}
                        >
                            Copy Selected
                        </button>

                        <button
                            onClick={() => {
                                setIsSelectionMode(false);
                                setSelectedIndices(new Set());
                            }}
                            style={{
                                background: 'rgba(255,255,255,0.1)',
                                color: 'white',
                                border: 'none',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                ) : (
                    /* RECORDING CONTROLS (Standard View) */
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '20px 24px',
                        backgroundColor: 'rgba(15, 23, 42, 0.75)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        borderRadius: '24px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)'
                    }}>
                        {/* Queue Badge (if tasks pending) */}
                        {queueCount > 0 && (
                            <div style={{
                                position: 'absolute',
                                top: '-12px',
                                background: '#3b82f6',
                                color: 'white',
                                padding: '4px 12px',
                                borderRadius: '12px',
                                fontSize: '12px',
                                fontWeight: 600,
                                boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <div style={{
                                    width: '12px',
                                    height: '12px',
                                    border: '2px solid rgba(255,255,255,0.3)',
                                    borderTopColor: '#fff',
                                    borderRadius: '50%',
                                    animation: 'spin 1s linear infinite'
                                }} />
                                {queueCount} {queueCount === 1 ? 'task' : 'tasks'} processing
                            </div>
                        )}

                        {/* Waveform */}
                        <div style={{ height: '36px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {isRecording ? <Waveform isRecording={isRecording} stream={stream} /> : null}
                        </div>

                        {/* Record Button Container */}
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={onToggleRecording}
                                disabled={isLoading}
                                style={{
                                    width: '68px',
                                    height: '68px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: isLoading
                                        ? '#334155'
                                        : (isRecording
                                            ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                                            : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'),
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: isLoading ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    boxShadow: isLoading
                                        ? 'none'
                                        : (isRecording
                                            ? '0 0 25px rgba(239, 68, 68, 0.6), inset 0 0 10px rgba(255,255,255,0.2)'
                                            : '0 8px 20px rgba(37, 99, 235, 0.4), inset 0 0 10px rgba(255,255,255,0.2)'),
                                    transform: isRecording ? 'scale(1.1)' : 'scale(1)',
                                    animation: isRecording ? 'pulse 2s infinite' : 'none'
                                }}
                            >
                                {isLoading ? (
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        border: '2px solid rgba(255,255,255,0.3)',
                                        borderTopColor: '#ffffff',
                                        borderRadius: '50%',
                                        animation: 'spin 1s linear infinite',
                                    }} />
                                ) : (
                                    isRecording ? (
                                        <div style={{ width: '22px', height: '22px', borderRadius: '4px', backgroundColor: 'white' }} />
                                    ) : (
                                        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                            <line x1="12" y1="19" x2="12" y2="23"></line>
                                            <line x1="8" y1="23" x2="16" y2="23"></line>
                                        </svg>
                                    )
                                )}
                            </button>
                            {/* Background Task Indicator Dot on Button */}
                            {!isRecording && queueCount > 0 && (
                                <div style={{
                                    position: 'absolute',
                                    top: '0',
                                    right: '0',
                                    width: '14px',
                                    height: '14px',
                                    backgroundColor: '#3b82f6',
                                    borderRadius: '50%',
                                    border: '2px solid #0f172a',
                                    zIndex: 10
                                }} />
                            )}
                        </div>

                        {/* Status Text */}
                        <div style={{
                            color: 'rgba(255,255,255,0.8)',
                            fontSize: '12px',
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            textAlign: 'center'
                        }}>
                            {isLoading
                                ? 'INITIALIZING...'
                                : (isRecording
                                    ? (queueCount > 0 ? `LISTENING (${queueCount} in queue)` : 'LISTENING')
                                    : (queueCount > 0 ? `READY (${queueCount} processing)` : 'START RECORDING')
                                )
                            }
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse-cursor {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0; }
                }
            `}</style>
        </div >
    );
};
