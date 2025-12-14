import React from 'react';


/**
 * Logo3D Component
 * 
 * A purely decorative component representing the app brand.
 * Features a continuous 3D float animation using CSS keyframes.
 * Wrapped in React.memo to prevent re-renders during app state changes.
 */

interface Logo3DProps {
    onClick?: () => void;
    size?: number;
}

export const Logo3D = React.memo(({ onClick, size = 32 }: Logo3DProps) => (
    <div
        className="relative group cursor-pointer"
        style={{ perspective: '800px' }}
        aria-label="App Logo"
        onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (onClick) {
                onClick();
            } else {
                // Default fallback if no handler provided (legacy behavior)
                if (window.ipcRenderer) {
                    window.ipcRenderer.invoke('log-message', 'info', '[Logo3D] Logo clicked, attempting to open GitHub...');
                    window.ipcRenderer.invoke('open-external', 'https://github.com/fishheadwithchili/kikipounamu.git')
                        .then((result: any) => {
                            if (result && result.copiedToClipboard) {
                                window.ipcRenderer.invoke('log-message', 'info', '[Logo3D] Browser open failed, link copied to clipboard.');
                                alert('Browser could not be opened. Link copied to clipboard!');
                            }
                        })
                        .catch(err => {
                            console.error(err);
                            window.ipcRenderer.invoke('log-message', 'error', `[Logo3D] Failed: ${err}`);
                        });
                }
            }
        }}
    >
        <div
            className="animate-float3d relative z-10"
            style={{
                transformStyle: 'preserve-3d',
                pointerEvents: 'none' // Pass clicks to parent
            }}>
            <img
                src="/icon.png"
                alt="App Logo"
                style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
                    objectFit: 'contain'
                }}
            />
            {/* Glossy Overlay suggestion from design, though utilizing image mostly */}
            <div className="absolute inset-0 rounded-lg border border-white/20 pointer-events-none"></div>
        </div>

        {/* Dynamic Shadow */}
        <div className="animate-shadow-breathe" style={{
            position: 'absolute',
            bottom: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '24px',
            height: '4px',
            backgroundColor: 'rgba(99, 102, 241, 0.3)',
            filter: 'blur(4px)',
            borderRadius: '50%',
        }} />
    </div>
));

Logo3D.displayName = 'Logo3D';
