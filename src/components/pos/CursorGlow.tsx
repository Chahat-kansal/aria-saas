'use client';
import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let cx = 0, cy = 0;
    // Use RAF to batch style updates — prevents layout thrashing on every mousemove
    const onMove = (e: MouseEvent) => {
      cx = e.clientX; cy = e.clientY;
      if (raf) return; // skip if frame already queued
      raf = requestAnimationFrame(() => {
        el.style.transform = `translate(${cx - 160}px,${cy - 160}px)`;
        el.style.opacity = '1';
        raf = 0;
      });
    };
    const onLeave = () => { el.style.opacity = '0'; };
    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
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
        top: 0, left: 0,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
        opacity: 0,
        transition: 'opacity 300ms',
        willChange: 'transform',
      }}
    />
  );
}
