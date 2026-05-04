'use client';
import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface FlyToCartHandle {
  fly: (fromRect: DOMRect, toRect: DOMRect) => void;
}

const FlyToCart = forwardRef<FlyToCartHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useImperativeHandle(ref, () => ({
    fly(fromRect: DOMRect, toRect: DOMRect) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;

      const sx = fromRect.left + fromRect.width  / 2;
      const sy = fromRect.top  + fromRect.height / 2;
      const ex = toRect.left   + toRect.width    / 2;
      const ey = toRect.top    + toRect.height   / 2;

      // Control point — arc upward
      const cx = (sx + ex) / 2;
      const cy = Math.min(sy, ey) - 120;

      let t = 0;
      const ORB_R = 8;

      function step() {
        if (!ctx || !canvas) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        t += 0.04;
        if (t > 1) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }

        // Quadratic bezier
        const mt = 1 - t;
        const x  = mt * mt * sx + 2 * mt * t * cx + t * t * ex;
        const y  = mt * mt * sy + 2 * mt * t * cy + t * t * ey;

        // Trail
        const grad = ctx.createRadialGradient(x, y, 0, x, y, ORB_R * 2.5);
        grad.addColorStop(0,   'rgba(139,92,246,0.9)');
        grad.addColorStop(0.4, 'rgba(139,92,246,0.4)');
        grad.addColorStop(1,   'rgba(139,92,246,0)');
        ctx.beginPath();
        ctx.arc(x, y, ORB_R * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Core orb
        ctx.beginPath();
        ctx.arc(x, y, ORB_R, 0, Math.PI * 2);
        ctx.fillStyle = '#8B5CF6';
        ctx.fill();

        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        zIndex: 8888,
      }}
    />
  );
});

FlyToCart.displayName = 'FlyToCart';
export default FlyToCart;
