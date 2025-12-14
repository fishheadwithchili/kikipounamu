import React, { useEffect, useRef, useState } from 'react';
import { Check, X, Loader2, Users, ChevronLeft, History, Plus, Copy } from 'lucide-react';
import { HydroButton } from '../HydroButton';
import { ControlDock } from './ControlDock';
import { SelectionDock } from './SelectionDock';

type ProcessingStatus = 'idle' | 'recording' | 'processing' | 'finalizing' | 'done' | 'queued';

interface TranscriptionPaneProps {
    segments: string[];        // Completed segments
    interimText: string;       // Current live text
    isRecording: boolean;
    onToggleRecording: () => void;
    onClear?: () => void;      // Clear workspace
    processingStatus?: ProcessingStatus;
    isLoading?: boolean;
    queueCount?: number;       // Number of background tasks
    stream?: MediaStream | null; // Shared stream
    showHistory?: boolean;
    onToggleHistory?: () => void;
}

/* --- Main Workspace Component --- */

export const TranscriptionPane: React.FC<TranscriptionPaneProps> = ({
    segments,
    interimText,
    isRecording,
    onToggleRecording,
    onClear,
    processingStatus = 'idle',
    isLoading = false,
    queueCount = 0,
    stream = null,
    showHistory = true,
    onToggleHistory
}) => {
    const endRef = useRef<HTMLDivElement>(null);

    // Multiselect State
    const [viewMode, setViewMode] = useState<'edit' | 'select'>('edit');
    const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
    const [isCopied, setIsCopied] = useState(false);

    const [isCopiedAll, setIsCopiedAll] = useState(false);

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
            setTimeout(() => {
                setIsCopied(false);
                setViewMode('edit');
                setSelectedIndices(new Set());
            }, 600);
        }
    };

    const handleCopyAll = async () => {
        const allText = segments.join('\n\n');
        if (allText) {
            await navigator.clipboard.writeText(allText);
            setIsCopiedAll(true);
            setTimeout(() => setIsCopiedAll(false), 2000);
        }
    };

    const hasContent = segments.length > 0 || interimText;

    return (
        <div style={{
            /* Container doesn't matter for fixed children, but keeping it clean */
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent'
        }}>
            {/* Header / Top Bar - FIXED Viewport Anchor */}
            <header style={{
                position: 'fixed',
                top: '46px', // 38px (Drag) + 8px (Margin)
                left: showHistory ? '320px' : '0px',
                right: 0,
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                zIndex: 20,
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px', /** Reduced gap to fit divider */
                    backgroundColor: 'rgba(17, 24, 39, 0.4)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '6px 6px', /** Minimal padding for icon only */
                    borderRadius: '9999px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}>
                    {/* Toggle Button */}
                    <HydroButton
                        onClick={onToggleHistory}
                        style={{
                            padding: '8px',
                            borderRadius: '50%',
                            color: 'rgba(255, 255, 255, 0.7)',
                            backgroundColor: 'transparent',
                            transition: 'all 0.2s'
                        }}
                        // Hover effect handled inline or via CSS if strict
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                        }}
                    >
                        {showHistory ? <ChevronLeft size={20} /> : <History size={20} />}
                    </HydroButton>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Copy All Button */}
                    <HydroButton
                        onClick={handleCopyAll}
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
                            backgroundColor: isCopiedAll ? 'rgba(74, 222, 128, 0.1)' : 'transparent',
                            color: isCopiedAll ? '#4ade80' : 'rgba(255, 255, 255, 0.7)',
                            borderColor: isCopiedAll ? '#4ade80' : 'transparent',
                            fontWeight: 500
                        }}
                    >
                        {isCopiedAll ? <Check size={16} /> : <Copy size={16} />}
                        {isCopiedAll ? 'Copied' : 'Copy All'}
                    </HydroButton>

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
                            <Plus size={16} /> New
                        </HydroButton>
                    )}
                </div>
            </header>

            {/* Dynamic Workspace - FIXED Viewport Anchor */}
            <main className="custom-scrollbar mask-gradient" style={{
                position: 'fixed',
                top: '110px', // 38 + 64 + 8
                left: showHistory ? '320px' : '0px',
                right: 0,
                bottom: 0,
                // Remove width/height hardcodes, revert to anchor
                overflowY: 'auto',
                padding: '16px 32px',
                paddingBottom: '160px',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                <div style={{ maxWidth: '896px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Empty State */}
                    {!hasContent && !isRecording && (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginTop: '20vh',
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

            {/* Footer Dock Switching Logic - FIXED Viewport Anchor */}
            <div style={{
                position: 'fixed',
                bottom: 0,
                left: showHistory ? '320px' : '0px',
                right: 0,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                zIndex: 30, // Increased z-index to break stacking context issues
                pointerEvents: 'none',
                transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
            }}>
                {viewMode === 'select' ? (
                    <SelectionDock
                        selectedCount={selectedIndices.size}
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
