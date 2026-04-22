'use client';
import { useState, useEffect, useCallback } from 'react';

interface Product { id: string; name: string; price: number; sku: string; category_id: string | null; stock_quantity: number | null; }
interface CartItem extends Product { qty: number; }
interface Customer { id: string; name: string; email: string; phone: string; loyalty_points: number; }

const PAYMENT_METHODS = ['cash', 'card', 'eftpos', 'split'];

export default function PosTerminal() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; color: string }[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState('card');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [discount, setDiscount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saleComplete, setSaleComplete] = useState<{ id: string; total: number } | null>(null);
  const [sessionOpen, setSessionOpen] = useState<boolean | null>(null);
  const [openingFloat, setOpeningFloat] = useState('200');
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts(d.products || []);
      setCategories(d.categories || []);
    });
    fetch('/api/pos/sessions').then(r => r.json()).then(d => setSessionOpen(!!d.openSession));
  }, []);

  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);

  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  const filtered = products.filter(p =>
    (!activeCat || p.category_id === activeCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (p: Product) => {
    setCart(c => {
      const existing = c.find(i => i.id === p.id);
      if (existing) return c.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { ...p, qty: 1 }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) setCart(c => c.filter(i => i.id !== id));
    else setCart(c => c.map(i => i.id === id ? { ...i, qty } : i));
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountAmt = discount > 0 ? (discount >= 1 ? discount : subtotal * discount) : 0;
  const total = Math.max(0, subtotal - discountAmt);

  const openSession = async () => {
    setSessionLoading(true);
    await fetch('/api/pos/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) }),
    });
    setSessionOpen(true);
    setSessionLoading(false);
  };

  const completeSale = async () => {
    if (!cart.length || loading) return;
    setLoading(true);
    try {
      const r = await fetch('/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({ product_id: i.id, quantity: i.qty, unit_price: i.price, discount_amount: 0 })),
          total_amount: total,
          payment_method: payMethod,
          customer_id: customer?.id || null,
          discount_amount: discountAmt,
        }),
      });
      const d = await r.json();
      if (d.sale) {
        setSaleComplete({ id: d.sale.id, total });
        setCart([]);
        setCustomer(null);
        setDiscount(0);
      }
    } finally {
      setLoading(false);
    }
  };

  if (sessionOpen === null) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!sessionOpen) return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-sm w-full rounded-2xl p-8 text-center" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.08)' }}>
        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(249,115,22,.12)', border: '1px solid rgba(249,115,22,.25)' }}>💵</div>
        <h2 className="text-lg font-semibold text-white mb-2">Open cash session</h2>
        <p className="text-xs text-[rgba(255,255,255,.4)] mb-6">Enter the opening float to start selling</p>
        <div className="mb-4">
          <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Opening float ($)</label>
          <input value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} type="number" min="0"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-center text-xl font-medium focus:outline-none focus:border-[#F97316]" />
        </div>
        <button onClick={openSession} disabled={sessionLoading}
          className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
          {sessionLoading ? 'Opening…' : 'Open session'}
        </button>
      </div>
    </div>
  );

  if (saleComplete) return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="max-w-xs w-full rounded-2xl p-8 text-center" style={{ background: '#111118', border: '1px solid rgba(52,211,153,.3)' }}>
        <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center text-2xl"
          style={{ background: 'rgba(52,211,153,.12)' }}>✓</div>
        <h2 className="text-lg font-semibold text-white mb-1">Sale complete</h2>
        <p className="text-3xl font-semibold text-[#34d399] mt-3 mb-1">${saleComplete.total.toFixed(2)}</p>
        <p className="text-[10px] text-[rgba(255,255,255,.3)] mb-6">#{saleComplete.id.slice(-8).toUpperCase()}</p>
        <button onClick={() => setSaleComplete(null)}
          className="w-full py-3 rounded-xl font-medium text-white"
          style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
          New sale
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-white/5">
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or SKU…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[rgba(255,255,255,.25)] focus:outline-none focus:border-[#F97316]" />
        </div>

        {categories.length > 0 && (
          <div className="px-4 py-2 flex gap-2 overflow-x-auto border-b border-white/5">
            <button onClick={() => setActiveCat(null)}
              className={`text-[10px] px-3 py-1.5 rounded-full flex-shrink-0 border transition-all ${!activeCat ? 'bg-[rgba(249,115,22,.15)] text-[#fdba74] border-[rgba(249,115,22,.3)]' : 'text-[rgba(255,255,255,.4)] border-white/10 hover:border-white/20'}`}>
              All
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                className={`text-[10px] px-3 py-1.5 rounded-full flex-shrink-0 border transition-all ${activeCat === cat.id ? 'bg-[rgba(249,115,22,.15)] text-[#fdba74] border-[rgba(249,115,22,.3)]' : 'text-[rgba(255,255,255,.4)] border-white/10 hover:border-white/20'}`}>
                {cat.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {!filtered.length ? (
            <div className="text-center py-12">
              <p className="text-xs text-[rgba(255,255,255,.25)]">
                {!products.length ? 'No products yet — add some to your catalogue' : 'No products match your search'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  className="rounded-xl p-3 text-left border border-white/5 hover:border-[rgba(249,115,22,.3)] hover:bg-[rgba(249,115,22,.05)] transition-all active:scale-[.98]">
                  <div className="w-8 h-8 rounded-lg mb-2 flex items-center justify-center text-base"
                    style={{ background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.15)' }}>📦</div>
                  <p className="text-xs font-medium text-[rgba(255,255,255,.85)] leading-snug line-clamp-2 mb-1">{p.name}</p>
                  {p.sku && <p className="text-[9px] text-[rgba(255,255,255,.25)] mb-2">{p.sku}</p>}
                  <p className="text-sm font-semibold text-[#F97316]">${Number(p.price).toFixed(2)}</p>
                  {p.stock_quantity !== null && (
                    <p className={`text-[9px] mt-1 ${p.stock_quantity <= 5 ? 'text-red-400' : 'text-[rgba(255,255,255,.3)]'}`}>
                      {p.stock_quantity} in stock
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="w-80 flex-shrink-0 flex flex-col" style={{ background: '#0d0d14' }}>
        <div className="p-4 border-b border-white/5">
          <h2 className="text-sm font-medium text-white mb-3">Current sale</h2>
          <div className="relative">
            <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
              placeholder={customer ? customer.name : 'Search customer…'}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[rgba(255,255,255,.25)] focus:outline-none focus:border-[#F97316]" />
            {customerResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
                style={{ background: '#1a1a25', border: '1px solid rgba(255,255,255,.1)' }}>
                {customerResults.map(c => (
                  <button key={c.id} onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-white/5">
                    <span className="text-[rgba(255,255,255,.8)]">{c.name}</span>
                    {c.email && <span className="text-[rgba(255,255,255,.35)] ml-2">{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {customer && (
            <div className="mt-2 flex items-center justify-between text-[10px]">
              <span className="text-emerald-400">✓ {customer.name} · {customer.loyalty_points} pts</span>
              <button onClick={() => setCustomer(null)} className="text-[rgba(255,255,255,.3)] hover:text-white">×</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {!cart.length ? (
            <p className="text-xs text-[rgba(255,255,255,.2)] text-center py-8">Tap a product to add it</p>
          ) : (
            <ul className="space-y-2.5">
              {cart.map(item => (
                <li key={item.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[rgba(255,255,255,.8)] truncate">{item.name}</p>
                    <p className="text-[10px] text-[rgba(255,255,255,.4)]">${item.price.toFixed(2)} each</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.id, item.qty - 1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-xs bg-white/5 hover:bg-white/10 text-[rgba(255,255,255,.6)]">−</button>
                    <span className="text-xs text-white w-5 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.id, item.qty + 1)}
                      className="w-5 h-5 rounded flex items-center justify-center text-xs bg-white/5 hover:bg-white/10 text-[rgba(255,255,255,.6)]">+</button>
                  </div>
                  <span className="text-xs font-medium text-white w-14 text-right flex-shrink-0">
                    ${(item.price * item.qty).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[rgba(255,255,255,.4)] flex-shrink-0">Discount $</label>
            <input type="number" min="0" value={discount || ''} onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#F97316] text-right" />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-[rgba(255,255,255,.4)]">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between text-xs text-emerald-400">
                <span>Discount</span><span>−${discountAmt.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold text-white pt-1 border-t border-white/5">
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {PAYMENT_METHODS.map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                className={`py-1.5 rounded-lg text-[10px] capitalize border transition-all ${payMethod === m ? 'bg-[rgba(249,115,22,.15)] text-[#fdba74] border-[rgba(249,115,22,.3)]' : 'text-[rgba(255,255,255,.4)] border-white/10'}`}>
                {m}
              </button>
            ))}
          </div>

          <button onClick={completeSale} disabled={!cart.length || loading}
            className="w-full py-3 rounded-xl font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
            {loading ? 'Processing…' : `Charge $${total.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}