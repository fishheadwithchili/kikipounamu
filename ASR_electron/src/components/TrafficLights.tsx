import React, { useState } from 'react';
import { X, Minus, Maximize2 } from 'lucide-react';

export const TrafficLights = () => {
    const [hovered, setHovered] = useState(false);

    const handleAction = (action: 'close' | 'minimize' | 'maximize') => {
        window.ipcRenderer.invoke(`window-${action}`);
    };

    return (
        <div
            className="traffic-lights"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
                display: 'flex',
                gap: '8px',
                padding: '0 8px',
                alignItems: 'center',
                height: '100%',
                marginTop: '1px', // Slight alignment tweak
                ...({ WebkitAppRegion: 'no-drag' } as any)
            }}
        >
            {/* Close */}
            <div
                onClick={() => handleAction('close')}
                style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ff5f56',
                    border: '1px solid #e0443e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '8px',
                    color: 'rgba(0,0,0,0.5)'
                }}
            >
                {hovered && <X size={8} strokeWidth={3} />}
            </div>

            {/* Minimize */}
            <div
                onClick={() => handleAction('minimize')}
                style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffbd2e',
                    border: '1px solid #dea123',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '8px',
                    color: 'rgba(0,0,0,0.5)'
                }}
            >
                {hovered && <Minus size={8} strokeWidth={3} />}
            </div>

            {/* Maximize */}
            <div
                onClick={() => handleAction('maximize')}
                style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#27c93f',
                    border: '1px solid #1aab29',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '8px',
                    color: 'rgba(0,0,0,0.5)'
                }}
            >
                {hovered && <Maximize2 size={6} strokeWidth={4} />}
            </div>
        </div>
    );
};
