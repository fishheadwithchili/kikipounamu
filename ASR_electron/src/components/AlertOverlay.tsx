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
            animation: 'animate-float-error'
        },
        warning: {
            icon: <AlertCircle size={36} />,
            color: '#f97316',
            bgColor: 'rgba(249, 115, 22, 0.2)',
            defaultTitle: 'System Overload',
            defaultDesc: 'Slow down interaction.',
            animation: 'animate-float-warning'
        },
        info: {
            icon: <Info size={36} />,
            color: '#3b82f6',
            bgColor: 'rgba(59, 130, 246, 0.2)',
            defaultTitle: 'Calibrated',
            defaultDesc: 'Sensitivity adjusted.',
            animation: 'animate-float-info'
        }
    }[type]), [type]);

    return (
        <div
            className="animate-fade-in"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 150,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                willChange: 'opacity',
                transform: 'translateZ(0)',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                userSelect: 'none',
            }}
            role="dialog"
            aria-modal="true"
        >
            <div
                className="animate-zoom-in"
                style={{
                    position: 'relative',
                    willChange: 'transform, opacity',
                    backfaceVisibility: 'hidden',
                    width: '100%',
                    maxWidth: '384px',
                    margin: '0 16px',
                    padding: '2px',
                    borderRadius: '24px',
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.1), transparent)',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
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
                    <div
                        className={config.animation}
                        style={{
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
                        onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.filter = 'brightness(1.1)'}
                        onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.style.filter = 'brightness(1)'}
                    >
                        Understood
                    </HydroButton>
                </div>
            </div>
        </div>
    );
};
