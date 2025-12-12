import React from 'react';


/**
 * Logo3D Component
 * 
 * A purely decorative component representing the app brand.
 * Features a continuous 3D float animation using CSS keyframes.
 * Wrapped in React.memo to prevent re-renders during app state changes.
 */
export const Logo3D = React.memo(() => (
    <div
        style={{
            position: 'relative',
            perspective: '800px',
            cursor: 'pointer'
        }}
        aria-label="App Logo"
    >
        <div
            onClick={() => window.ipcRenderer.invoke('open-external', 'https://github.com/fishheadwithchili/kikipounamu.git')}
            style={{
                position: 'relative',
                zIndex: 10,
                transformStyle: 'preserve-3d',
                animation: 'float3d 6s ease-in-out infinite'
            }}>
            <img
                src="/icon.png"
                alt="App Logo"
                style={{
                    width: '32px',
                    height: '32px',
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
));

Logo3D.displayName = 'Logo3D';
