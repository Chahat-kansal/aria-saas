'use client';

/**
 * VerifyCore — Aria's verification motion language. v2.
 *
 * Canvas-rendered 3D orbital verification. No external deps.
 *
 * v2 changes:
 *  - ALL geometry derives from a scale factor k, so the composition is
 *    identical at any container size (v1 used fixed px tuned for a fullscreen
 *    canvas, which read as sparse and undersized in a small box).
 *  - Dust field sizes to the container, so atmosphere fills the frame.
 *  - Optional label layer with the letter-by-letter success reveal.
 *  - FIX: focus no longer tears down the render loop and wipes typed digits.
 *  - FIX: pointer tilt is clamped, so small canvases don't over-rotate.
 *
 * The canvas is aria-hidden; a real <input autoComplete="one-time-code">
 * sits on top so autofill, keyboard and screen readers keep working.
 *
 * MOUNTING: needs a dark surface (trails wipe with `surface`) and room to
 * breathe — 420px+ of height is where it starts to feel cinematic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type VerifyStatus = 'idle' | 'verifying' | 'success' | 'error';

export interface VerifyCoreProps {
  length?: number;
  onComplete?: (code: string) => void;
  status?: VerifyStatus;
  onSuccessAnimationEnd?: () => void;
  /** Accent hex. Defaults to Aria sage. */
  accent?: string;
  /** Background the trails wipe against. MUST match the surface behind it. */
  surface?: string;
  /** Stage height in px or any CSS length. 420+ recommended. */
  height?: number | string;
  showLabels?: boolean;
  eyebrow?: string;
  idleLabel?: string;
  verifyingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
  className?: string;
}

type Phase = 'input' | 'orbit' | 'collapse' | 'core' | 'seal' | 'reject';

interface Vec { x: number; y: number; z: number }
interface Cell {
  d: string; lit: number; alpha: number;
  p: Vec; t: Vec; v: Vec;
  sc: number; tsc: number; vs: number;
}
interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  r: number; life: number; suck: boolean; red: boolean;
}
interface Shock { t: number; sp: number; r0: number; grow: number; o: Vec; flat: boolean }
interface Wave { t: number; max: number }
interface Dust { a: number; r: number; y: number; sp: number; sz: number }

const ERROR_HEX = '#E24B4A';
const GOLD_RGB = '201,163,122';
const TILT = 1.06;
/** Geometry is authored against a 420px-tall stage and scaled from there. */
const REF_H = 420;

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function VerifyCore({
  length = 4,
  onComplete,
  status = 'idle',
  onSuccessAnimationEnd,
  accent = '#7FB897',
  surface = '#070C0A',
  height = 420,
  showLabels = true,
  eyebrow = 'Aria \u00b7 verification core',
  idleLabel = 'Enter the 4-digit code we sent you',
  verifyingLabel = 'Checking your code\u2026',
  successLabel = 'Verified successfully',
  errorLabel = 'That code didn\u2019t match. Try again.',
  className,
}: VerifyCoreProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusedRef = useRef(false);
  const [code, setCode] = useState('');
  const [revealed, setRevealed] = useState(0);

  const accentRgb = useMemo(() => hexToRgb(accent), [accent]);
  const errorRgb = useMemo(() => hexToRgb(ERROR_HEX), []);
  const wipe = useMemo(() => `rgba(${hexToRgb(surface)},0.30)`, [surface]);

  const S = useRef({
    phase: 'input' as Phase,
    cells: [] as Cell[],
    parts: [] as Particle[],
    shocks: [] as Shock[],
    waves: [] as Wave[],
    dust: [] as Dust[],
    orbA: -Math.PI / 2, orbSpd: 0,
    ringOn: 0, ringB: 0, pulseA: null as number | null, linkOn: 0,
    coreR: 0, coreGlow: 0, check: 0, seal: 0,
    mx: 0, my: 0, tmx: 0, tmy: 0, spin: 0,
    red: 0,
    accentRgb, errorRgb, wipe, length,
    reduce: false,
    W: 0, H: 0, CX: 0, CY: 0,
    k: 1,
    orbR: 118,
  });
  S.current.accentRgb = accentRgb;
  S.current.errorRgb = errorRgb;
  S.current.wipe = wipe;

  /** Row position for cell i, at the current scale. */
  const rowX = useCallback((i: number) => {
    const s = S.current;
    return (i - (s.length - 1) / 2) * 82 * s.k;
  }, []);

  const seedCells = useCallback(() => {
    const s = S.current;
    s.cells = Array.from({ length }, (_, i) => ({
      d: '', lit: 0, alpha: 1,
      p: { x: rowX(i), y: 0, z: 0 },
      t: { x: rowX(i), y: 0, z: 0 },
      v: { x: 0, y: 0, z: 0 },
      sc: 1, tsc: 1, vs: 0,
    }));
  }, [length, rowX]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const s = S.current;
    s.length = length;
    s.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const seedDust = () => {
      const spread = Math.max(s.W, s.H) * 0.55;
      s.dust = Array.from({ length: 80 }, () => ({
        a: Math.random() * 6.284,
        r: 90 * s.k + Math.random() * spread,
        y: (Math.random() - 0.5) * s.H * 1.1,
        sp: 0.0006 + Math.random() * 0.0016,
        sz: Math.random() * 1.4 + 0.3,
      }));
    };

    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = cv.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      s.W = rect.width; s.H = rect.height;
      cv.width = Math.round(rect.width * dpr);
      cv.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      s.CX = rect.width / 2;
      s.CY = rect.height / 2;

      // master scale — fit the whole composition to the stage
      const kh = rect.height / REF_H;
      const kw = rect.width / (108 * length + 120);
      s.k = clamp(Math.min(kh, kw), 0.5, 2.2);
      s.orbR = 118 * s.k;

      if (s.phase === 'input') {
        s.cells.forEach((c, i) => { c.t = { x: rowX(i), y: 0, z: 0 }; });
      }
      seedDust();
    };

    seedCells();
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const onMove = (e: PointerEvent) => {
      if (s.reduce) return;
      const rect = cv.getBoundingClientRect();
      s.tmx = clamp((e.clientX - rect.left) / rect.width - 0.5, -0.55, 0.55);
      s.tmy = clamp((e.clientY - rect.top) / rect.height - 0.5, -0.55, 0.55);
    };
    window.addEventListener('pointermove', onMove);

    const rotX = (p: Vec, t: number): Vec => ({
      x: p.x, y: p.y * Math.cos(t) - p.z * Math.sin(t), z: p.y * Math.sin(t) + p.z * Math.cos(t),
    });
    const rotY = (p: Vec, t: number): Vec => ({
      x: p.x * Math.cos(t) + p.z * Math.sin(t), y: p.y, z: -p.x * Math.sin(t) + p.z * Math.cos(t),
    });
    const view = (p: Vec) => {
      const f = 560 * s.k;
      const a = rotX(rotY(p, s.spin + s.mx * 0.9), s.my * 0.7);
      const sc = f / (f + a.z);
      return { x: s.CX + a.x * sc, y: s.CY + a.y * sc, s: sc, z: a.z };
    };
    const ringPt = (a: number, r: number, tilt: number, yaw: number): Vec =>
      rotY(rotX({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 }, tilt), yaw);

    const rrect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };
    const glowDot = (x: number, y: number, r: number, a: number, col: string) => {
      if (r <= 0) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${col},${a})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 6.284); ctx.fill();
      ctx.restore();
    };
    const drawRing = (r: number, tilt: number, yaw: number, alpha: number, col: string) => {
      ctx.beginPath();
      for (let i = 0; i <= 88; i++) {
        const q = view(ringPt((i / 88) * 6.284, r, tilt, yaw));
        if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      }
      ctx.strokeStyle = `rgba(${col},${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden || !s.W) { last = now; return; }
      const dt = Math.min(40, now - last) / 16.7;
      last = now;

      const k = s.k;
      const G = s.red > 0 ? s.errorRgb : s.accentRgb;
      s.mx += (s.tmx - s.mx) * 0.06;
      s.my += (s.tmy - s.my) * 0.06;
      s.spin += 0.0016 * dt;
      if (s.red > 0) s.red = Math.max(0, s.red - 0.012 * dt);

      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = s.wipe;
      ctx.fillRect(0, 0, s.W, s.H);

      for (const d of s.dust) {
        d.a += d.sp * dt;
        const q = view({ x: Math.cos(d.a) * d.r, y: d.y, z: Math.sin(d.a) * d.r });
        ctx.fillStyle = `rgba(${G},${0.08 + 0.12 * q.s})`;
        ctx.fillRect(q.x, q.y, d.sz * q.s, d.sz * q.s);
      }

      if (s.ringOn > 0) {
        drawRing(s.orbR, TILT, 0, 0.3 * s.ringOn, G);
        if (s.ringB > 0) drawRing(s.orbR * 0.98, TILT, 1.02, 0.18 * s.ringB, GOLD_RGB);
        drawRing(s.orbR * 1.32, TILT, 0, 0.07 * s.ringOn, G);
      }

      if (s.phase === 'orbit') {
        s.orbA += s.orbSpd * dt;
        s.cells.forEach((c, i) => {
          c.t = ringPt(s.orbA + (i * 6.284) / s.length, s.orbR, TILT, 0);
          c.tsc = 1;
        });
        if (s.pulseA !== null) {
          s.pulseA += s.orbSpd * 3.1 * dt;
          const q = view(ringPt(s.pulseA, s.orbR, TILT, 0));
          glowDot(q.x, q.y, 26 * k * q.s, 0.7, G);
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath(); ctx.arc(q.x, q.y, 2.6 * k * q.s, 0, 6.284); ctx.fill();
        }
      }

      for (const c of s.cells) {
        (['x', 'y', 'z'] as const).forEach((ax) => {
          c.v[ax] = (c.v[ax] + (c.t[ax] - c.p[ax]) * 0.15) * 0.78;
          c.p[ax] += c.v[ax];
        });
        c.vs = (c.vs + (c.tsc - c.sc) * 0.15) * 0.78;
        c.sc += c.vs;
      }

      if (s.linkOn > 0) {
        ctx.beginPath();
        s.cells.forEach((c, i) => {
          const q = view(c.p);
          if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        });
        ctx.closePath();
        ctx.strokeStyle = `rgba(${G},${0.15 * s.linkOn})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      s.cells
        .map((c) => ({ c, q: view(c.p) }))
        .sort((a, b) => b.q.z - a.q.z)
        .forEach(({ c, q }) => {
          if (c.alpha <= 0.01) return;
          const sc = q.s * c.sc * k;
          const w = 62 * sc, h = 74 * sc;
          const a = c.alpha * (0.55 + 0.45 * q.s);
          ctx.save();
          ctx.translate(q.x, q.y);
          if (c.lit > 0) { ctx.shadowColor = `rgba(${G},0.9)`; ctx.shadowBlur = 26 * sc; }
          rrect(-w / 2, -h / 2, w, h, 16 * sc);
          ctx.fillStyle = `rgba(${c.lit ? G : '255,255,255'},${(c.lit ? 0.1 : 0.035) * a})`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${G},${(c.lit ? 0.85 : 0.22) * a})`;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = c.lit ? `rgba(${G},${a})` : `rgba(231,240,234,${a})`;
          ctx.font = `300 ${30 * sc}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(c.d, 0, 1);
          if (!c.d && focusedRef.current && s.phase === 'input') {
            ctx.fillStyle = `rgba(${G},${0.5 * a})`;
            ctx.fillRect(-9 * sc, h / 2 - 16 * sc, 18 * sc, 1.4 * sc);
          }
          ctx.restore();
        });

      s.shocks = s.shocks.filter((sh) => {
        sh.t += dt * sh.sp;
        if (sh.t >= 1) return false;
        const e = 1 - Math.pow(1 - sh.t, 3);
        ctx.beginPath();
        for (let i = 0; i <= 44; i++) {
          const p = ringPt((i / 44) * 6.284, sh.r0 + e * sh.grow, sh.flat ? TILT : 0, 0);
          const q = view({ x: p.x + sh.o.x, y: p.y + sh.o.y, z: p.z + sh.o.z });
          if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(${G},${(1 - sh.t) * 0.55})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        return true;
      });

      ctx.globalCompositeOperation = 'lighter';
      s.parts = s.parts.filter((p) => {
        p.life -= 0.011 * dt;
        if (p.life <= 0) return false;
        if (p.suck) {
          const d = Math.hypot(p.x, p.y, p.z) || 1;
          const pull = 0.05 * dt * k;
          p.vx += (-p.x / d) * pull * 6 + (-p.y / d) * pull * 2.4;
          p.vy += (-p.y / d) * pull * 6 + (p.x / d) * pull * 2.4;
          p.vz += (-p.z / d) * pull * 6;
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vx *= 0.985; p.vy *= 0.985; p.vz *= 0.985;
        const q = view(p);
        ctx.fillStyle = `rgba(${p.red ? s.errorRgb : s.accentRgb},${Math.min(1, p.life) * 0.9})`;
        ctx.beginPath();
        ctx.arc(q.x, q.y, Math.max(0.4, p.r * k * q.s), 0, 6.284);
        ctx.fill();
        return true;
      });
      ctx.globalCompositeOperation = 'source-over';

      if (s.coreGlow > 0) {
        glowDot(s.CX, s.CY, 70 * k * s.coreGlow, 0.3 * s.coreGlow, G);
        glowDot(s.CX, s.CY, 22 * k * s.coreGlow, 0.75 * s.coreGlow, G);
        ctx.fillStyle = `rgba(${G},${0.95 * s.coreGlow})`;
        ctx.beginPath(); ctx.arc(s.CX, s.CY, Math.max(0, s.coreR), 0, 6.284); ctx.fill();
      }

      s.waves = s.waves.filter((w) => {
        w.t += 0.022 * dt;
        if (w.t >= 1) return false;
        const e = 1 - Math.pow(1 - w.t, 3);
        ctx.beginPath();
        ctx.arc(s.CX, s.CY, (18 + e * w.max) * k, 0, 6.284);
        ctx.strokeStyle = `rgba(${G},${(1 - w.t) * 0.5})`;
        ctx.lineWidth = 1.6 * (1 - w.t) + 0.4;
        ctx.stroke();
        return true;
      });

      if (s.seal > 0) {
        ctx.save();
        ctx.translate(s.CX, s.CY);
        ctx.rotate(now / 2600);
        ctx.setLineDash([5 * k, 9 * k]);
        ctx.strokeStyle = `rgba(${G},${0.45 * s.seal})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 54 * k, 0, 6.284); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        ctx.save();
        ctx.translate(s.CX, s.CY);
        ctx.strokeStyle = `rgba(${G},${0.55 * s.seal})`;
        ctx.lineWidth = 1.4;
        rrect(-34 * k, -34 * k, 68 * k, 68 * k, 22 * k);
        ctx.stroke();
        ctx.fillStyle = `rgba(${G},${0.07 * s.seal})`;
        ctx.fill();
        ctx.restore();
      }

      if (s.check > 0) {
        const pts: [number, number][] = [[-15, 1], [-4, 13], [17, -13]];
        const total = Math.hypot(11, 12) + Math.hypot(21, 26);
        const want = total * s.check;
        ctx.save();
        ctx.translate(s.CX, s.CY);
        ctx.scale(k, k);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = `rgba(${G},0.9)`;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = `rgb(${G})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        let acc = 0;
        for (let i = 1; i < 3; i++) {
          const [x0, y0] = pts[i - 1];
          const [x1, y1] = pts[i];
          const seg = Math.hypot(x1 - x0, y1 - y0);
          if (acc + seg <= want) { ctx.lineTo(x1, y1); acc += seg; }
          else {
            const kk = (want - acc) / seg;
            ctx.lineTo(x0 + (x1 - x0) * kk, y0 + (y1 - y0) * kk);
            break;
          }
        }
        ctx.stroke();
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
    // focus is read from a ref inside the loop, so it is deliberately NOT a dep
  }, [length, seedCells, rowX]);

  useEffect(() => {
    const s = S.current;
    s.cells.forEach((c, i) => {
      const next = code[i] ?? '';
      if (next && next !== c.d) {
        c.tsc = 1.16;
        window.setTimeout(() => { c.tsc = 1; }, 130);
        s.shocks.push({ t: 0, sp: 0.028, r0: 34 * s.k, grow: 52 * s.k, o: { ...c.p }, flat: false });
      }
      c.d = next;
    });
  }, [code]);

  useEffect(() => {
    const s = S.current;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (ms: number) =>
      new Promise<void>((res) => { timers.push(window.setTimeout(res, ms)); });

    const shatter = (c: Cell, red: boolean, outward: number) => {
      for (let i = 0; i < 20; i++) {
        const ang = Math.random() * 6.284;
        const ox = Math.cos(ang) * 31 * s.k;
        const oy = Math.sin(ang) * 37 * s.k;
        s.parts.push({
          x: c.p.x + ox, y: c.p.y + oy, z: c.p.z,
          vx: ox * 0.05 * outward, vy: oy * 0.05 * outward,
          vz: (Math.random() - 0.5) * 2 * s.k,
          r: 1 + Math.random() * 1.6, life: 1 + Math.random() * 0.5,
          suck: !red, red,
        });
      }
    };

    setRevealed(0);

    const run = async () => {
      if (status === 'idle') {
        s.phase = 'input'; s.ringOn = 0; s.ringB = 0; s.linkOn = 0;
        s.pulseA = null; s.coreGlow = 0; s.coreR = 0; s.check = 0; s.seal = 0;
        s.cells.forEach((c, i) => {
          c.t = { x: rowX(i), y: 0, z: 0 }; c.tsc = 1; c.lit = 0; c.alpha = 1;
        });
        return;
      }

      if (status === 'verifying') {
        if (s.reduce) { s.ringOn = 1; return; }
        s.cells.forEach((c, i) => { c.t = { x: rowX(i) * 0.6, y: 0, z: 0 }; });
        await wait(230);
        if (cancelled) return;
        s.cells.forEach((c) => { c.tsc = 0.92; });
        await wait(120);
        if (cancelled) return;
        s.phase = 'orbit'; s.orbA = -1.5708; s.orbSpd = 0.026;
        s.ringOn = 1; s.linkOn = 1;
        timers.push(window.setTimeout(() => { s.ringB = 1; }, 260));
        await wait(700);
        while (!cancelled) {
          s.pulseA = s.orbA;
          for (let i = 0; i < s.cells.length; i++) {
            await wait(200);
            if (cancelled) return;
            s.cells[i].lit = 1;
            s.cells[i].tsc = 1.1;
            s.shocks.push({
              t: 0, sp: 0.045, r0: s.orbR, grow: 26 * s.k,
              o: { x: 0, y: 0, z: 0 }, flat: true,
            });
            timers.push(window.setTimeout(() => { s.cells[i].tsc = 0.96; }, 150));
          }
          s.pulseA = null;
          await wait(700);
          if (cancelled) return;
          s.cells.forEach((c) => { c.lit = 0; });
          await wait(300);
        }
        return;
      }

      if (status === 'success') {
        if (s.reduce) {
          s.seal = 1; s.check = 1; setRevealed(successLabel.length);
          onSuccessAnimationEnd?.();
          return;
        }
        s.phase = 'collapse';
        s.orbSpd = 0.105;
        await wait(400);
        if (cancelled) return;
        s.cells.forEach((c) => { c.t = { x: 0, y: 0, z: 0 }; c.tsc = 0.4; });
        s.linkOn = 0.5;
        await wait(210);
        if (cancelled) return;
        s.cells.forEach((c) => { shatter(c, false, 1); c.alpha = 0; });
        s.linkOn = 0; s.ringOn = 0.3;
        s.phase = 'core'; s.coreGlow = 1; s.coreR = 4 * s.k;
        const grow = window.setInterval(() => {
          s.coreR += 1.4 * s.k;
          if (s.coreR > 13 * s.k) window.clearInterval(grow);
        }, 16);
        timers.push(grow);
        await wait(400);
        if (cancelled) return;
        s.waves.push({ t: 0, max: 230 }, { t: 0, max: 150 });
        s.ringOn = 0; s.ringB = 0;
        const shrink = window.setInterval(() => {
          s.coreR -= 1.1 * s.k;
          s.coreGlow = Math.max(0.2, s.coreGlow - 0.05);
          if (s.coreR <= 1) { s.coreR = 0; window.clearInterval(shrink); }
        }, 16);
        timers.push(shrink);
        await wait(230);
        if (cancelled) return;
        s.phase = 'seal'; s.seal = 1;
        const draw = window.setInterval(() => {
          s.check = Math.min(1, s.check + 0.055);
          if (s.check >= 1) window.clearInterval(draw);
        }, 16);
        timers.push(draw);
        await wait(300);
        if (cancelled) return;
        for (let i = 1; i <= successLabel.length; i++) {
          await wait(30);
          if (cancelled) return;
          setRevealed(i);
        }
        await wait(160);
        if (!cancelled) onSuccessAnimationEnd?.();
        return;
      }

      if (status === 'error') {
        s.phase = 'reject';
        s.red = 1;
        s.pulseA = null;
        s.cells.forEach((c) => { c.lit = 1; shatter(c, true, 2.4); });
        s.waves.push({ t: 0, max: 180 });
        await wait(260);
        if (cancelled) return;
        s.phase = 'input';
        s.ringOn = 0; s.ringB = 0; s.linkOn = 0;
        s.cells.forEach((c, i) => {
          c.lit = 0;
          c.p = { x: rowX(i), y: 0, z: 60 * s.k };
          c.v = { x: 0, y: 0, z: 0 };
          c.t = { x: rowX(i), y: 0, z: 0 };
        });
        setCode('');
        inputRef.current?.focus();
      }
    };

    void run();
    return () => {
      cancelled = true;
      timers.forEach((t) => { window.clearTimeout(t); window.clearInterval(t); });
    };
  }, [status, rowX, successLabel, onSuccessAnimationEnd]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (status === 'verifying' || status === 'success') return;
    const next = e.target.value.replace(/\D/g, '').slice(0, length);
    setCode(next);
    if (next.length === length) onComplete?.(next);
  };

  const statusLine =
    status === 'verifying' ? verifyingLabel
      : status === 'error' ? errorLabel
        : status === 'success' ? ''
          : idleLabel;

  return (
    <div className={className} style={{ width: '100%' }}>
      <div style={{ position: 'relative', width: '100%', height }}>
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
          aria-hidden="true"
        />
        {showLabels && (
          <div
            style={{
              position: 'absolute', top: 18, left: 0, right: 0, textAlign: 'center',
              fontSize: 10.5, letterSpacing: '0.36em', textTransform: 'uppercase',
              color: '#7d918a', pointerEvents: 'none',
            }}
          >
            {eyebrow}
          </div>
        )}
        <label
          htmlFor="aria-verify-input"
          style={{
            position: 'absolute', left: 0, right: 0, top: '50%', height: 74,
            transform: 'translateY(-50%)', cursor: 'text',
          }}
        >
          <span
            style={{
              position: 'absolute', width: 1, height: 1, overflow: 'hidden',
              clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
            }}
          >
            Verification code
          </span>
          <input
            id="aria-verify-input"
            ref={inputRef}
            value={code}
            onChange={handleChange}
            onFocus={() => { focusedRef.current = true; }}
            onBlur={() => { focusedRef.current = false; }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={length}
            disabled={status === 'verifying' || status === 'success'}
            style={{
              width: '100%', height: '100%', background: 'transparent', border: 0,
              outline: 'none', color: 'transparent', caretColor: 'transparent',
              textAlign: 'center', fontSize: 16, letterSpacing: '3em',
            }}
          />
        </label>
      </div>

      {showLabels && (
        <div style={{ textAlign: 'center', minHeight: 58, marginTop: -8 }} aria-live="polite">
          <div
            style={{
              fontFamily: 'ui-serif, "Cormorant Garamond", Georgia, serif',
              fontSize: 27, fontWeight: 400, color: '#e7f0ea',
            }}
          >
            {successLabel.split('').map((ch, i) => (
              <span
                key={`${ch}-${i}`}
                style={{
                  display: 'inline-block',
                  opacity: i < revealed ? 1 : 0,
                  transform: i < revealed ? 'none' : 'translateY(10px)',
                  transition:
                    'opacity .5s cubic-bezier(.2,.9,.25,1), transform .5s cubic-bezier(.2,.9,.25,1)',
                }}
              >
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            ))}
          </div>
          {statusLine && (
            <div style={{ fontSize: 12, color: '#7d918a', letterSpacing: '0.09em', marginTop: 8 }}>
              {statusLine}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
