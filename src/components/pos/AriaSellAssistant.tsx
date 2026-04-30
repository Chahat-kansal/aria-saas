'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

interface CartItem {
  product: { id: string; name: string; price: number };
  qty: number;
}

interface IntelMessage {
  type: 'offer' | 'stock' | 'margin' | 'bundle' | 'customer' | 'recipe' | 'compliance' | 'warning';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  title: string;
  message: string;
  staff_prompt: string | null;
  evidence: string[];
}

interface Props {
  businessId: string;
  cart: CartItem[];
  lastAddedProductId: string | null;
  customerId?: string | null;
}

const TYPE_ICON: Record<string, string> = {
  offer: '🎁', stock: '📦', margin: '⚠️', bundle: '🔗',
  customer: '👤', recipe: '🍳', compliance: '🔞', warning: '⚠️',
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'border-red-400/40 bg-red-500/10',
  high: 'border-amber-400/30 bg-amber-500/10',
  medium: 'border-blue-400/20 bg-blue-500/8',
  low: 'border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]',
};

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high: 'bg-amber-400',
  medium: 'bg-blue-400',
  low: 'bg-[rgba(255,255,255,0.3)]',
};

export function AriaSellAssistant({ businessId, cart, lastAddedProductId, customerId }: Props) {
  const [messages, setMessages] = useState<IntelMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const lastProductRef = useRef<string | null>(null);

  const fetchIntelligence = useCallback(async (productId: string) => {
    if (!businessId || !productId) return;
    setLoading(true);
    try {
      const res = await fetch('/api/pos/product-intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          product_id: productId,
          cart_items: cart.map(i => ({ product_id: i.product.id, qty: i.qty })),
          customer_id: customerId ?? null,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const newMessages: IntelMessage[] = (data.messages ?? []).filter(
        (m: IntelMessage) => m.staff_prompt || m.title
      );
      setMessages(newMessages);
      setDismissed(new Set()); // reset dismissed on new product
    } catch { /* silent — assistant is non-blocking */ }
    setLoading(false);
  }, [businessId, cart, customerId]);

  // Debounce: fetch when a new product is added to cart
  useEffect(() => {
    if (!lastAddedProductId) return;
    if (lastAddedProductId === lastProductRef.current) return;
    lastProductRef.current = lastAddedProductId;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchIntelligence(lastAddedProductId), 300);
    return () => clearTimeout(timerRef.current);
  }, [lastAddedProductId, fetchIntelligence]);

  // Clear messages when cart is empty
  useEffect(() => {
    if (cart.length === 0) {
      setMessages([]);
      lastProductRef.current = null;
    }
  }, [cart.length]);

  const visible = messages.filter(m => !dismissed.has(m.title));

  if (cart.length === 0) return null;
  if (!loading && visible.length === 0) return null;

  return (
    <div className="border-t border-[rgba(0,0,0,0.06)] bg-[#f0f4ff]">
      <div className="px-3 pt-2 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">✦ Aria</span>
          {loading && <span className="text-[9px] text-[rgba(26,26,22,0.3)] animate-pulse">checking…</span>}
        </div>
        {visible.length > 0 && (
          <button onClick={() => setDismissed(new Set(visible.map(m => m.title)))}
            className="text-[9px] text-[rgba(26,26,22,0.35)] hover:text-[rgba(26,26,22,0.6)] transition-colors">
            dismiss all
          </button>
        )}
      </div>

      {loading && visible.length === 0 && (
        <div className="px-3 pb-2">
          <div className="h-8 bg-[rgba(0,0,0,0.05)] rounded-lg animate-pulse" />
        </div>
      )}

      {visible.length > 0 && (
        <div className="px-3 pb-2 space-y-1.5">
          {visible.slice(0, 3).map((msg, i) => (
            <div key={i}
              className={`rounded-xl border px-3 py-2 flex items-start gap-2 ${PRIORITY_COLOR[msg.priority]}`}>
              <span className="text-sm flex-shrink-0 mt-0.5">{TYPE_ICON[msg.type] ?? '💡'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-[#1a1a16] leading-tight">
                  {msg.staff_prompt ?? msg.title}
                </p>
                {msg.staff_prompt && msg.message !== msg.staff_prompt && (
                  <p className="text-[10px] text-[rgba(26,26,22,0.45)] mt-0.5 leading-tight">{msg.message}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[msg.priority]}`} />
                <button
                  onClick={() => setDismissed(d => new Set([...d, msg.title]))}
                  className="text-[rgba(26,26,22,0.25)] hover:text-[rgba(26,26,22,0.5)] transition-colors text-base leading-none">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
