'use client';
import { useState, ReactNode } from 'react';

interface Props {
  children:   ReactNode;
  onClick?:   () => void;
  color?:     string;
  textColor?: string;
  disabled?:  boolean;
  loading?:   boolean;
  fullWidth?: boolean;
  height?:    number;
  fontSize?:  number;
  style?:     React.CSSProperties;
}

export default function Press3DButton({
  children, onClick,
  color     = '#8B5CF6',
  textColor = '#fff',
  disabled  = false,
  loading   = false,
  fullWidth = false,
  height    = 48,
  fontSize  = 14,
  style     = {},
}: Props) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onMouseDown={() => !disabled && setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      onTouchStart={() => !disabled && setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onClick={!disabled && !loading ? onClick : undefined}
      style={{
        background:   color,
        color:        textColor,
        border:       'none',
        borderRadius: 12,
        height,
        width:        fullWidth ? '100%' : 'auto',
        padding:      '0 20px',
        cursor:       disabled ? 'not-allowed' : 'pointer',
        fontFamily:   'var(--font-ui)',
        fontWeight:   700,
        fontSize,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        gap:          8,
        position:     'relative',
        overflow:     'hidden',
        transform:    pressed ? 'translateY(2px) scale(0.98)' : 'translateY(0) scale(1)',
        boxShadow:    pressed
          ? `0 1px 0 ${color}88, 0 2px 8px ${color}66`
          : `0 4px 0 ${color}66, 0 6px 20px ${color}33`,
        transition: 'all 100ms cubic-bezier(0.16,1,0.3,1)',
        opacity:    disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {!disabled && !loading && (
        <div style={{
          position:   'absolute',
          top:        0,
          width:      '40%',
          height:     '100%',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
          animation:  'btn-shine 2s ease-in-out infinite 1s',
          pointerEvents: 'none',
        }} />
      )}
      {loading ? (
        <>
          <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'processing 0.7s linear infinite' }} />
          Processing...
        </>
      ) : children}
    </button>
  );
}
