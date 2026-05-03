'use client';
import { useState, useEffect, useRef } from 'react';

interface CartItem { name: string; qty: number; price: number; }

interface DisplayState {
  status: 'idle' | 'active' | 'complete';
  business_name?: string;
  cart?: CartItem[];
  subtotal_cents?: number;
  discount_cents?: number;
  tax_cents?: number;
  total_cents?: number;
  customer_name?: string | null;
  change_cents?: number;
  loyalty_earned?: number;
  timestamp?: number;
  // Legacy keys from old terminal
  total?: number;
  complete_message?: string | null;
}

const POLL_MS = 500;
const COMPLETE_DURATION_MS = 4000;
const SLIDE_INTERVAL_MS = 5000;

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
    const update = () => setTime(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return <span>{time}</span>;
}

export default function CustomerDisplayPage() {
  const [state, setDisplayState] = useState<DisplayState>({ status: 'idle' });
  const [slideIdx, setSlideIdx] = useState(0);
  const [completeVisible, setCompleteVisible] = useState(false);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Poll localStorage every 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('aria_pos_display_state');
        if (!raw) return;
        const parsed: DisplayState = JSON.parse(raw);
        setDisplayState(prev => {
          // Only update if timestamp changed
          if (parsed.timestamp === prev.timestamp) return prev;
          return parsed;
        });
      } catch { /* ignore */ }
    }, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // Handle complete state animation
  useEffect(() => {
    if (state.status === 'complete') {
      setCompleteVisible(true);
      if (completeTimer.current) clearTimeout(completeTimer.current);
      completeTimer.current = setTimeout(() => {
        setCompleteVisible(false);
        setDisplayState({ status: 'idle' });
      }, COMPLETE_DURATION_MS);
    }
    return () => { if (completeTimer.current) clearTimeout(completeTimer.current); };
  }, [state.status, state.timestamp]);

  // Promo slide rotation
  useEffect(() => {
    const t = setInterval(() => setSlideIdx(i => (i + 1) % PROMO_SLIDES.length), SLIDE_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const businessName = state.business_name ?? 'AriaPOS';

  // ── COMPLETE STATE ─────────────────────────────────────────────
  if (state.status === 'complete' && completeVisible) {
    const change = state.change_cents ?? 0;
    const loyalty = state.loyalty_earned ?? 0;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center p-8 transition-all"
        style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)' }}>
        <div className="animate-bounce mb-6">
          <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center mx-auto">
            <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>
        <h1 className="text-7xl font-black text-white mb-3">
          {state.customer_name ? `Thanks, ${state.customer_name.split(' ')[0]}!` : 'Thank you!'}
        </h1>
        {change > 0 && (
          <div className="mt-4 bg-white/20 rounded-3xl px-10 py-4">
            <p className="text-xl text-white/80 font-medium mb-1">Change</p>
            <p className="text-5xl font-black font-mono text-white">{formatCents(change)}</p>
          </div>
        )}
        {loyalty > 0 && (
          <p className="mt-5 text-2xl text-white/90 font-semibold">
            ⭐ You earned {loyalty} loyalty points!
          </p>
        )}
        <p className="mt-6 text-lg text-white/60">{businessName}</p>
      </div>
    );
  }

  // ── ACTIVE SALE ────────────────────────────────────────────────
  const cartItems = state.cart ?? [];
  const isActive = state.status === 'active' && cartItems.length > 0;

  if (isActive) {
    const totalCents = state.total_cents ?? 0;
    const subtotalCents = state.subtotal_cents ?? totalCents;
    const discountCents = state.discount_cents ?? 0;
    const taxCents = state.tax_cents ?? 0;
    const exclGst = totalCents - taxCents;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        {/* Header */}
        <div className="flex-shrink-0 px-8 py-4 flex items-center justify-between"
          style={{ background: '#111827' }}>
          <p className="text-xl font-bold text-white tracking-tight">{businessName}</p>
          <div className="flex items-center gap-4">
            {state.customer_name && (
              <div className="flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5">
                <span className="text-white/70 text-sm">Welcome back,</span>
                <span className="text-white font-semibold text-sm">{state.customer_name}</span>
              </div>
            )}
            <p className="text-gray-400 text-sm font-mono"><Clock /></p>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-hidden px-8 py-6">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100">
                <span className="col-span-7 text-xs font-semibold text-gray-400 uppercase tracking-wider">Item</span>
                <span className="col-span-2 text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">Qty</span>
                <span className="col-span-3 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Amount</span>
              </div>
              <div className="divide-y divide-gray-50">
                {cartItems.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-4 px-6 py-4 items-center">
                    <p className="col-span-7 text-lg font-semibold text-gray-900">{item.name}</p>
                    <p className="col-span-2 text-lg text-gray-500 text-center">{item.qty}</p>
                    <p className="col-span-3 text-lg font-mono font-bold text-gray-900 text-right">
                      A${(item.price * item.qty).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="flex-shrink-0 bg-white border-t-2 border-gray-100 px-8 py-5">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-8">
                  <span className="text-sm text-gray-500 w-24">Subtotal</span>
                  <span className="text-sm font-mono text-gray-700">A${(exclGst / 100).toFixed(2)}</span>
                </div>
                {discountCents > 0 && (
                  <div className="flex items-center gap-8">
                    <span className="text-sm text-green-600 w-24">Discount</span>
                    <span className="text-sm font-mono text-green-600">−A${(discountCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-center gap-8">
                  <span className="text-sm text-gray-400 w-24">GST (10%)</span>
                  <span className="text-sm font-mono text-gray-400">A${(taxCents / 100).toFixed(2)}</span>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-400 mb-1">Total</p>
                <p className="text-6xl font-black font-mono text-gray-900 leading-none">
                  A${(totalCents / 100).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 py-1.5">Powered by AriaPOS</p>
      </div>
    );
  }

  // ── IDLE STATE ─────────────────────────────────────────────────
  const slide = PROMO_SLIDES[slideIdx];
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#111827' }}>
      {/* Business name */}
      <div className="flex-shrink-0 px-8 py-4 flex items-center justify-between border-b border-white/10">
        <p className="text-xl font-bold text-white">{businessName}</p>
        <p className="text-gray-500 text-sm font-mono"><Clock /></p>
      </div>

      {/* Centre content */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="mb-8">
          <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6">
            <span className="text-5xl font-black text-white">{businessName[0]}</span>
          </div>
          <h1 className="text-5xl font-black text-white mb-2 tracking-tight">{businessName}</h1>
          <p className="text-xl text-gray-400">Welcome</p>
        </div>

        {/* Promo slide */}
        <div className="bg-white/10 rounded-2xl px-8 py-5 max-w-lg transition-all duration-500">
          <p className="text-4xl mb-3">{slide.emoji}</p>
          <p className="text-lg text-white/80 font-medium">{slide.text}</p>
        </div>

        {/* Slide dots */}
        <div className="flex gap-2 mt-5">
          {PROMO_SLIDES.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${i === slideIdx ? 'bg-white w-4' : 'bg-white/30'}`} />
          ))}
        </div>
      </div>

      <p className="text-center text-xs text-white/10 py-3">AriaPOS Customer Display</p>
    </div>
  );
}
