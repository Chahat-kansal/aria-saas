'use client';
import { useEffect, useRef, useState } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onDismiss: () => void;
  /** SECURITY-CRITICAL-2 — errors that report a failed money-movement call must stay on screen
   * until a staff member actively dismisses them; a 3s auto-timeout is how these failures were
   * going unnoticed in practice even after being surfaced. */
  persistent?: boolean;
}

export default function Toast({ message, type = 'success', onDismiss, persistent = false }: ToastProps) {
  useEffect(() => {
    if (persistent) return;
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss, persistent]);

  const colors = {
    success: { border: 'rgba(34,197,94,0.3)', text: '#22C55E' },
    error:   { border: 'rgba(239,68,68,0.3)',  text: '#EF4444' },
    info:    { border: 'rgba(0,229,255,0.2)',   text: '#00E5FF' },
  };
  const c = colors[type];

  return (
    <div className="an-bouncy-toast" style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: 'var(--bg-base)', border: `1px solid ${c.border}`,
      borderLeft: `3px solid ${c.text}`, borderRadius: 10,
      padding: '12px 16px', maxWidth: 320,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: 'Manrope, system-ui, sans-serif',
    }}>
      {/* AN-C spell 13 bouncy-toast: pop+spring entrance for all confirmation toasts */}
      <style>{`
        @keyframes anBouncyToastIn{0%{opacity:0;transform:translateY(28px) scale(.9)}55%{opacity:1;transform:translateY(-6px) scale(1.04)}80%{transform:translateY(2px) scale(.99)}100%{transform:translateY(0) scale(1)}}
        .an-bouncy-toast{animation:anBouncyToastIn .55s cubic-bezier(.34,1.56,.64,1) both}
        @media (prefers-reduced-motion: reduce){.an-bouncy-toast{animation:none!important}}
      `}</style>
      <span style={{ fontSize: 16 }}>
        {type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
      </span>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1, lineHeight: 1.4 }}>{message}</span>
      <button onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16, padding: 0 }}>
        ✕
      </button>
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<Array<{id: string; message: string; type: 'success'|'error'|'info'; persistent?: boolean}>>([]);
  const idCounter = useRef(0);

  // persistent defaults to (type === 'error') so callers reporting a failed money-movement call
  // don't have to remember to opt in — see Toast's doc comment above.
  const showToast = (message: string, type: 'success'|'error'|'info' = 'success', persistent?: boolean) => {
    const id = `${Date.now()}-${idCounter.current++}`;
    setToasts(prev => [...prev, { id, message, type, persistent: persistent ?? type === 'error' }]);
  };

  const dismissToast = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  const ToastContainer = () => (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => <Toast key={t.id} message={t.message} type={t.type} persistent={t.persistent} onDismiss={() => dismissToast(t.id)} />)}
    </div>
  );

  return { showToast, ToastContainer };
}
