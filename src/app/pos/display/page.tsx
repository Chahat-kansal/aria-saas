'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import ConfettiCanvas from '@/components/pos/ConfettiCanvas';
import LogoMark from '@/components/pos/LogoMark';
import { CAT_META, fmt } from '@/lib/pos-utils';
import { SaleCelebration } from '@/components/customer-display/SaleCelebration';
import { pickCelebrationAnimation } from '@/lib/customer-display/pick-animation';

interface CartItem {
  id?: string | number;
  name: string;
  cat?: string;
  category?: string;
  price?: number;
  price_cents?: number;
  quantity?: number;
  qty?: number;
}

interface DisplayState {
  status: 'idle' | 'active' | 'complete';
  business_name?: string;
  items?: CartItem[];
  // legacy keys
  cart?: Array<{ name: string; qty: number; price: number }>;
  subtotal_cents?: number;
  discount_cents?: number;
  tax_cents?: number;
  total_cents?: number;
  total?: number;
  customer_name?: string | null;
  loyalty_points?: number;
  change_cents?: number;
  loyalty_earned?: number;
  timestamp?: number;
}

export default function CustomerDisplayPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef  = useRef<number | null>(null);
  const phaseRef  = useRef<'idle' | 'order' | 'paid'>('idle');

  const [phase, setPhase]   = useState<'idle' | 'order' | 'paid'>('idle');
  const [state, setState]   = useState<DisplayState>({ status: 'idle' });
  const [celebration, setCelebration] = useState<{
    visible: boolean; animationType: Parameters<typeof SaleCelebration>[0]['animationType'];
    customerName?: string; total: number; pointsEarned: number;
  } | null>(null);
  const [time, setTime]     = useState(
    new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
  );

  // Aria customer greeting
  const [greeting, setGreeting]               = useState<string | null>(null);
  const [activeSuggestion, setActiveSuggestion] = useState<{ offer_text: string; discount_pct: number } | null>(null);
  const [greetingLoading, setGreetingLoading] = useState(false);
  const [greetingCustomer, setGreetingCustomer] = useState<{
    name: string; visit_count?: number; total_spent?: number;
    is_known: boolean; is_lapsed?: boolean;
  } | null>(null);
  const lastGreetedName = useRef<string | null>(null);
  const greetTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchGreeting = useCallback(async (name: string, businessId: string) => {
    setGreetingLoading(true);
    try {
      const res = await fetch('/api/pos/customer-greet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerName: name, businessId }),
      });
      const data = await res.json();
      setGreeting(data.greeting ?? null);
      setGreetingCustomer(data.customer ?? null);
    } catch {
      setGreeting(null);
    } finally {
      setGreetingLoading(false);
    }
  }, []);

  // Keep phaseRef in sync (canvas draw loop reads it without re-creating the loop)
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Poll localStorage
  useEffect(() => {
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem('aria_display_state')
          ?? localStorage.getItem('aria_pos_display_state');
        if (!raw) return;
        const s: DisplayState = JSON.parse(raw);
        setState(prev => s.timestamp === prev.timestamp ? prev : s);
        if (s.status === 'complete') setPhase('paid');
        else if (s.status === 'active' && (s.items?.length ?? (s.cart?.length ?? 0)) > 0) setPhase('order');
        else setPhase('idle');
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(poll);
  }, []);

  // Clock
  useEffect(() => {
    const id = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => clearInterval(id);
  }, []);

  // Auto-reset paid → idle after 5 s
  useEffect(() => {
    if (phase !== 'paid') return;
    const t = setTimeout(() => setPhase('idle'), 5000);
    return () => clearTimeout(t);
  }, [phase]);

  // Trigger Aria greeting when a customer name appears in display state
  useEffect(() => {
    const name = state.customer_name ?? null;
    if (!name) {
      setGreeting(null);
      setGreetingCustomer(null);
      lastGreetedName.current = null;
      clearTimeout(greetTimeoutRef.current);
      return;
    }
    if (name === lastGreetedName.current) return;
    lastGreetedName.current = name;
    clearTimeout(greetTimeoutRef.current);
    const businessId = typeof window !== 'undefined'
      ? (localStorage.getItem('aria_active_business_id') ?? '')
      : '';
    if (!businessId) return;
    greetTimeoutRef.current = setTimeout(() => fetchGreeting(name, businessId), 400);
  }, [state.customer_name, fetchGreeting]);

  // BroadcastChannel — receives sale_completed from terminal with cart items
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel('aria-pos-display');
    bc.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; items?: { name: string; category: string; price: number; quantity: number }[]; customer_name?: string; total?: number; points_earned?: number };
      if (d?.type === 'display_suggestion') { const sd = d as any; setActiveSuggestion({ offer_text: sd.offer_text, discount_pct: sd.discount_pct }); setTimeout(() => setActiveSuggestion(null), 60000); return; }
      if (d?.type !== 'sale_completed') return;
      const items = d.items ?? [];
      const animationType = pickCelebrationAnimation(
        items.map(i => ({ product: { name: i.name, category: i.category }, qty: i.quantity, unitPrice: i.price }))
      );
      setActiveSuggestion(null);
      setCelebration({ visible: true, animationType, customerName: d.customer_name, total: d.total ?? 0, pointsEarned: d.points_earned ?? 0 });
    };
    return () => bc.close();
  }, []);

  // ── CANVAS ANIMATION ENGINE ─────────────────────────────────────────
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

    // Floating particles
    const pts = Array.from({ length: 80 }, () => ({
      x:     Math.random() * 1400,
      y:     Math.random() * 900,
      vx:    (Math.random() - 0.5) * 0.4,
      vy:    (Math.random() - 0.5) * 0.4,
      r:     1 + Math.random() * 2.5,
      hue:   240 + Math.random() * 80,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.7,
    }));

    const draw = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;

      // Deep space background
      const bg = ctx.createRadialGradient(W * 0.5, H * 0.5, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.8);
      bg.addColorStop(0, 'rgba(14,10,28,1)');
      bg.addColorStop(1, 'rgba(4,3,10,1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Aurora ribbons
      const auroraColors = [
        { h: 260, s: 80, l: 55 },
        { h: 200, s: 90, l: 60 },
        { h: 300, s: 70, l: 50 },
        { h: 180, s: 85, l: 55 },
      ];
      for (let i = 0; i < 4; i++) {
        const col   = auroraColors[i];
        const amp   = 60 + i * 20;
        const freq  = 0.004 + i * 0.002;
        const speed = 0.3 + i * 0.15;
        const yBase = H * (0.2 + i * 0.18);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const y = yBase
            + Math.sin(x * freq + t * speed + i) * amp
            + Math.sin(x * freq * 2.3 + t * speed * 1.7 + i * 2) * amp * 0.4;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `hsla(${col.h},${col.s}%,${col.l}%,${0.12 + i * 0.03})`;
        ctx.lineWidth = 2 + i;
        ctx.stroke();
        const grad = ctx.createLinearGradient(0, yBase - amp, 0, yBase + amp);
        grad.addColorStop(0, `hsla(${col.h},${col.s}%,${col.l}%,0)`);
        grad.addColorStop(0.5, `hsla(${col.h},${col.s}%,${col.l}%,${0.08 + i * 0.02})`);
        grad.addColorStop(1, `hsla(${col.h},${col.s}%,${col.l}%,0)`);
        ctx.save();
        ctx.globalAlpha = 0.03 + i * 0.01;
        ctx.fillStyle = grad;
        ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Nebula blobs
      for (let i = 0; i < 3; i++) {
        const bx = W * (0.2 + i * 0.3) + Math.sin(t * 0.2 + i * 2) * 60;
        const by = H * (0.3 + i * 0.2) + Math.cos(t * 0.15 + i) * 40;
        const nb = ctx.createRadialGradient(bx, by, 0, bx, by, W * 0.28);
        const hues = [260, 200, 290];
        nb.addColorStop(0, `hsla(${hues[i]},80%,60%,0.05)`);
        nb.addColorStop(0.5, `hsla(${hues[i]},70%,50%,0.03)`);
        nb.addColorStop(1, 'transparent');
        ctx.fillStyle = nb;
        ctx.fillRect(0, 0, W, H);
      }

      // Star field — 120 twinkling stars
      for (let s = 0; s < 120; s++) {
        const sx = ((s * 137.5 + t * 0.05) % W + W) % W;
        const sy = (s * 97.3) % H;
        const al = 0.2 + 0.3 * Math.sin(t * (0.5 + s * 0.03) + s);
        const r  = 0.5 + (s % 3) * 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,190,255,${al})`;
        ctx.fill();
      }

      // Floating particles with glow
      for (const pt of pts) {
        pt.x += pt.vx;
        pt.y += pt.vy + Math.sin(t * pt.speed + pt.phase) * 0.15;
        if (pt.x < -20) pt.x = W + 20;
        if (pt.x > W + 20) pt.x = -20;
        if (pt.y < -20) pt.y = H + 20;
        if (pt.y > H + 20) pt.y = -20;
        const al = 0.3 + 0.3 * Math.sin(t * pt.speed + pt.phase);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${pt.hue},80%,70%,${al})`;
        ctx.fill();
        const grd = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, pt.r * 4);
        grd.addColorStop(0, `hsla(${pt.hue},80%,70%,0.12)`);
        grd.addColorStop(1, 'transparent');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Perspective grid
      ctx.save();
      ctx.globalAlpha = 0.025;
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 1;
      const gS = 60;
      for (let x = 0; x < W; x += gS) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += gS) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();

      // Paid burst rings
      if (phaseRef.current === 'paid') {
        for (let ring = 0; ring < 4; ring++) {
          const ringT = (t * 0.8 + ring * 0.4) % 3;
          const ringR = ringT * Math.min(W, H) * 0.5;
          const ringA = Math.max(0, 0.3 - ringT * 0.1);
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, ringR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34,197,94,${ringA})`;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      t += 0.016;
      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, []); // run once — phaseRef keeps it updated without restarting

  // Normalise items from both legacy and new format
  const rawItems: CartItem[] = state.items
    ?? (state.cart ?? []).map(c => ({ name: c.name, price: c.price, quantity: c.qty }));

  const total        = state.total_cents ? state.total_cents / 100 : (state.total ?? 0);
  const change       = state.change_cents ? state.change_cents / 100 : null;
  const loyaltyEarned = state.loyalty_earned ?? 0;
  const customerName  = state.customer_name;
  const bizName       = state.business_name ?? 'AriaPOS';

  return (
    <div style={{
      width: '100%', height: '100%',
      position: 'relative', overflow: 'hidden',
      fontFamily: "'Manrope', system-ui, sans-serif",
      background: '#050308',
    }}>
      {/* Canvas background */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* Logo */}
      <div style={{ position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center', gap: 9, zIndex: 2 }}>
        <LogoMark size={28} />
        <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(237,232,255,0.7)', letterSpacing: '-0.03em', fontFamily: "'Manrope', sans-serif" }}>
          aria<span style={{ fontSize: 10, color: '#8B5CF6', marginLeft: 2, letterSpacing: '0.06em' }}>POS</span>
        </span>
      </div>

      {/* Time */}
      <div style={{ position: 'absolute', top: 22, right: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'rgba(139,133,168,0.35)', zIndex: 2 }}>
        {time}
      </div>

      {/* ── IDLE ─────────────────────────────────────────────────── */}
      {phase === 'idle' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, zIndex: 2 }}>
          <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 44, fontStyle: 'italic', color: 'rgba(237,232,255,0.12)', letterSpacing: '-0.02em', textAlign: 'center', lineHeight: 1.1, animation: 'idle-float 4s ease-in-out infinite' }}>
            Welcome
          </div>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(139,92,246,0.15)', animation: 'orb-breathe 3s ease-in-out infinite' }}>
            <LogoMark size={38} />
          </div>
          <div style={{ fontSize: 13, color: 'rgba(139,133,168,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Ready for your order
          </div>
          <div style={{ fontSize: 15, color: 'rgba(237,232,255,0.4)', fontWeight: 600, marginTop: 8 }}>
            {bizName}
          </div>
        </div>
      )}

      {/* ── ORDER ────────────────────────────────────────────────── */}
      {phase === 'order' && rawItems.length > 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 2, padding: 32 }}>
          {/* Aria customer greeting */}
          {greetingLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(29,158,117,0.2)', border: '1px solid rgba(29,158,117,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#1D9E75' }}>A</div>
              <span style={{ fontSize: 12, color: 'rgba(29,158,117,0.6)', letterSpacing: '0.05em', animation: 'aria-pulse 1.4s ease-in-out infinite' }}>Aria is saying hi…</span>
            </div>
          )}
          {greeting && !greetingLoading && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, maxWidth: 420, animation: 'aria-greet-in 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(29,158,117,0.2)', border: '1px solid rgba(29,158,117,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#1D9E75', flexShrink: 0, marginTop: 2 }}>A</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 9, color: 'rgba(29,158,117,0.6)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Aria</span>
                <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, fontStyle: 'italic', color: 'rgba(237,232,255,0.9)', lineHeight: 1.4, margin: 0 }}>
                  {greeting}
                </p>
                {greetingCustomer?.is_known && (greetingCustomer.visit_count ?? 0) > 1 && (
                  <span style={{ fontSize: 10, color: 'rgba(139,133,168,0.45)', marginTop: 2 }}>
                    Visit #{greetingCustomer.visit_count}
                    {greetingCustomer.total_spent
                      ? ` · $${(greetingCustomer.total_spent as number).toLocaleString('en-AU')} lifetime`
                      : ''}
                  </span>
                )}
              </div>
            </div>
          )}
          {!greeting && !greetingLoading && customerName && (
            <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, fontStyle: 'italic', color: '#8B5CF6' }}>
              Hey {customerName.split(' ')[0]}
            </div>
          )}
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, fontStyle: 'italic', color: 'rgba(139,133,168,0.5)', letterSpacing: '-0.01em' }}>
            Your order
          </div>
          {activeSuggestion && (
            <div style={{ maxWidth: 420, width: '100%', background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.35)', borderRadius: 16, padding: '14px 20px', marginTop: 4 }}>
              <p style={{ fontSize: 9, color: 'rgba(127,184,151,0.6)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>Today only for you</p>
              <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontStyle: 'italic', color: 'rgba(237,232,255,0.95)', margin: 0, lineHeight: 1.4 }}>{activeSuggestion.offer_text}</p>
              <p style={{ fontSize: 11, color: 'rgba(127,184,151,0.6)', margin: '4px 0 0' }}>{activeSuggestion.discount_pct}% off</p>
            </div>
          )}

          {/* Glass order card */}
          <div style={{ width: '100%', maxWidth: 420, background: 'rgba(20,17,32,0.7)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 22, padding: '16px 20px', backdropFilter: 'blur(30px)', boxShadow: '0 20px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', animation: 'slide-up 0.4s cubic-bezier(0.16,1,0.3,1)' }}>
            {rawItems.slice(0, 6).map((item, i) => {
              const cat   = (item.cat || item.category || 'other').toLowerCase();
              const colA  = CAT_META[cat]?.a ?? CAT_META.other.a;
              const price = item.price ?? (item.price_cents ? item.price_cents / 100 : 0);
              const qty   = item.quantity ?? item.qty ?? 1;
              return (
                <div key={item.id ?? i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < Math.min(rawItems.length, 6) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', animation: "fade-up 0.3s " + (i * 60) + "ms cubic-bezier(0.16,1,0.3,1) both" }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: colA, boxShadow: "0 0 8px " + (colA) }} />
                    <span style={{ fontSize: 14, color: 'rgba(237,232,255,0.85)', fontWeight: 500 }}>{item.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>×{qty}</span>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, color: 'rgba(237,232,255,0.85)' }}>
                    {fmt(price * qty)}
                  </span>
                </div>
              );
            })}
            {rawItems.length > 6 && (
              <div style={{ fontSize: 11, color: 'rgba(139,133,168,0.3)', textAlign: 'center', paddingTop: 8 }}>
                +{rawItems.length - 6} more
              </div>
            )}
          </div>

          {/* Total */}
          <div style={{ textAlign: 'center', animation: 'fade-up 0.4s 0.2s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ fontSize: 11, color: 'rgba(139,133,168,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Total</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'clamp(48px, 8vw, 80px)', fontWeight: 800, color: 'rgba(237,232,255,0.95)', letterSpacing: '-0.05em', lineHeight: 1, textShadow: '0 0 40px rgba(139,92,246,0.3)' }}>
              {fmt(total)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(139,133,168,0.3)', marginTop: 4 }}>GST included · AUD</div>
          </div>
        </div>
      )}

      {/* ── PAID ─────────────────────────────────────────────────── */}
      {phase === 'paid' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, zIndex: 2 }}>
          {/* Check with pulsing rings */}
          <div style={{ position: 'relative', width: 140, height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ position: 'absolute', width: 80 + i * 30, height: 80 + i * 30, borderRadius: '50%', border: "1.5px solid rgba(34,197,94," + (0.5 - i * 0.15) + ")", animation: "paid-ring 1.5s " + (i * 0.3) + "s ease-out infinite" }} />
            ))}
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(34,197,94,0.3)', animation: 'scale-in 0.5s cubic-bezier(0.16,1,0.3,1)', position: 'relative', zIndex: 1 }}>
              <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <div style={{ textAlign: 'center', animation: 'fade-up 0.4s 0.15s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div style={{ fontSize: 'clamp(36px, 6vw, 52px)', fontWeight: 800, color: 'rgba(237,232,255,0.95)', letterSpacing: '-0.04em', lineHeight: 1 }}>Thank you!</div>
            <div style={{ fontSize: 15, color: 'rgba(34,197,94,0.7)', marginTop: 8, fontWeight: 600 }}>Payment approved</div>
            {change !== null && change > 0 && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 'clamp(20px, 3vw, 32px)', fontWeight: 800, color: '#22C55E', marginTop: 12, animation: 'fade-up 0.4s 0.3s both' }}>
                Change: {fmt(change)}
              </div>
            )}
            {loyaltyEarned > 0 && (
              <div style={{ fontSize: 15, color: 'rgba(139,92,246,0.7)', marginTop: 8, animation: 'fade-up 0.4s 0.45s both' }}>
                +{loyaltyEarned} loyalty points earned ✨
              </div>
            )}
          </div>

          <ConfettiCanvas />
        </div>
      )}

      {/* Bottom status bar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(transparent, rgba(4,3,10,0.8))', zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 6px #22C55E', display: 'inline-block' }} />
          <span style={{ fontSize: 10, color: 'rgba(139,133,168,0.3)', letterSpacing: '0.06em' }}>ARIA POS · SECURE TRANSACTION</span>
        </div>
        <span style={{ fontSize: 10, color: 'rgba(139,133,168,0.2)' }}>Prices incl. GST · AUD</span>
      </div>

      {/* Sale celebration overlay — additive */}
      {celebration?.visible && (
        <SaleCelebration
          visible={celebration.visible}
          animationType={celebration.animationType}
          customerName={celebration.customerName}
          total={celebration.total}
          pointsEarned={celebration.pointsEarned}
          onComplete={() => setCelebration(null)}
        />
      )}
    </div>
  );
}
