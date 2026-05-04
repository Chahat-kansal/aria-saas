'use client';
import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      el.style.left = e.clientX + 'px';
      el.style.top  = e.clientY + 'px';
      el.style.opacity = '1';
    };
    const onLeave = () => { el.style.opacity = '0'; };
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: 9999,
        width: 320,
        height: 320,
        borderRadius: '50%',
        transform: 'translate(-50%,-50%)',
        background: 'radial-gradient(circle, rgba(139,92,246,0.07) 0%, transparent 70%)',
        opacity: 0,
        transition: 'opacity 300ms',
      }}
    />
  );
}
