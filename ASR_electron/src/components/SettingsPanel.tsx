import React, { useEffect } from 'react';
import { VADMode } from '../hooks/useVADRecording';
import { HydroButton } from './HydroButton';
import { CustomSelect } from './CustomSelect';
import { X } from 'lucide-react';

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

    // Audio Device Selection
    audioDevices: MediaDeviceInfo[];
    selectedAudioDeviceId: string;
    onAudioDeviceChange: (deviceId: string) => void;

    onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
    currentMode, onModeChange,
    timeLimit, setTimeLimit,
    maxTextHistory, setMaxTextHistory,
    maxAudioHistory, setMaxAudioHistory,
    savePath, setSavePath,
    audioDevices, selectedAudioDeviceId, onAudioDeviceChange,
    onClose
}) => {
    // Tab state
    const [activeTab, setActiveTab] = React.useState<'recording' | 'history'>('recording');

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
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'opacity',
            transform: 'translateZ(0)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.1s ease-out'
        }} role="dialog" aria-label="Settings">
            <div style={{
                position: 'relative',
                willChange: 'transform, opacity',
                backfaceVisibility: 'hidden',
                backgroundColor: 'rgba(17, 24, 39, 0.6)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                width: '100%',
                maxWidth: '512px',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
                animation: 'zoomIn 0.1s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh'
            }}>
                {/* Decorative Top Glow */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(to right, #3b82f6, #a855f7, #ec4899)',
                    opacity: 0.7
                }}></div>

                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ fontSize: '20px', fontWeight: 600, color: 'white', margin: 0 }}>Settings</h2>
                    <HydroButton
                        onClick={onClose}
                        aria-label="Close Settings"
                        style={{
                            padding: '4px',
                            borderRadius: '50%',
                            color: 'white',
                            backgroundColor: 'transparent',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <X size={20} />
                    </HydroButton>
                </div>

                {/* Tabs Header */}
                <div style={{
                    display: 'flex',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    padding: '0 16px'
                }}>
                    {[
                        { id: 'recording', label: 'Recording' },
                        { id: 'history', label: 'History & Storage' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            style={{
                                padding: '16px',
                                background: 'transparent',
                                border: 'none',
                                borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
                                color: activeTab === tab.id ? 'white' : 'rgba(255, 255, 255, 0.5)',
                                fontWeight: 500,
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Configuration Options */}
                <div
                    className="custom-scrollbar"
                    style={{
                        padding: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '20px',
                        // Target height for consistency between tabs
                        height: '340px',
                        // Allow shrinking on small screens (captured by max-height on parent)
                        flexShrink: 1,
                        minHeight: '100px',
                        overflowY: 'auto'
                    }}>

                    {activeTab === 'recording' && (
                        <>
                            {/* Audio Source Selection */}
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '8px'
                                }}>Microphone Input</label>
                                <div style={{ position: 'relative', zIndex: 20 }}>
                                    <CustomSelect
                                        value={selectedAudioDeviceId}
                                        onChange={onAudioDeviceChange}
                                        placeholder="Select Microphone"
                                        icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>}
                                        options={[
                                            { value: 'default', label: '🎤 System Default' },
                                            ...audioDevices.map(device => ({
                                                value: device.deviceId,
                                                label: device.label || `Microphone ${device.deviceId.slice(0, 8)}...`
                                            }))
                                        ]}
                                    />
                                </div>

                            </div>

                            {/* VAD Selection */}
                            <div>
                                <label style={{
                                    display: 'block',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    color: 'rgba(255, 255, 255, 0.5)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: '12px'
                                }}>Recording Mode</label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '12px' }}>
                                    {[
                                        { value: 'unlimited', label: 'Unlimited (No Auto-Cut)', desc: 'Best for long stream dictation.' },
                                        { value: 'time_limit', label: 'Time Limit', desc: 'Forces a cut after a set duration.' },
                                    ].map((option) => {
                                        const isActive = currentMode === option.value;
                                        return (
                                            <div key={option.value} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <HydroButton
                                                    onClick={() => onModeChange(option.value as VADMode)}
                                                    style={{
                                                        position: 'relative',
                                                        padding: '12px',
                                                        borderRadius: '12px',
                                                        backgroundColor: isActive ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                                                        border: isActive ? '1px solid rgba(96, 165, 250, 0.3)' : '1px solid rgba(255, 255, 255, 0.05)',
                                                        cursor: 'pointer',
                                                        textAlign: 'left',
                                                        flex: 1, // Take available space
                                                        transition: 'all 0.2s',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            width: '16px', height: '16px', borderRadius: '50%',
                                                            border: isActive ? '2px solid #60a5fa' : '2px solid rgba(255, 255, 255, 0.2)',
                                                            backgroundColor: isActive ? '#3b82f6' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                                        }}>
                                                            {isActive && <div style={{ width: '6px', height: '6px', backgroundColor: 'white', borderRadius: '50%' }}></div>}
                                                        </div>
                                                        <div>
                                                            <h3 style={{ margin: 0, color: isActive ? 'white' : 'rgba(255, 255, 255, 0.8)', fontWeight: 500, fontSize: '14px' }}>{option.label}</h3>
                                                            <p style={{ margin: '2px 0 0 0', color: isActive ? 'rgba(191, 219, 254, 0.7)' : 'rgba(255, 255, 255, 0.4)', fontSize: '12px' }}>{option.desc}</p>
                                                        </div>
                                                    </div>
                                                </HydroButton>

                                                {/* Inline Time Input for Time Limit option */}
                                                {option.value === 'time_limit' && isActive && (
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                                        borderRadius: '12px',
                                                        padding: '0 12px',
                                                        width: '100px',
                                                        animation: 'fadeIn 0.2s ease-out'
                                                    }}>
                                                        <input
                                                            type="number"
                                                            min="10"
                                                            max="3600"
                                                            value={timeLimit}
                                                            onChange={(e) => setTimeLimit(parseInt(e.target.value) || 60)}
                                                            style={{
                                                                width: '100%',
                                                                backgroundColor: 'transparent',
                                                                border: 'none',
                                                                color: 'white',
                                                                textAlign: 'right',
                                                                fontSize: '14px',
                                                                fontWeight: 600,
                                                                outline: 'none',
                                                                padding: '12px 4px 12px 0'
                                                            }}
                                                        />
                                                        <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', fontWeight: 500 }}>s</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'history' && (
                        <>
                            {/* Limits */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <label style={{
                                        display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.5)',
                                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
                                    }}>Max Text Items</label>
                                    <input
                                        type="number"
                                        value={maxTextHistory}
                                        onChange={(e) => setMaxTextHistory(parseInt(e.target.value) || 10)}
                                        style={{
                                            width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '10px', color: 'white', outline: 'none'
                                        }}
                                    />
                                </div>
                                <div>
                                    <label style={{
                                        display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.5)',
                                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
                                    }}>Max Audio Items</label>
                                    <input
                                        type="number"
                                        value={maxAudioHistory}
                                        onChange={(e) => setMaxAudioHistory(parseInt(e.target.value) || 5)}
                                        style={{
                                            width: '100%', boxSizing: 'border-box', backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '10px', color: 'white', outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Audio Path */}
                            <div>
                                <label style={{
                                    display: 'block', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.5)',
                                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px'
                                }}>Audio Storage Path</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        type="text"
                                        value={savePath}
                                        onChange={(e) => setSavePath(e.target.value)}
                                        style={{
                                            flex: 1, boxSizing: 'border-box', backgroundColor: 'rgba(0, 0, 0, 0.2)',
                                            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', padding: '10px',
                                            color: 'rgba(255, 255, 255, 0.7)', fontFamily: 'monospace', fontSize: '14px', outline: 'none'
                                        }}
                                    />
                                </div>
                                <p style={{ marginTop: '8px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.3)' }}>
                                    Leave empty to use system default Documents folder.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Buttons */}
                <div style={{
                    padding: '16px',
                    backgroundColor: 'rgba(0, 0, 0, 0.2)',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <HydroButton
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            color: 'rgba(255, 255, 255, 0.6)',
                            fontSize: '14px',
                            fontWeight: 500,
                            borderRadius: '9999px',
                            transition: 'color 0.2s',
                            backgroundColor: 'transparent'
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = 'white'}
                        onMouseLeave={e => e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)'}
                    >
                        Cancel
                    </HydroButton>
                    <HydroButton
                        onClick={onClose}
                        style={{
                            padding: '8px 24px',
                            backgroundColor: 'white',
                            color: 'black',
                            borderRadius: '9999px',
                            fontSize: '14px',
                            fontWeight: 600,
                            boxShadow: '0 0 20px rgba(255, 255, 255, 0.3)',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                    >
                        Save Changes
                    </HydroButton>
                </div>
            </div>
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes zoomIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
};
