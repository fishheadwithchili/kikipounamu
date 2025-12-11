import React from 'react';

type Status = 'connected' | 'disconnected' | 'error' | 'connecting';

interface StatusBarProps {
    status: Status;
}

export const StatusBar: React.FC<StatusBarProps> = ({ status }) => {
    const getStatusColor = () => {
        switch (status) {
            case 'connected': return 'var(--success-color)';
            case 'error': return 'var(--error-color)';
            case 'disconnected': return 'var(--text-muted)';
            default: return 'var(--text-muted)';
        }
    };

    return (
        <div style={{
            padding: '8px 16px',
            background: 'var(--card-bg)',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)'
        }}>
            <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(),
                marginRight: '8px',
                boxShadow: status === 'connected' ? `0 0 8px ${getStatusColor()}` : 'none'
            }} />
            <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
        </div>
    );
};
