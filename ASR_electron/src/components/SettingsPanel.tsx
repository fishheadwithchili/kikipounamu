import React, { useEffect } from 'react';
import { VADMode } from '../hooks/useVADRecording';

interface SettingsPanelProps {
    currentMode: VADMode;
    onModeChange: (mode: VADMode) => void;

    // Time Limit
    timeLimit: number;
    setTimeLimit: (val: number) => void;

    // New Props for History Settings
    maxTextHistory: number;
    setMaxTextHistory: (val: number) => void;
    maxAudioHistory: number;
    setMaxAudioHistory: (val: number) => void;
    savePath: string;
    setSavePath: (path: string) => void;

    onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    currentMode, onModeChange,
    timeLimit, setTimeLimit,
    maxTextHistory, setMaxTextHistory,
    maxAudioHistory, setMaxAudioHistory,
    savePath, setSavePath,
    onClose
}) => {

    // Initialize default path if empty
    useEffect(() => {
        if (!savePath) {
            window.ipcRenderer.invoke('get-default-save-path').then((defaultPath: string) => {
                setSavePath(defaultPath);
            });
        }
    }, []);

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 100
        }} onClick={onClose}>
            <div style={{
                backgroundColor: '#1e293b',
                padding: '24px',
                borderRadius: '12px',
                width: '450px',
                maxHeight: '80vh',
                overflowY: 'auto',
                border: '1px solid #334155',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#e2e8f0' }}>Settings</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.5rem' }}
                    >
                        ×
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {/* VAD Mode Section */}
                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>VAD Mode</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {[
                                { value: 'unlimited', label: 'Unlimited (No Auto-Cut)', desc: 'Best for long stream dictation' },
                                { value: 'time_limit', label: 'Time Limit', desc: 'Forces a cut after set duration' },
                                { value: 'vad', label: 'Smart VAD', desc: 'Cuts on silence > 500ms' }
                            ].map((option) => (
                                <div
                                    key={option.value}
                                    onClick={() => onModeChange(option.value as VADMode)}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '8px',
                                        backgroundColor: currentMode === option.value ? '#2563eb' : '#334155',
                                        cursor: 'pointer',
                                        border: currentMode === option.value ? '2px solid #3b82f6' : '2px solid transparent',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ fontWeight: 600, color: 'white', marginBottom: '2px' }}>{option.label}</div>
                                    <div style={{ fontSize: '0.8rem', color: currentMode === option.value ? '#bfdbfe' : '#94a3b8' }}>{option.desc}</div>
                                </div>
                            ))}
                        </div>

                        {/* Time Limit Configuration (Only for time_limit mode) */}
                        {currentMode === 'time_limit' && (
                            <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(30, 41, 59, 0.5)', borderRadius: '8px', border: '1px solid #475569' }}>
                                <label style={{ display: 'block', color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '6px' }}>Force Cut Duration (seconds)</label>
                                <input
                                    type="number"
                                    min="10"
                                    max="3600"
                                    value={timeLimit}
                                    onChange={(e) => setTimeLimit(parseInt(e.target.value) || 60)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '6px',
                                        color: 'white'
                                    }}
                                />
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                    Recording will be automatically sliced every {timeLimit} seconds.
                                </div>
                            </div>
                        )}
                    </div>

                    {/* History Settings */}
                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '12px', fontSize: '0.9rem', fontWeight: 600 }}>History Limits</label>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px' }}>Max Text Items</label>
                                <input
                                    type="number"
                                    value={maxTextHistory}
                                    onChange={(e) => setMaxTextHistory(parseInt(e.target.value) || 10)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '6px',
                                        color: 'white'
                                    }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', color: '#94a3b8', fontSize: '0.8rem', marginBottom: '4px' }}>Max Audio Items</label>
                                <input
                                    type="number"
                                    value={maxAudioHistory}
                                    onChange={(e) => setMaxAudioHistory(parseInt(e.target.value) || 5)}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: '#0f172a',
                                        border: '1px solid #334155',
                                        borderRadius: '6px',
                                        color: 'white'
                                    }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Storage Settings */}
                    <div>
                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>Audio Storage Path</label>
                        <input
                            type="text"
                            value={savePath}
                            onChange={(e) => setSavePath(e.target.value)}
                            placeholder="/path/to/save/audio"
                            style={{
                                width: '100%',
                                padding: '8px',
                                background: '#0f172a',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                color: '#94a3b8',
                                fontSize: '0.85rem'
                            }}
                        />
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                            Path must be absolute. Defaults to Documents/ASR_Recordings.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
