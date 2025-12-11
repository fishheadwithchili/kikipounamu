import React, { useState } from 'react';

export interface HistoryItem {
    timestamp: string;
    text: string;
}

export interface AudioHistoryItem {
    timestamp: string;
    duration: number; // in seconds
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
}

export const HistoryList: React.FC<HistoryListProps> = ({
    history,
    audioHistory,
    onInsert,
    onPlayAudio,
    playingFilePath,
    isPlaying,
    onOpenSettings
}) => {
    const [activeTab, setActiveTab] = useState<'text' | 'audio'>('text');
    const [copyState, setCopyState] = useState<number | null>(null);

    const handleCopy = (e: React.MouseEvent, text: string, idx: number) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopyState(idx);
        setTimeout(() => setCopyState(null), 1500);
    };

    return (
        <div style={{
            width: '280px',
            background: 'var(--card-bg)', // Assuming parent provides or fallback
            backgroundColor: '#0f172a',
            borderRight: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            flexDirection: 'column',
            height: '100%'
        }}>
            {/* Tabs Header */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255,255,255,0.05)'
            }}>
                <button
                    onClick={() => setActiveTab('text')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: activeTab === 'text' ? 'rgba(255,255,255,0.05)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'text' ? 'white' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'text' ? '600' : '400',
                        borderBottom: activeTab === 'text' ? '2px solid #3b82f6' : '2px solid transparent'
                    }}
                >
                    Text History
                </button>
                <button
                    onClick={() => setActiveTab('audio')}
                    style={{
                        flex: 1,
                        padding: '12px',
                        background: activeTab === 'audio' ? 'rgba(255,255,255,0.05)' : 'transparent',
                        border: 'none',
                        color: activeTab === 'audio' ? 'white' : 'var(--text-muted, #94a3b8)',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'audio' ? '600' : '400',
                        borderBottom: activeTab === 'audio' ? '2px solid #3b82f6' : '2px solid transparent'
                    }}
                >
                    Audio History
                </button>
            </div>

            {/* List Content */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
            }}>
                {activeTab === 'text' ? (
                    <>
                        {history.length === 0 && (
                            <div style={{ padding: '10px', color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>
                                No text history yet
                            </div>
                        )}
                        {history.map((item, idx) => (
                            <div key={idx}
                                onClick={() => onInsert(item.text)}
                                style={{
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    position: 'relative',
                                    border: '1px solid rgba(255,255,255,0.02)',
                                    transition: 'all 0.2s'
                                }}
                                className="history-item hover:bg-slate-800"
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.timestamp}</span>
                                    <button
                                        onClick={(e) => handleCopy(e, item.text, idx)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: copyState === idx ? '#22c55e' : '#64748b',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            backgroundColor: copyState === idx ? 'rgba(34, 197, 94, 0.1)' : 'transparent'
                                        }}
                                        title="Copy text"
                                    >
                                        {copyState === idx ? 'Copied' : 'Copy'}
                                    </button>
                                </div>
                                <div style={{
                                    color: '#e2e8f0',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: 'vertical',
                                    lineHeight: '1.4'
                                }}>
                                    {item.text}
                                </div>
                            </div>
                        ))}
                    </>
                ) : (
                    <>
                        {audioHistory.length === 0 && (
                            <div style={{ padding: '10px', color: '#64748b', fontSize: '0.9rem', textAlign: 'center' }}>
                                No audio recordings yet
                            </div>
                        )}
                        {audioHistory.map((item, idx) => (
                            <div key={idx}
                                onClick={() => onPlayAudio(item.filePath)}
                                style={{
                                    padding: '12px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '8px',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    border: '1px solid rgba(255,255,255,0.02)'
                                }}
                            >
                                <div style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    backgroundColor: '#3b82f6',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'white' // Ensure icon fill uses this
                                }}>
                                    {playingFilePath === item.filePath && isPlaying ? (
                                        // Pause Icon
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                            <rect x="6" y="4" width="4" height="16" rx="1" />
                                            <rect x="14" y="4" width="4" height="16" rx="1" />
                                        </svg>
                                    ) : (
                                        // Play Icon
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M5 3L19 12L5 21V3Z" />
                                        </svg>
                                    )}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ color: '#e2e8f0', fontWeight: '500' }}>Recording</div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        {item.timestamp} • {item.duration}s
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>

            {/* Settings Button Footer */}
            <div style={{
                padding: '16px',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                justifyContent: 'flex-start'
            }}>
                <button
                    onClick={onOpenSettings}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.9rem',
                        padding: '8px',
                        borderRadius: '6px',
                        transition: 'color 0.2s'
                    }}
                    className="hover:text-white"
                >
                    ⚙️ Settings
                </button>
            </div>
        </div >
    );
};
