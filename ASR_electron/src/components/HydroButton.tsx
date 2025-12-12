import React, { useState, useCallback, useRef } from 'react';

const ANIMATION_TIMING = {
    FAST: 50,   // ms for impact
    SLOW: 500,  // ms for release
};

interface HydroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    className?: string;
}

/**
 * HydroButton Component
 * 
 * A specialized button that simulates fluid physics when pressed.
 * It calculates the mouse position relative to the button center
 * to apply a 3D tilt effect towards the finger/cursor.
 */
export const HydroButton = React.memo(({
    children,
    className = '',
    onClick,
    disabled,
    style,
    ...props
}: HydroButtonProps) => {
    const [transformStyle, setTransformStyle] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled) return;
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Calculate distance from center to determine tilt angle
        const x = e.clientX - rect.left - centerX;
        const y = e.clientY - rect.top - centerY;

        // Max tilt set to 12 degrees for visible but subtle effect
        const rotateX = -1 * ((y / centerY) * 12);
        const rotateY = (x / centerX) * 12;

        setTransformStyle({
            // Fast transition (0.05s) for immediate "impact" feel
            transition: `transform ${ANIMATION_TIMING.FAST}ms ease-out`,
            transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(0.96) translateY(4px)`,
        });
    }, [disabled]);

    const handleMouseUp = useCallback(() => {
        setTransformStyle({
            // Slower, elastic bezier curve for "buoyant" release feel
            transition: `transform ${ANIMATION_TIMING.SLOW}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
            transform: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1) translateY(0)',
        });
    }, []);

    const baseStyle: React.CSSProperties = {
        transitionProperty: 'box-shadow',
        transitionDuration: '300ms',
        border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
        ...transformStyle,
    };

    return (
        <button
            ref={buttonRef}
            className={className}
            style={baseStyle}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={onClick}
            disabled={disabled}
            {...props}
        >
            {children}
        </button>
    );
});

HydroButton.displayName = 'HydroButton';
