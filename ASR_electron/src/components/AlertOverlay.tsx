import React, { useMemo } from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { HydroButton } from './HydroButton';

export type AlertType = 'error' | 'warning' | 'info';

interface AlertOverlayProps {
    type: AlertType;
    title?: string;
    description?: string;
    onDismiss: () => void;
}

/**
 * AlertOverlay Component
 * 
 * A modal system for displaying critical states (Error, Warning, Info).
 * Features a glassmorphism backdrop blur and specific animations per type.
 */
export const AlertOverlay: React.FC<AlertOverlayProps> = ({
    type,
    title,
    description,
    onDismiss
}) => {
    const config = useMemo(() => ({
        error: {
            icon: <AlertTriangle size={36} />,
            color: '#ef4444',
            bgColor: 'rgba(239, 68, 68, 0.2)',
            defaultTitle: 'Device Conflict',
            defaultDesc: 'Audio device busy.',
            animation: 'float-error'
        },
        warning: {
            icon: <AlertCircle size={36} />,
            color: '#f97316',
            bgColor: 'rgba(249, 115, 22, 0.2)',
            defaultTitle: 'System Overload',
            defaultDesc: 'Slow down interaction.',
            animation: 'float-warning'
        },
        info: {
            icon: <Info size={36} />,
            color: '#3b82f6',
            bgColor: 'rgba(59, 130, 246, 0.2)',
            defaultTitle: 'Calibrated',
            defaultDesc: 'Sensitivity adjusted.',
            animation: 'float-info'
        }
    }[type]), [type]);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                userSelect: 'none',
                animation: 'fadeIn 0.3s ease-out'
            }}
            role="dialog"
            aria-modal="true"
        >
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '384px',
                margin: '0 16px',
                padding: '2px',
                borderRadius: '24px',
                background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                animation: 'zoomIn 0.3s ease-out'
            }}>
                <div style={{
                    backgroundColor: '#161922',
                    borderRadius: '22px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    padding: '32px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    overflow: 'hidden',
                    position: 'relative'
                }}>
                    {/* Top Glow */}
                    <div style={{
                        position: 'absolute',
                        top: '-64px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '200px',
                        height: '128px',
                        backgroundColor: config.color,
                        filter: 'blur(48px)',
                        borderRadius: '50%',
                        opacity: 0.2
                    }} />

                    {/* Animated Icon Container */}
                    <div style={{
                        position: 'relative',
                        width: '80px',
                        height: '80px',
                        borderRadius: '24px',
                        backgroundColor: config.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 25px 50px -12px ${config.color}`,
                        marginBottom: '24px',
                        color: 'white',
                        animation: `${config.animation} 3s ease-in-out infinite`
                    }}>
                        {config.icon}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '24px',
                            border: '1px solid rgba(255, 255, 255, 0.2)'
                        }} />
                    </div>

                    <h3 style={{
                        fontSize: '20px',
                        fontWeight: 700,
                        color: 'white',
                        marginBottom: '12px',
                        margin: 0
                    }}>
                        {title || config.defaultTitle}
                    </h3>

                    <p style={{
                        color: '#94a3b8',
                        fontSize: '14px',
                        marginBottom: '32px',
                        margin: '12px 0 32px 0'
                    }}>
                        {description || config.defaultDesc}
                    </p>

                    <HydroButton
                        onClick={onDismiss}
                        style={{
                            width: '100%',
                            padding: '14px',
                            borderRadius: '12px',
                            fontWeight: 600,
                            color: 'white',
                            backgroundColor: config.color,
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '14px',
                            transition: 'filter 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                    >
                        Understood
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
        @keyframes float-info {
          0%, 100% { transform: translateY(0px) rotate3d(0, 1, 0, 0deg); }
          50% { transform: translateY(-12px) rotate3d(0, 1, 0, 15deg); }
        }
        @keyframes float-warning {
          0%, 100% { transform: translateY(0px) rotateZ(-3deg); }
          50% { transform: translateY(-8px) rotateZ(3deg); }
        }
        @keyframes float-error {
          0%, 100% { transform: translateY(0px) scale(1) skewX(0deg); }
          40% { transform: translateY(-5px) scale(1.02) skewX(2deg); }
          60% { transform: translateY(2px) scale(0.98) skewX(-2deg); }
        }
      `}</style>
        </div>
    );
};
