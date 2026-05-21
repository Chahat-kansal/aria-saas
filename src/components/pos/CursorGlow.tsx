'use client';
import { useEffect, useRef } from 'react';

export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const checkTheme = () => {
      const theme = document.documentElement.getAttribute('data-theme');
      el.style.display = theme === 'light' ? 'none' : 'block';
    };
    checkTheme();
    const themeObserver = new MutationObserver(checkTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let raf = 0;
    let cx = 0, cy = 0;
    const onMove = (e: MouseEvent) => {
      cx = e.clientX; cy = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.transform = 'translate(' + (cx - 160) + 'px,' + (cy - 160) + 'px)';
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
      themeObserver.disconnect();
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
        background: 'radial-gradient(circle, rgba(0,106,255,0.04) 0%, transparent 70%)',
        opacity: 0,
        transition: 'opacity 300ms',
        willChange: 'transform',
      }}
    />
  );
}
