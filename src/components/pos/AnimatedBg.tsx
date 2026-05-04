'use client';
import { useRef, useEffect } from 'react';

export default function AnimatedBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const mouse = useRef({ x: -999, y: -999 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width  = canvas.offsetWidth  * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    window.addEventListener('mousemove', onMouse);

    const draw = () => {
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      // Deep background
      ctx.fillStyle = '#030510';
      ctx.fillRect(0, 0, W, H);

      // Dot grid with mouse repel
      const spacing = 38;
      const mx = mouse.current.x, my = mouse.current.y;
      for (let r = 0; r <= Math.ceil(H / spacing) + 1; r++) {
        for (let c = 0; c <= Math.ceil(W / spacing) + 1; c++) {
          const bx = c * spacing - spacing / 2;
          const by = r * spacing - spacing / 2;
          const dx = bx - mx, dy = by - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const wave = Math.sin(t * 0.9 + bx * 0.016 + by * 0.011) * 0.5 + 0.5;
          const mag  = Math.max(0, 1 - dist / 220);
          const px   = bx + (dx / (dist + 1)) * mag * -10;
          const py   = by + (dy / (dist + 1)) * mag * -10;
          const sz    = 1.1 + wave * 0.9 + mag * 2.5;
          const alpha = 0.05 + wave * 0.07 + mag * 0.3;
          ctx.beginPath();
          ctx.arc(px, py, sz, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0,229,255,${alpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      // Flowing sine wave lines
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${i % 2 === 0 ? '0,229,255' : '123,47,255'},${0.03 + i * 0.01})`;
        ctx.lineWidth = 0.8;
        for (let x = 0; x <= W; x += 4) {
          const y = H * (0.2 + i * 0.2)
            + Math.sin(x * 0.007 + t * (0.35 + i * 0.1) + i * 2) * 35
            + Math.sin(x * 0.018 + t * 0.2) * 14;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      t += 0.022;
      frameRef.current = requestAnimationFrame(draw);
    };
    frameRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMouse);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}
    />
  );
}
