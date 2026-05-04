'use client';
import { useState, useEffect, useRef } from 'react';

interface CartItem { name: string; qty: number; price: number; }
interface DisplayState {
  status: 'idle' | 'active' | 'complete';
  business_name?: string; cart?: CartItem[];
  subtotal_cents?: number; discount_cents?: number; tax_cents?: number; total_cents?: number;
  customer_name?: string | null; change_cents?: number; loyalty_earned?: number;
  timestamp?: number; total?: number; complete_message?: string | null;
}

const POLL_MS              = 500;
const COMPLETE_DURATION_MS = 4000;
const SLIDE_INTERVAL_MS    = 6000;

const PROMO_SLIDES = [
  { emoji: '⭐', text: 'Earn loyalty points with every purchase' },
  { emoji: '💳', text: 'We accept cash and card' },
  { emoji: '🙏', text: 'Thank you for shopping with us' },
];

function formatCents(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time}</span>;
}

function Orb({ style }: { style: React.CSSProperties }) {
  return <div style={{ position: 'absolute', borderRadius: '50%', pointerEvents: 'none', ...style }} />;
}

export default function CustomerDisplayPage() {
  const [state, setDisplayState] = useState<DisplayState>({ status: 'idle' });
  const [slideIdx, setSlideIdx]  = useState(0);
  const [completeVisible, setCompleteVisible] = useState(false);
  const [flashVisible, setFlashVisible]       = useState(false);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('aria_pos_display_state');
        if (!raw) return;
        const parsed: DisplayState = JSON.parse(raw);
        setDisplayState(prev => { if (parsed.timestamp === prev.timestamp) return prev; return parsed; });
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (state.status === 'complete') {
      setFlashVisible(true);
      setTimeout(() => setFlashVisible(false), 200);
      setCompleteVisible(true);
      if (completeTimer.current) clearTimeout(completeTimer.current);
      completeTimer.current = setTimeout(() => {
        setCompleteVisible(false);
        setDisplayState({ status: 'idle' });
      }, COMPLETE_DURATION_MS);
    }
    return () => { if (completeTimer.current) clearTimeout(completeTimer.current); };
  }, [state.status, state.timestamp]);

  useEffect(() => {
    const t = setInterval(() => setSlideIdx(i => (i + 1) % PROMO_SLIDES.length), SLIDE_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const businessName = state.business_name ?? 'AriaPOS';

  /* ── COMPLETE ─────────────────────────────────────────────────── */
  if (state.status === 'complete' && completeVisible) {
    const change  = state.change_cents ?? 0;
    const loyalty = state.loyalty_earned ?? 0;
    return (
      <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, position: 'relative', overflow: 'hidden' }}>
        {/* White flash overlay */}
        {flashVisible && <div style={{ position: 'fixed', inset: 0, background: '#fff', opacity: 0.15, pointerEvents: 'none', zIndex: 100 }} />}

        {/* Success ring */}
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '2px solid #22C55E', opacity: 0, animation: 'paid-ring 0.7s ease-out forwards', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />

        <Orb style={{ width: 500, height: 500, top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'radial-gradient(circle,rgba(34,197,94,0.12),transparent 70%)', filter: 'blur(60px)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: 80, fontWeight: 700, color: '#22C55E', animation: 'scale-in 0.5s cubic-bezier(0.16,1,0.3,1)', lineHeight: 1, marginBottom: 24 }}>✓</div>
          <h1 style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 52, color: '#EDE8FF', marginBottom: 16, lineHeight: 1.1 }}>
            {state.customer_name ? `Thanks, ${state.customer_name.split(' ')[0]}!` : 'Thank you!'}
          </h1>
          {change > 0 && (
            <div style={{ marginTop: 20, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '20px 48px', display: 'inline-block' }}>
              <p style={{ fontSize: 14, color: '#8B85A8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>CHANGE A$</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 48, fontWeight: 800, color: '#EDE8FF' }}>{formatCents(change).replace('A$','')}</p>
            </div>
          )}
          {loyalty > 0 && (
            <p style={{ marginTop: 24, fontSize: 18, color: '#8B5CF6', fontWeight: 500 }}>✨ You earned {loyalty} loyalty points!</p>
          )}
          <p style={{ marginTop: 32, fontSize: 13, color: '#4A4565' }}>{businessName}</p>
        </div>
      </div>
    );
  }

  /* ── ACTIVE SALE ──────────────────────────────────────────────── */
  const cartItems = state.cart ?? [];
  const isActive  = state.status === 'active' && cartItems.length > 0;

  if (isActive) {
    const totalCents    = state.total_cents ?? 0;
    const taxCents      = state.tax_cents ?? 0;
    const discountCents = state.discount_cents ?? 0;
    const exclGst       = totalCents - taxCents;

    return (
      <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif" }}>
        <Orb style={{ width: 400, height: 400, top: '-100px', right: '-100px', background: 'radial-gradient(circle,rgba(139,92,246,0.12),transparent 70%)', filter: 'blur(80px)', animation: 'orb-breathe 5s ease-in-out infinite' }} />

        {/* Top bar */}
        <div style={{ flexShrink: 0, padding: '14px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,6,12,0.9)', borderBottom: '1px solid #1C1928' }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#EDE8FF' }}>{businessName}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {state.customer_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 24, padding: '6px 16px' }}>
                <span style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 16, color: '#EDE8FF' }}>Welcome back, {state.customer_name}! ✨</span>
              </div>
            )}
            <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#4A4565' }}><Clock /></p>
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '24px 40px', position: 'relative', zIndex: 1 }}>
          <div style={{ maxWidth: 800, margin: '0 auto' }}>
            {cartItems.map((item, i) => (
              <div key={i} className="pos-float-in" style={{ padding: '18px 0', borderBottom: '1px solid #1C1928', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', animationDelay: `${i * 50}ms` }}>
                <p style={{ fontSize: 22, fontWeight: 600, color: '#EDE8FF' }}>{item.name}</p>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: '#EDE8FF' }}>A${(item.price * item.qty).toFixed(2)}</p>
                  <p style={{ fontSize: 13, color: '#8B85A8' }}>{item.qty} × A${item.price.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div style={{ flexShrink: 0, background: 'rgba(255,255,255,0.02)', borderTop: '1px solid #2A2540', padding: '20px 40px' }}>
          <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', gap: 32 }}>
                <span style={{ fontSize: 14, color: '#8B85A8', width: 80 }}>Subtotal</span>
                <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono',monospace", color: '#8B85A8' }}>A${(exclGst / 100).toFixed(2)}</span>
              </div>
              {discountCents > 0 && (
                <div style={{ display: 'flex', gap: 32 }}>
                  <span style={{ fontSize: 14, color: '#22C55E', width: 80 }}>Discount</span>
                  <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono',monospace", color: '#22C55E' }}>−A${(discountCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', gap: 32 }}>
                <span style={{ fontSize: 14, color: '#4A4565', width: 80 }}>GST (10%)</span>
                <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono',monospace", color: '#4A4565' }}>A${(taxCents / 100).toFixed(2)}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: 13, color: '#8B85A8', marginBottom: 4 }}>Total</p>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 64, fontWeight: 800, color: '#EDE8FF', lineHeight: 1 }}>
                A${(totalCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#4A4565', padding: '8px 0' }}>Powered by AriaPOS</p>
      </div>
    );
  }

  /* ── IDLE ─────────────────────────────────────────────────────── */
  const slide = PROMO_SLIDES[slideIdx];
  return (
    <div style={{ minHeight: '100dvh', background: '#0A0910', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', fontFamily: "'Manrope',system-ui,sans-serif" }}>
      <Orb style={{ width: 500, height: 500, top: '-150px', left: '-100px', background: 'radial-gradient(circle,rgba(139,92,246,0.15),transparent 70%)', filter: 'blur(120px)', animation: 'orb-pulse-0 4s ease-in-out infinite' }} />
      <Orb style={{ width: 400, height: 400, top: '40%', left: '30%', background: 'radial-gradient(circle,rgba(99,102,241,0.2),transparent 70%)', filter: 'blur(100px)', animation: 'orb-pulse-1 5s ease-in-out infinite 1s' }} />
      <Orb style={{ width: 600, height: 600, bottom: '-200px', right: '-150px', background: 'radial-gradient(circle,rgba(139,92,246,0.1),transparent 70%)', filter: 'blur(150px)', animation: 'orb-pulse-2 6s ease-in-out infinite 2s' }} />
      <Orb style={{ width: 350, height: 350, top: '-50px', right: '10%', background: 'radial-gradient(circle,rgba(168,85,247,0.08),transparent 70%)', filter: 'blur(80px)' }} />

      {/* Top: business + time */}
      <div style={{ flexShrink: 0, padding: '16px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(8,6,12,0.6)', borderBottom: '1px solid rgba(255,255,255,0.04)', position: 'relative', zIndex: 1 }}>
        <p style={{ fontSize: 16, fontWeight: 600, color: '#EDE8FF' }}>{businessName}</p>
        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#4A4565' }}><Clock /></p>
      </div>

      {/* Centre */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40, position: 'relative', zIndex: 1 }}>
        {/* Logo + name */}
        <div className="pos-idle-float">
          <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
            <path d="M16 2L28 9v14L16 30 4 23V9z" fill="rgba(139,92,246,0.2)" stroke="#8B5CF6" strokeWidth="1.5"/>
            <path d="M16 8l7 4v8l-7 4-7-4V12z" fill="rgba(139,92,246,0.3)" stroke="#8B5CF6" strokeWidth="1"/>
            <circle cx="16" cy="16" r="3" fill="#8B5CF6"/>
          </svg>
        </div>
        <p style={{ fontFamily: "'Instrument Serif',serif", fontStyle: 'italic', fontSize: 72, color: '#EDE8FF', marginTop: 24, lineHeight: 1 }}>aria</p>
        <p style={{ fontSize: 16, color: '#8B85A8', marginTop: 8 }}>{businessName}</p>

        <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#4A4565', marginTop: 32 }}><Clock /></p>

        {/* Promo slide */}
        <div style={{ marginTop: 48, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '24px 48px', maxWidth: 480, transition: 'opacity 0.5s ease' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>{slide.emoji}</p>
          <p style={{ fontSize: 18, color: 'rgba(237,232,255,0.7)', fontWeight: 500, lineHeight: 1.4 }}>{slide.text}</p>
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {PROMO_SLIDES.map((_, i) => (
            <div key={i} style={{ width: i === slideIdx ? 20 : 8, height: 8, borderRadius: 4, background: i === slideIdx ? '#8B5CF6' : 'rgba(255,255,255,0.12)', transition: 'all 0.3s ease' }} />
          ))}
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: '#4A4565', padding: '10px 0', position: 'relative', zIndex: 1 }}>AriaPOS Customer Display</p>
    </div>
  );
}
