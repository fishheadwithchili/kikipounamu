import { useState } from 'react';
import { X } from 'lucide-react';

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
            {/* Minimize (Yellow) - First */}
            <div
                onClick={() => handleAction('minimize')}
                style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: '#ffbd2e',
                    border: '1px solid #e1a116',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontSize: '8px',
                    color: 'rgba(0,0,0,0.5)'
                }}
            >
                {hovered && <div style={{ width: '6px', height: '2px', backgroundColor: 'rgba(0,0,0,0.5)' }} />}
            </div>

            {/* Close (Red) - Second (Far Right) */}
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
        </div>
    );
};
