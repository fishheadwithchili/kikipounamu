import React from 'react';
import { Copy, Check } from 'lucide-react';
import { HydroButton } from '../HydroButton';

interface SelectionDockProps {
    selectedCount: number;
    onCopy: () => void;
    isCopied: boolean;
}

export const SelectionDock = React.memo(({ selectedCount, onCopy, isCopied }: SelectionDockProps) => (
    <div style={{
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'rgba(17, 24, 39, 0.9)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '8px 16px',
        borderRadius: '9999px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.3s ease-out'
    }}>
        <div style={{ padding: '0 16px', fontSize: '14px', fontWeight: 600, color: 'white', borderRight: '1px solid rgba(255, 255, 255, 0.1)', marginRight: '4px' }}>
            {selectedCount} Selected
        </div>

        <HydroButton
            onClick={onCopy}
            disabled={selectedCount === 0}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100px',
                padding: '8px 16px',
                borderRadius: '9999px',
                fontSize: '14px',
                fontWeight: 500,
                transition: 'all 0.2s',
                backgroundColor: isCopied ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                color: isCopied ? '#4ade80' : 'rgba(255, 255, 255, 0.9)',
            }}
        >
            {isCopied ? <Check size={16} /> : <Copy size={16} />}
            {isCopied ? 'Copied' : 'Copy'}
        </HydroButton>


    </div>
));
