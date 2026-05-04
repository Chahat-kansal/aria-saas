'use client';
import { useState, useEffect, useRef } from 'react';

interface DisplayItem { name: string; quantity: number; price_cents: number; modifiers?: string | null; }
interface DisplayState {
  status: 'idle' | 'active' | 'complete';
  business_name?: string;
  items?: DisplayItem[];
  subtotal_cents?: number; discount_cents?: number; tax_cents?: number; total_cents?: number;
  customer_name?: string | null; loyalty_points?: number;
  change_cents?: number; loyalty_earned?: number; timestamp?: number;
  // Legacy support
  cart?: Array<{ name: string; qty: number; price: number }>;
  total?: number;
}

const POLL_MS    = 500;
const COMPLETE_MS = 4500;
const SLIDE_MS   = 6000;

const PROMO_SLIDES = [
  { emoji: '⭐', text: 'Earn loyalty points with every purchase' },
  { emoji: '💳', text: 'We accept cash and all major cards' },
  { emoji: '🙏', text: 'Thank you for shopping with us' },
];

function cents(n: number | undefined) { return n ? (n / 100).toFixed(2) : '0.00'; }

function Clock() {
  const [t, setT] = useState('');
  useEffect(() => {
    const up = () => setT(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    up(); const id = setInterval(up, 1000); return () => clearInterval(id);
  }, []);
  return <span>{t}</span>;
}

function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }} />;
}

function LogoMark({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(139,92,246,0.15)" stroke="#8B5CF6" strokeWidth="1.5"/>
      <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(139,92,246,0.25)" stroke="#8B5CF6" strokeWidth="1"/>
      <circle cx="16" cy="16" r="2.5" fill="#8B5CF6"/>
    </svg>
  );
}

export default function CustomerDisplayPage() {
  const [state, setState]     = useState<DisplayState>({ status: 'idle' });
  const [slideIdx, setSlideIdx] = useState(0);
  const [completeVisible, setCompleteVisible] = useState(false);
  const [flash, setFlash]     = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      try {
        const raw = localStorage.getItem('aria_display_state') ?? localStorage.getItem('aria_pos_display_state');
        if (!raw) return;
        const p: DisplayState = JSON.parse(raw);
        setState(prev => p.timestamp === prev.timestamp ? prev : p);
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (state.status === 'complete') {
      setFlash(true); setTimeout(() => setFlash(false), 250);
      setCompleteVisible(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        setCompleteVisible(false);
        setState({ status: 'idle', business_name: state.business_name });
      }, COMPLETE_MS);
    }
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [state.status, state.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setSlideIdx(i => (i + 1) % PROMO_SLIDES.length), SLIDE_MS);
    return () => clearInterval(id);
  }, []);

  const bizName = state.business_name ?? 'AriaPOS';

  /* ── normalise legacy cart ─────────────────────────────────────── */
  const items: DisplayItem[] = state.items ?? (state.cart ?? []).map(c => ({
    name: c.name, quantity: c.qty, price_cents: Math.round(c.price * 100),
  }));
  const totalCents = state.total_cents ?? Math.round((state.total ?? 0) * 100);
  const taxCents   = state.tax_cents ?? 0;
  const discCents  = state.discount_cents ?? 0;
  const exclGst    = totalCents - taxCents;

  const TEAL = '#8B5CF6';
  const BG   = '#0A0910';
  const TEXT  = '#E8F4F8';
  const TEXT2 = '#7A9BB5';

  /* ── COMPLETE ─────────────────────────────────────────────────── */
  if (state.status === 'complete' && completeVisible) {
    const change  = state.change_cents ?? 0;
    const loyalty = state.loyalty_earned ?? 0;
    return (
      <div style={{ width: '100vw', height: '100vh', background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, position: 'relative', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif" }}>
        {flash && <div style={{ position: 'fixed', inset: 0, background: '#fff', opacity: 0.12, pointerEvents: 'none', zIndex: 100 }} />}
        <Orb style={{ width: 300, height: 300, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.4)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', animation: 'pos-paid-ring 0.8s ease-out forwards', pointerEvents: 'none', position: 'absolute' }} />
        <Orb style={{ width: 300, height: 300, borderRadius: '50%', border: '2px solid rgba(16,185,129,0.3)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', animation: 'pos-paid-ring 0.8s ease-out 0.2s forwards', position: 'absolute' }} />
        <Orb style={{ width: 600, height: 600, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle,rgba(16,185,129,0.08),transparent 70%)', filter: 'blur(60px)', position: 'absolute' }} />

        <div style={{ position: 'relative', zIndex: 2 }}>
          <div className="pos-scale-in" style={{ fontSize: 'clamp(80px,14vw,120px)', lineHeight: 1, color: '#10B981', marginBottom: 24, fontWeight: 700, animationDelay: '0.2s' }}>✓</div>
          <h1 className="pos-slide-up" style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 'clamp(36px,5vw,64px)', color: TEXT, marginBottom: 16, animationDelay: '0.4s' }}>
            {state.customer_name ? `Thanks, ${state.customer_name.split(' ')[0]}!` : 'Thank you!'}
          </h1>
          {change > 0 && (
            <div className="pos-slide-up" style={{ marginTop: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '20px 48px', display: 'inline-block', animationDelay: '0.6s' }}>
              <p style={{ fontSize: 14, color: TEXT2, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono',monospace" }}>CHANGE</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, color: '#10B981' }}>A${(change / 100).toFixed(2)}</p>
            </div>
          )}
          {loyalty > 0 && (
            <p className="pos-slide-up" style={{ marginTop: 20, fontSize: 18, color: TEAL, fontWeight: 500, animationDelay: '0.8s' }}>✨ You earned {loyalty} loyalty points!</p>
          )}
          <p style={{ marginTop: 32, fontSize: 13, color: 'rgba(122,155,181,0.3)' }}>Powered by Aria</p>
        </div>
      </div>
    );
  }

  /* ── ACTIVE ──────────────────────────────────────────────────── */
  const isActive = state.status === 'active' && items.length > 0;
  if (isActive) {
    return (
      <div style={{ width: '100vw', height: '100vh', background: BG, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif" }}>
        <Orb style={{ width: 350, height: 350, top: '-80px', right: '-80px', background: `radial-gradient(circle,rgba(139,92,246,0.1),transparent 70%)`, filter: 'blur(80px)', animation: 'pos-orb-breathe 5s ease-in-out infinite' }} />

        {/* Top bar */}
        <div style={{ flexShrink: 0, height: 48, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,12,16,0.9)', borderBottom: '1px solid #1A2535' }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'rgba(232,244,248,0.6)', fontFamily: "'Manrope',sans-serif" }}>{bizName}</p>
          <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'rgba(122,155,181,0.4)' }}><Clock /></p>
        </div>

        {/* Customer greeting */}
        {state.customer_name && (
          <div style={{ flexShrink: 0, padding: '12px 32px', background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.12)' }}>
            <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 'clamp(16px,2vw,22px)', color: TEAL }}>Welcome back, {state.customer_name}! ✨</p>
            {(state.loyalty_points ?? 0) > 0 && <p style={{ fontSize: 13, color: 'rgba(139,92,246,0.7)', marginTop: 2 }}>{state.loyalty_points} loyalty points available</p>}
          </div>
        )}

        {/* Items */}
        <div style={{ flex: 1, overflow: 'auto', padding: '0 32px' }}>
          {items.map((item, i) => (
            <div key={i} className="pos-float-in" style={{ padding: '18px 0', borderBottom: '1px solid #1A2535', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animationDelay: `${i * 40}ms` }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ fontSize: 'clamp(16px,2vw,24px)', fontWeight: 600, color: TEXT }}>{item.name}</p>
                  {item.quantity > 1 && <span style={{ background: 'rgba(139,92,246,0.1)', borderRadius: 6, padding: '2px 7px', fontSize: 13, color: TEAL, fontFamily: "'JetBrains Mono',monospace" }}>×{item.quantity}</span>}
                </div>
                {item.modifiers && <p style={{ fontSize: 13, color: TEXT2, fontStyle: 'italic', marginTop: 3 }}>{item.modifiers}</p>}
              </div>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(16px,2vw,24px)', fontWeight: 700, color: TEXT }}>A${cents(item.price_cents * item.quantity)}</p>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div style={{ flexShrink: 0, background: 'rgba(8,12,16,0.95)', borderTop: '2px solid #243347', padding: '16px 32px', backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: TEXT2, width: 80 }}>Subtotal</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: TEXT2 }}>A${cents(exclGst)}</span>
              </div>
              {discCents > 0 && (
                <div style={{ display: 'flex', gap: 24 }}>
                  <span style={{ fontSize: 14, color: '#10B981', width: 80 }}>Discount</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#10B981' }}>−A${cents(discCents)}</span>
                </div>
              )}
              {taxCents > 0 && (
                <div style={{ display: 'flex', gap: 24 }}>
                  <span style={{ fontSize: 14, color: 'rgba(122,155,181,0.5)', width: 80 }}>GST (10%)</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: 'rgba(122,155,181,0.5)' }}>A${cents(taxCents)}</span>
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: "'Manrope',sans-serif", fontSize: 11, fontWeight: 800, color: 'rgba(122,155,181,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>TOTAL</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 'clamp(40px,6vw,72px)', fontWeight: 800, color: TEXT, lineHeight: 1, letterSpacing: '-0.02em' }}>A${cents(totalCents)}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── IDLE ────────────────────────────────────────────────────── */
  const slide = PROMO_SLIDES[slideIdx];
  return (
    <div style={{ width: '100vw', height: '100vh', background: BG, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <Orb style={{ width: 500, height: 500, top: '-150px', left: '-150px', background: `radial-gradient(circle,rgba(139,92,246,0.12),transparent 70%)`, filter: 'blur(120px)', animation: 'pos-orb-breathe 4s ease-in-out infinite' }} />
      <Orb style={{ width: 400, height: 400, top: '35%', left: '30%', background: `radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%)`, filter: 'blur(100px)', animation: 'pos-orb-breathe 5s ease-in-out infinite 1s' }} />
      <Orb style={{ width: 600, height: 600, bottom: '-200px', right: '-150px', background: `radial-gradient(circle,rgba(139,92,246,0.08),transparent 70%)`, filter: 'blur(150px)', animation: 'pos-orb-breathe 6s ease-in-out infinite 2s' }} />
      <Orb style={{ width: 300, height: 300, top: '-50px', right: '10%', background: `radial-gradient(circle,rgba(139,92,246,0.06),transparent 70%)`, filter: 'blur(80px)' }} />

      {/* Top bar */}
      <div style={{ flexShrink: 0, padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,12,16,0.5)', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 1 }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'rgba(232,244,248,0.5)' }}>{bizName}</p>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: 'rgba(122,155,181,0.3)' }}><Clock /></p>
      </div>

      {/* Centre */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, position: 'relative', zIndex: 1 }}>
        <div className="pos-idle-float">
          <LogoMark size={64} />
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 'clamp(36px,6vw,80px)', color: TEXT, marginTop: 24, lineHeight: 1, letterSpacing: '-0.02em' }}>
          {bizName}
        </h1>
        <p style={{ fontSize: 16, color: 'rgba(122,155,181,0.6)', marginTop: 10 }}>Welcome</p>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: 'rgba(122,155,181,0.35)', marginTop: 32 }}><Clock /></p>

        {/* Promo slide */}
        <div style={{ marginTop: 48, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '24px 48px', maxWidth: 500, width: '100%', transition: 'opacity 0.5s ease' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>{slide.emoji}</p>
          <p style={{ fontSize: 18, color: 'rgba(232,244,248,0.7)', fontWeight: 500, lineHeight: 1.5 }}>{slide.text}</p>
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {PROMO_SLIDES.map((_, i) => (
            <div key={i} style={{ height: 8, borderRadius: 4, background: i === slideIdx ? TEAL : 'rgba(255,255,255,0.12)', width: i === slideIdx ? 20 : 8, transition: 'all 0.3s ease' }} />
          ))}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(122,155,181,0.15)', padding: '10px 0', position: 'relative', zIndex: 1 }}>Powered by Aria</p>
    </div>
  );
}
