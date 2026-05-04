'use client';
import { useRef, useEffect } from 'react';

export default function ConfettiCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const pieces = Array.from({ length: 80 }, () => ({
      x:     canvas.width / 2 + (Math.random() - 0.5) * 200,
      y:     canvas.height / 2,
      vx:    (Math.random() - 0.5) * 8,
      vy:    -6 - Math.random() * 6,
      r:     3 + Math.random() * 5,
      color: ['#8B5CF6','#22C55E','#F59E0B','#38BDF8','#F87171','#A855F7'][Math.floor(Math.random() * 6)],
      rot:   Math.random() * Math.PI * 2,
      vr:    (Math.random() - 0.5) * 0.3,
      life:  1,
    }));

    let running = true;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pieces) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.2;
        p.vx *= 0.99; p.rot += p.vr; p.life -= 0.012;
        if (p.life <= 0) continue;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 2);
        ctx.restore();
      }
      if (running) requestAnimationFrame(draw);
    };
    draw();
    return () => { running = false; };
  }, []);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 3,
      }}
    />
  );
}
