import React from 'react';

interface ConnectionIndicatorProps {
    status: 'connected' | 'disconnected' | 'error' | 'connecting';
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({ status }) => {
    const getStatusColor = () => {
        switch (status) {
            case 'connected': return '#10b981';
            case 'error': return '#ef4444';
            case 'connecting': return '#f59e0b';
            default: return '#64748b';
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '2px'
        }}>
            <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: getStatusColor(),
                boxShadow: status === 'connected'
                    ? `0 0 8px ${getStatusColor()}`
                    : 'none'
            }} />
        </div>
    );
};
