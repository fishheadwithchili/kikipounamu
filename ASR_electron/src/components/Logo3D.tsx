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
        style={{
            position: 'relative',
            perspective: '800px',
            cursor: 'pointer'
        }}
        aria-label="App Logo"
    >
        <div
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
            style={{
                position: 'relative',
                perspective: '800px',
                cursor: 'pointer',
                // Ensure the click area is substantial
                padding: '4px'
            }}
            title="About Kikipounamu"
            aria-label="App Logo - About"
        >
            <div
                style={{
                    position: 'relative',
                    zIndex: 10,
                    transformStyle: 'preserve-3d',
                    animation: 'float3d 6s ease-in-out infinite',
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
            </div>

            {/* Dynamic Shadow */}
            <div style={{
                position: 'absolute',
                bottom: '-12px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '24px',
                height: '4px',
                backgroundColor: 'rgba(99, 102, 241, 0.3)',
                filter: 'blur(4px)',
                borderRadius: '50%',
                animation: 'shadowBreathe 6s ease-in-out infinite'
            }} />

            <style>{`
      @keyframes float3d {
        0%, 100% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); }
        25% { transform: translateY(-4px) rotateX(3deg) rotateY(2deg); }
        50% { transform: translateY(0px) rotateX(0deg) rotateY(0deg); }
        75% { transform: translateY(4px) rotateX(-3deg) rotateY(-2deg); }
      }
      @keyframes shadowBreathe {
        0%, 100% { transform: translateX(-50%) scaleX(1); opacity: 0.3; }
        25% { transform: translateX(-50%) scaleX(0.8); opacity: 0.2; }
        50% { transform: translateX(-50%) scaleX(1); opacity: 0.3; }
        75% { transform: translateX(-50%) scaleX(1.1); opacity: 0.4; }
      }
    `}</style>
        </div>
    </div>
));

Logo3D.displayName = 'Logo3D';
