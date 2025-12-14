import React from 'react';
import ReactDOM from 'react-dom';
import { HydroButton } from './HydroButton';
import { X, Github, Copy, Check } from 'lucide-react';
import { Logo3D } from './Logo3D';

interface AboutModalProps {
    onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
    const [copied, setCopied] = React.useState(false);
    const repoUrl = 'https://github.com/fishheadwithchili/kikipounamu.git';

    const handleCopy = () => {
        navigator.clipboard.writeText(repoUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999, // Very high z-index to ensure it's on top of everything
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            willChange: 'opacity',
            transform: 'translateZ(0)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.1s ease-out'
        }} role="dialog" aria-label="About Kikipounamu">
            <div style={{
                position: 'relative',
                willChange: 'transform, opacity',
                backfaceVisibility: 'hidden',
                backgroundColor: 'rgba(17, 24, 39, 0.8)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                width: '100%',
                maxWidth: '400px',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden',
                animation: 'zoomIn 0.1s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center'
            }}>
                {/* Decorative Top Glow */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '4px',
                    background: 'linear-gradient(to right, #3b82f6, #a855f7, #ec4899)',
                    opacity: 0.8
                }}></div>

                {/* Close Button */}
                <div style={{
                    position: 'absolute',
                    top: '16px',
                    right: '16px',
                    zIndex: 10
                }}>
                    <HydroButton
                        onClick={onClose}
                        aria-label="Close"
                        style={{
                            padding: '6px',
                            borderRadius: '50%',
                            color: 'rgba(255, 255, 255, 0.5)',
                            backgroundColor: 'transparent',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                            e.currentTarget.style.color = 'white';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.5)';
                        }}
                    >
                        <X size={20} />
                    </HydroButton>
                </div>

                {/* Content */}
                <div style={{ padding: '40px 32px 32px 32px', width: '100%', boxSizing: 'border-box' }}>

                    {/* Logo Area */}
                    <div style={{
                        marginBottom: '24px',
                        display: 'flex',
                        justifyContent: 'center'
                    }}>
                        {/* We use a static div here to host the Logo3D but disable its internal click if needed, 
                            or just reuse the component. Since Logo3D now accepts onClick, we can pass no-op. */}
                        <Logo3D onClick={() => { }} size={128} />
                    </div>

                    <h2 style={{
                        fontSize: '24px',
                        fontWeight: 700,
                        color: 'white',
                        margin: '0 0 8px 0',
                        letterSpacing: '-0.02em'
                    }}>
                        Kikipounamu
                    </h2>

                    <div style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        color: '#60a5fa',
                        fontSize: '12px',
                        fontWeight: 600,
                        marginBottom: '24px'
                    }}>
                        v1.0.0
                    </div>

                    <p style={{
                        fontSize: '14px',
                        color: 'rgba(255, 255, 255, 0.6)',
                        lineHeight: '1.6',
                        marginBottom: '32px'
                    }}>
                        A powerful, local-first ASR application designed for privacy and performance.
                    </p>

                    {/* GitHub Section */}
                    <div style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.2)',
                        borderRadius: '16px',
                        padding: '16px',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            marginBottom: '12px',
                            color: 'rgba(255, 255, 255, 0.8)',
                            fontSize: '14px',
                            fontWeight: 500
                        }}>
                            <Github size={16} />
                            <span>GitHub Repository</span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <HydroButton
                                onClick={handleCopy}
                                style={{
                                    flex: 1,
                                    padding: '10px',
                                    borderRadius: '12px',
                                    backgroundColor: copied ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                                    border: copied ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
                                    color: copied ? '#4ade80' : 'white',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copied' : 'Copy Link'}
                            </HydroButton>
                        </div>
                    </div>
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
            `}</style>
        </div>,
        document.body
    );
};
