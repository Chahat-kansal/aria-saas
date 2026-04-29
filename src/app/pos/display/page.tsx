'use client';
import { useState, useEffect } from 'react';

interface DisplayState {
  business_name: string;
  cart: { name: string; qty: number; price: number }[];
  total: number;
  customer_name: string | null;
  status: 'idle' | 'sale_in_progress' | 'complete';
  complete_message: string | null;
}

const DEFAULT_STATE: DisplayState = {
  business_name: 'AriaPOS',
  cart: [],
  total: 0,
  customer_name: null,
  status: 'idle',
  complete_message: null,
};

export default function CustomerDisplayPage() {
  const [state, setState] = useState<DisplayState>(DEFAULT_STATE);

  // Poll localStorage every 500ms for updates from the terminal
  useEffect(() => {
    const interval = setInterval(() => {
      try {
        const raw = localStorage.getItem('aria_pos_display_state');
        if (raw) setState(JSON.parse(raw));
      } catch { /* ignore */ }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const subtotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (state.status === 'complete') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-[#1a1a16] mb-2">
          {state.complete_message ?? (state.customer_name ? `Thank you, ${state.customer_name}!` : 'Thank you!')}
        </h1>
        <p className="text-lg text-[rgba(26,26,22,.5)]">{state.business_name}</p>
        <p className="mt-4 text-sm text-[rgba(26,26,22,.3)]">Sale total: A${state.total.toFixed(2)}</p>
      </div>
    );
  }

  if (state.status === 'sale_in_progress' && state.cart.length > 0) {
    return (
      <div className="min-h-screen bg-[#f5f4ef] flex flex-col">
        <div className="px-8 py-5 bg-white border-b border-[rgba(0,0,0,.06)]">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <p className="text-xl font-bold text-[#1a1a16]">{state.business_name}</p>
            {state.customer_name && <p className="text-sm text-[rgba(26,26,22,.5)]">Welcome, {state.customer_name}</p>}
          </div>
        </div>
        <div className="flex-1 px-8 py-6 max-w-2xl mx-auto w-full">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-[rgba(0,0,0,.08)]">
                <th className="pb-3 text-left text-sm font-medium text-[rgba(26,26,22,.4)]">Item</th>
                <th className="pb-3 text-center text-sm font-medium text-[rgba(26,26,22,.4)]">Qty</th>
                <th className="pb-3 text-right text-sm font-medium text-[rgba(26,26,22,.4)]">Price</th>
                <th className="pb-3 text-right text-sm font-medium text-[rgba(26,26,22,.4)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {state.cart.map((item, i) => (
                <tr key={i} className="border-b border-[rgba(0,0,0,.04)]">
                  <td className="py-3 text-base font-medium text-[#1a1a16]">{item.name}</td>
                  <td className="py-3 text-center text-base text-[rgba(26,26,22,.6)]">{item.qty}</td>
                  <td className="py-3 text-right text-base text-[rgba(26,26,22,.6)]">A${item.price.toFixed(2)}</td>
                  <td className="py-3 text-right text-base font-semibold text-[#1a1a16]">A${(item.price * item.qty).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-8 py-6 bg-white border-t-2 border-[rgba(0,0,0,.08)]">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-lg font-medium text-[rgba(26,26,22,.5)]">{state.cart.length} item{state.cart.length !== 1 ? 's' : ''}</p>
            <div className="text-right">
              <p className="text-sm text-[rgba(26,26,22,.4)]">Total</p>
              <p className="text-4xl font-bold text-[#1a1a16]">A${subtotal.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-[rgba(26,26,22,.2)] py-2">Powered by AriaPOS</p>
      </div>
    );
  }

  // Idle state
  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-8">
        <p className="text-4xl font-bold text-[#1a1a16] mb-2">{state.business_name}</p>
        <p className="text-lg text-[rgba(26,26,22,.4)]">Welcome</p>
      </div>
      <div className="w-32 h-1 rounded-full bg-[rgba(0,0,0,.08)] mb-8" />
      <p className="text-sm text-[rgba(26,26,22,.3)]">Waiting for next customer…</p>
      <p className="mt-12 text-xs text-[rgba(26,26,22,.15)]">AriaPOS Customer Display</p>
    </div>
  );
}
