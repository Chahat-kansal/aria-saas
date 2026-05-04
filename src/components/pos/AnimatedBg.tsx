'use client';
import { useEffect, useRef } from 'react';

interface Dot { x: number; y: number; baseOpacity: number; opacity: number; size: number; }

export default function AnimatedBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: -9999, y: -9999 });
  const dots  = useRef<Dot[]>([]);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const SPACING = 32;
    const RADIUS  = 120;

    function build() {
      if (!canvas) return;
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      dots.current  = [];
      const cols = Math.ceil(canvas.width  / SPACING) + 1;
      const rows = Math.ceil(canvas.height / SPACING) + 1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          dots.current.push({
            x: c * SPACING,
            y: r * SPACING,
            baseOpacity: 0.08,
            opacity: 0.08,
            size: 1.5,
          });
        }
      }
    }

    function draw() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mx = mouse.current.x;
      const my = mouse.current.y;
      for (const d of dots.current) {
        const dist = Math.hypot(d.x - mx, d.y - my);
        const inf  = Math.max(0, 1 - dist / RADIUS);
        d.opacity  = d.baseOpacity + inf * 0.55;
        const size = d.size + inf * 2.5;
        ctx.beginPath();
        ctx.arc(d.x, d.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(139,92,246,${d.opacity.toFixed(3)})`;
        ctx.fill();
      }
      rafId.current = requestAnimationFrame(draw);
    }

    build();
    draw();

    const onMove = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => { mouse.current = { x: -9999, y: -9999 }; };
    const onResize = () => { build(); };

    window.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
