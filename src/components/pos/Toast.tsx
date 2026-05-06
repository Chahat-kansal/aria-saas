'use client';
import { useEffect, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
}

export default function Toast({ message, type = 'success', onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colors = {
    success: { border: 'rgba(34,197,94,0.3)', text: '#22C55E' },
    error:   { border: 'rgba(239,68,68,0.3)',  text: '#EF4444' },
    info:    { border: 'rgba(0,229,255,0.2)',   text: '#00E5FF' },
  };
  const c = colors[type];

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: '#0A0E1E', border: `1px solid ${c.border}`,
      borderLeft: `3px solid ${c.text}`, borderRadius: 10,
      padding: '12px 16px', maxWidth: 320,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'Manrope, system-ui, sans-serif',
    }}>
      <span style={{ fontSize: 16 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      <span style={{ fontSize: 13, color: '#EDE8FF', flex: 1, lineHeight: 1.4 }}>{message}</span>
      <button onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: '#6B7E99', cursor: 'pointer', fontSize: 16, padding: 0 }}>
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{id: number; message: string; type: 'success'|'error'|'info'}>>([]);

  const showToast = (message: string, type: 'success'|'error'|'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const ToastContainer = () => (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} onDismiss={() => dismissToast(t.id)} />)}
    </div>
  );

  return { showToast, ToastContainer };
}
