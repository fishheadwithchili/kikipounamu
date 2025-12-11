import React, { useState } from 'react';

interface CrashFile {
    name: string;
    path: string;
    time: Date;
    size: number;
    sessionId: string;
}

interface RecoveryModalProps {
    files: CrashFile[];
    onRecover: (file: CrashFile) => Promise<void>;
    onDiscard: (file: CrashFile) => Promise<void>;
    onClose: () => void;
}

export const RecoveryModal: React.FC<RecoveryModalProps> = ({ files, onRecover, onDiscard, onClose }) => {
    const [processing, setProcessing] = useState<string | null>(null);

    const handleRecoverAll = async () => {
        setProcessing('recovering');
        for (const file of files) {
            await onRecover(file);
        }
        setProcessing(null);
        onClose();
    };

    const handleDiscardAll = async () => {
        if (!confirm('Are you sure you want to discard all unsaved recordings? This cannot be undone.')) return;
        setProcessing('discarding');
        for (const file of files) {
            await onDiscard(file);
        }
        setProcessing(null);
        onClose();
    };

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 200
        }}>
            <div style={{
                backgroundColor: '#1e293b',
                padding: '24px',
                borderRadius: '12px',
                width: '500px',
                maxHeight: '80vh',
                overflowY: 'auto',
                border: '1px solid #ef4444', // Red border to indicate alert
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{ marginBottom: '20px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        ⚠️ Unsaved Recordings Found
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '8px' }}>
                        The application did not close properly. We found {files.length} unsaved recording(s).
                    </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', maxHeight: '300px', overflowY: 'auto' }}>
                    {files.map(f => (
                        <div key={f.sessionId} style={{
                            padding: '12px',
                            background: '#0f172a',
                            borderRadius: '6px',
                            border: '1px solid #334155',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ color: '#e2e8f0', fontSize: '0.9rem' }}>
                                    Recording {new Date(f.time).toLocaleString()}
                                </div>
                                <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                    {(f.size / 1024 / 1024).toFixed(2)} MB
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={handleDiscardAll}
                        disabled={!!processing}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: '1px solid #475569',
                            background: 'transparent',
                            color: '#94a3b8',
                            cursor: 'pointer'
                        }}
                    >
                        {processing === 'discarding' ? 'Discarding...' : 'Discard All'}
                    </button>
                    <button
                        onClick={handleRecoverAll}
                        disabled={!!processing}
                        style={{
                            padding: '10px 16px',
                            borderRadius: '6px',
                            border: 'none',
                            background: '#2563eb',
                            color: 'white',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        {processing === 'recovering' ? 'Recovering...' : 'Recover All'}
                    </button>
                </div>
            </div>
        </div>
    );
};
