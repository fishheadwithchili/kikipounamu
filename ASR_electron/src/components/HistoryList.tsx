import React, { useState } from 'react';
import { Type, FileAudio, Settings, Copy, Check, Play, Pause } from 'lucide-react';
import { HydroButton } from './HydroButton';
import { Logo3D } from './Logo3D';
import { AboutModal } from './AboutModal';

import { ConnectionIndicator } from './ConnectionIndicator';

export interface HistoryItem {
    timestamp: string;
    text: string;
}

export interface AudioHistoryItem {
    timestamp: string;
    duration: number;
    filePath: string;
}

interface HistoryListProps {
    history: HistoryItem[];
    audioHistory: AudioHistoryItem[];
    onInsert: (text: string) => void;
    onPlayAudio: (filePath: string) => void;
    playingFilePath: string | null;
    isPlaying: boolean;
    onOpenSettings: () => void;
    connectionStatus?: 'connected' | 'disconnected' | 'error' | 'connecting';
}

const ANIMATION_TIMING = {
    TOAST: 2000
};

export const HistoryList: React.FC<HistoryListProps> = ({
    history,
    audioHistory,
    onInsert,
    onPlayAudio,
    playingFilePath,
    isPlaying,
    onOpenSettings,
    connectionStatus = 'disconnected'
}) => {
    const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [showAboutModal, setShowAboutModal] = useState(false);

    const handleCopy = (e: React.MouseEvent, text: string, idx: number) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopiedId(idx);
        setTimeout(() => setCopiedId(null), ANIMATION_TIMING.TOAST);
    };

    return (
        <div style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            backgroundColor: 'rgba(17, 24, 39, 0.3)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            width: '100%',
            height: '100%'
        }}>
            {/* Logo and Status */}
            <div style={{ padding: '20px', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <Logo3D onClick={() => setShowAboutModal(true)} />
                    <div>
                        <h2 style={{
                            fontWeight: 600,
                            color: 'rgba(255, 255, 255, 0.9)',
                            letterSpacing: '0.5px',
                            margin: 0,
                            fontSize: '16px'
                        }}>
                            Kikipounamu
                        </h2>
                        <p style={{
                            fontSize: '10px',
                            color: 'rgba(255, 255, 255, 0.4)',
                            fontFamily: 'monospace',
                            letterSpacing: '0.2em',
                            textTransform: 'uppercase',
                            margin: '0'
                        }}>Version 1.0</p>
                        <ConnectionIndicator status={connectionStatus} />
                    </div>
                </div>

                {/* Tab Switcher */}
                <div style={{
                    display: 'flex',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    padding: '4px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(8px)'
                }} role="tablist">
                    {(['text', 'audio'] as const).map(tab => (
                        <HydroButton
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            role="tab"
                            aria-selected={activeTab === tab}
                            style={{
                                flex: 1,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '6px',
                                borderRadius: '6px',
                                fontSize: '14px',
                                fontWeight: 500,
                                transition: 'all 0.2s',
                                backgroundColor: activeTab === tab ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                                color: activeTab === tab ? 'white' : 'rgba(255, 255, 255, 0.5)',
                                boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.1), inset 0 0 0 1px rgba(255,255,255,0.1)' : 'none'
                            }}
                        >
                            {tab === 'text' ? <Type size={14} /> : <FileAudio size={14} />}
                            {tab === 'text' ? 'Text' : 'Audio'}
                        </HydroButton>
                    ))}
                </div>
            </div>

            {/* Scrollable List */}
            <div
                className="custom-scrollbar"
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '0 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 16px, black calc(100% - 16px), transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0px, black 16px, black calc(100% - 16px), transparent 100%)'
                }}
            >
                {activeTab === 'text' ? (
                    <>
                        {history.length === 0 && (
                            <div style={{
                                padding: '20px',
                                color: 'rgba(255, 255, 255, 0.3)',
                                fontSize: '14px',
                                textAlign: 'center'
                            }}>
                                No text history yet
                            </div>
                        )}
                        {history.map((item, idx) => (
                            <div
                                key={idx}
                                onClick={() => onInsert(item.text)}
                                style={{
                                    padding: '14px',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    border: '1px solid transparent',
                                    transition: 'all 0.2s',
                                    backgroundColor: 'transparent',
                                    backdropFilter: 'blur(4px)'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.borderColor = 'transparent';
                                }}
                            >
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    marginBottom: '6px'
                                }}>
                                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.6)' }}>
                                        {item.timestamp}
                                    </span>
                                    {/* Fixed Width Copy Button */}
                                    <HydroButton
                                        onClick={(e) => handleCopy(e as React.MouseEvent, item.text, idx)}
                                        style={{
                                            fontSize: '10px',
                                            border: '1px solid',
                                            height: '24px',
                                            width: '64px',
                                            borderRadius: '12px',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: '4px',
                                            color: copiedId === idx ? '#4ade80' : 'rgba(255, 255, 255, 0.3)',
                                            borderColor: copiedId === idx ? 'rgba(74, 222, 128, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                                            backgroundColor: copiedId === idx ? 'rgba(74, 222, 128, 0.1)' : 'transparent'
                                        }}
                                    >
                                        {copiedId === idx ? <Check size={10} /> : <Copy size={10} />}
                                        {copiedId === idx ? 'Copied' : 'Copy'}
                                    </HydroButton>
                                </div>
                                <p style={{
                                    fontSize: '14px',
                                    color: 'rgba(255, 255, 255, 0.8)',
                                    overflow: 'hidden',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    lineHeight: '1.5',
                                    margin: '4px 0 0 0',
                                    transition: 'color 0.2s'
                                }}>
                                    {item.text}
                                </p>
                            </div>
                        ))}
                    </>
                ) : (
                    <>
                        {audioHistory.length === 0 && (
                            <div style={{
                                padding: '20px',
                                color: 'rgba(255, 255, 255, 0.3)',
                                fontSize: '14px',
                                textAlign: 'center'
                            }}>
                                No audio recordings yet
                            </div>
                        )}
                        {audioHistory.map((item, idx) => {
                            const isThisPlaying = playingFilePath === item.filePath && isPlaying;
                            return (
                                <div
                                    key={idx}
                                    onClick={() => onPlayAudio(item.filePath)}
                                    style={{
                                        padding: '14px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        border: '1px solid transparent',
                                        transition: 'all 0.2s',
                                        backgroundColor: 'transparent'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = 'transparent';
                                        e.currentTarget.style.borderColor = 'transparent';
                                    }}
                                >
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '50%',
                                        backgroundColor: '#3b82f6',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: 'white',
                                        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)'
                                    }}>
                                        {isThisPlaying ? <Pause size={14} /> : <Play size={14} />}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: 'white', fontWeight: 500, fontSize: '14px' }}>
                                            Recording
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.4)' }}>
                                            {item.timestamp} • {item.duration}s
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </>
                )}
            </div>

            {/* Footer */}
            <div style={{
                padding: '16px',
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                backdropFilter: 'blur(8px)',
                flexShrink: 0
            }}>
                <HydroButton
                    onClick={onOpenSettings}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '10px',
                        borderRadius: '12px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        fontSize: '14px',
                        fontWeight: 500,
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
                    <Settings size={18} />
                    Settings
                </HydroButton>
            </div>

            {/* About Modal */}
            {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
        </div>
    );
};
