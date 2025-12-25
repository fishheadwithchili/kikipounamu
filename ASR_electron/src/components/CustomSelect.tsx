import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    icon?: React.ReactNode;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    onChange,
    options,
    placeholder = 'Select an option',
    icon
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'relative',
                width: '100%',
                fontFamily: 'Inter, sans-serif'
            }}
        >
            {/* Trigger Button */}
            <div
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    backgroundColor: isOpen ? 'rgba(59, 130, 246, 0.15)' : 'rgba(59, 130, 246, 0.1)',
                    border: isOpen ? '1px solid rgba(96, 165, 250, 0.5)' : '1px solid rgba(96, 165, 250, 0.3)',
                    borderRadius: '12px',
                    padding: '12px 16px',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                    boxShadow: isOpen
                        ? '0 0 25px rgba(59, 130, 246, 0.25)'
                        : '0 0 15px rgba(59, 130, 246, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    userSelect: 'none'
                }}
                onMouseEnter={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.5)';
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)';
                    }
                }}
                onMouseLeave={e => {
                    if (!isOpen) {
                        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.3)';
                        e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                    }
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                    {icon && <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>{icon}</span>}
                    <span style={{
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: selectedOption ? 'white' : 'rgba(255, 255, 255, 0.5)'
                    }}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>

                <ChevronDown
                    size={16}
                    style={{
                        color: isOpen ? '#60a5fa' : 'rgba(255, 255, 255, 0.5)',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.3s ease',
                        flexShrink: 0
                    }}
                />
            </div>

            {/* Dropdown Menu */}
            <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                left: 0,
                right: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.95)', // Solid dark background for readability
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '12px',
                padding: '6px',
                zIndex: 1000,
                boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.4)',
                opacity: isOpen ? 1 : 0,
                transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(-10px) scale(0.98)',
                pointerEvents: isOpen ? 'auto' : 'none',
                visibility: isOpen ? 'visible' : 'hidden',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                maxHeight: '260px',
                overflowY: 'auto'
            }} className="custom-scrollbar">
                {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                        <div
                            key={option.value}
                            onClick={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                            style={{
                                padding: '10px 12px',
                                margin: '2px 0',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: isSelected ? 'white' : 'rgba(255, 255, 255, 0.7)',
                                backgroundColor: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                fontSize: '14px',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                                    e.currentTarget.style.color = 'white';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                                }
                            }}
                        >
                            <span style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '90%'
                            }}>
                                {option.label}
                            </span>
                            {isSelected && <Check size={14} color="#60a5fa" />}
                        </div>
                    );
                })}

                {options.length === 0 && (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.3)', fontSize: '13px' }}>
                        No options available
                    </div>
                )}
            </div>
        </div>
    );
};
