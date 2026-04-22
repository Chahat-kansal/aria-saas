'use client';
import { useState, useEffect, useCallback, useRef } from 'react';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; tax_rate: number; stock_quantity: number;
  low_stock_threshold: number; track_stock: boolean; is_active: boolean;
  category_id: string | null;
  pos_categories?: { name: string; color: string } | null;
}
interface CartItem { product: Product; qty: number; }
interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; }
interface Category { id: string; name: string; color: string; }

export default function PosTerminal() {
  const [products, setProducts]           = useState<Product[]>([]);
  const [categories, setCategories]       = useState<Category[]>([]);
  const [cart, setCart]                   = useState<CartItem[]>([]);
  const [search, setSearch]               = useState('');
  const [activeCat, setActiveCat]         = useState<string | null>(null);
  const [customer, setCustomer]           = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [payMethod, setPayMethod]         = useState<'card' | 'cash' | 'split'>('card');
  const [cashTendered, setCashTendered]   = useState('');
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType]   = useState<'percent' | 'fixed'>('percent');
  const [appliedDiscount, setAppliedDiscount] = useState<{ amount: number; label: string } | null>(null);
  const [loading, setLoading]             = useState(false);
  const [receiptSale, setReceiptSale]     = useState<any | null>(null);
  const [sessionOpen, setSessionOpen]     = useState<boolean | null>(null);
  const [openingFloat, setOpeningFloat]   = useState('200');
  const [sessionLoading, setSessionLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial load
  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts(d.products || []);
      setCategories(d.categories || []);
    });
    fetch('/api/pos/sessions').then(r => r.json()).then(d => setSessionOpen(!!d.openSession));
  }, []);

  // Barcode scanner — characters arriving < 50 ms apart = scanner, not keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (barcodeTimer.current) clearTimeout(barcodeTimer.current);

      if (e.key === 'Enter') {
        const code = barcodeBuffer.current.trim();
        barcodeBuffer.current = '';
        if (code.length >= 3) {
          const hit = products.find(p => p.barcode === code || p.sku === code);
          if (hit && hit.is_active && (!hit.track_stock || hit.stock_quantity > 0)) addToCart(hit);
        }
        return;
      }

      if (e.key.length === 1) {
        barcodeBuffer.current += e.key;
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 50);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [products]);

  // Customer search
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);
  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  // Filtered product grid
  const filtered = products.filter(p =>
    p.is_active &&
    (!activeCat || p.category_id === activeCat) &&
    (!search || p.name.toLowerCase().includes(search.toLowerCase()) ||
     p.sku?.toLowerCase().includes(search.toLowerCase()) ||
     p.barcode?.toLowerCase().includes(search.toLowerCase()))
  );

  function addToCart(p: Product) {
    setCart(c => {
      const hit = c.find(i => i.product.id === p.id);
      if (hit) return c.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { product: p, qty: 1 }];
    });
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) setCart(c => c.filter(i => i.product.id !== id));
    else setCart(c => c.map(i => i.product.id === id ? { ...i, qty } : i));
  }

  function clearCart() {
    setCart([]); setCustomer(null); setAppliedDiscount(null);
    setCashTendered(''); setCustomerSearch('');
    searchRef.current?.focus();
  }

  // ── Calculations ───────────────────────────────────────────
  const subtotal       = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const taxAmount      = subtotal * 0.1;
  const discountAmount = appliedDiscount?.amount ?? 0;
  const total          = Math.max(0, subtotal + taxAmount - discountAmount);
  const tendered       = parseFloat(cashTendered) || 0;
  const change         = payMethod === 'cash' && tendered > total ? tendered - total : 0;

  function applyDiscount() {
    const val = parseFloat(discountInput);
    if (!discountInput || isNaN(val) || val <= 0) return;
    if (discountType === 'percent') {
      const pct = Math.min(val, 100);
      setAppliedDiscount({ amount: subtotal * (pct / 100), label: `${pct}%` });
    } else {
      setAppliedDiscount({ amount: Math.min(val, subtotal + taxAmount), label: `$${val.toFixed(2)}` });
    }
    setDiscountInput('');
  }

  // ── Session open ───────────────────────────────────────────
  const handleOpenSession = async () => {
    setSessionLoading(true);
    const r = await fetch('/api/pos/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0 }),
    });
    if (r.ok) setSessionOpen(true);
    setSessionLoading(false);
  };

  // ── Charge ─────────────────────────────────────────────────
  const charge = async () => {
    if (!cart.length || loading) return;
    setLoading(true);
    try {
      const r = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            product_id:      i.product.id,
            product_name:    i.product.name,
            product_sku:     i.product.sku,
            quantity:        i.qty,
            unit_price:      i.product.price,
            tax_rate:        i.product.tax_rate ?? 10,
            discount_percent: 0,
            line_total:      +(i.product.price * i.qty).toFixed(2),
          })),
          customer_id:     customer?.id ?? null,
          payment_method:  payMethod,
          subtotal:        +subtotal.toFixed(2),
          tax_amount:      +taxAmount.toFixed(2),
          discount_amount: +discountAmount.toFixed(2),
          total_amount:    +total.toFixed(2),
          cash_tendered:   payMethod === 'cash' ? tendered || null : null,
          change_given:    payMethod === 'cash' ? +change.toFixed(2) : null,
        }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      // Optimistically decrement local stock
      setProducts(ps => ps.map(p => {
        const item = cart.find(i => i.product.id === p.id);
        if (!item || !p.track_stock) return p;
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - item.qty) };
      }));
      setReceiptSale(d.sale);
    } finally {
      setLoading(false);
    }
  };

  // ── Guards ─────────────────────────────────────────────────
  const chargeDisabled = !cart.length || loading ||
    (payMethod === 'cash' && cashTendered !== '' && tendered < total);

  // ── States ─────────────────────────────────────────────────
  if (sessionOpen === null) return (
    <div className="flex items-center justify-center flex-1 bg-[#f5f4ef]">
      <div className="w-6 h-6 border-2 border-[#1D9E75] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!sessionOpen) return (
    <div className="flex items-center justify-center flex-1 bg-[#f5f4ef] p-8">
      <div className="max-w-sm w-full bg-white rounded-2xl p-8 text-center border border-[rgba(0,0,0,.07)] shadow-sm">
        <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center text-3xl"
          style={{ background: 'rgba(29,158,117,.08)', border: '1px solid rgba(29,158,117,.15)' }}>💵</div>
        <h2 className="text-xl font-semibold text-[#1a1a16] mb-1">Open cash session</h2>
        <p className="text-sm text-[rgba(26,26,22,.45)] mb-6">Count the float and open the till to start selling</p>
        <div className="mb-5">
          <label className="block text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-widest mb-2 text-left">Opening float ($)</label>
          <input value={openingFloat} onChange={e => setOpeningFloat(e.target.value)} type="number" min="0" step="0.01"
            className="w-full bg-[#f5f4ef] border border-[rgba(0,0,0,.12)] rounded-xl px-4 py-3 text-[#1a1a16] text-center text-2xl font-semibold focus:outline-none focus:border-[#1D9E75]" />
        </div>
        <button onClick={handleOpenSession} disabled={sessionLoading}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-[#1D9E75] hover:opacity-90 disabled:opacity-50 transition-opacity">
          {sessionLoading ? 'Opening…' : 'Open session & start selling'}
        </button>
      </div>
    </div>
  );

  if (receiptSale) return (
    <div className="flex items-center justify-center flex-1 bg-[#f5f4ef] p-8">
      <div className="max-w-xs w-full bg-white rounded-2xl p-8 text-center border border-[rgba(29,158,117,.25)] shadow-sm">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center text-3xl bg-[rgba(29,158,117,.08)]">✓</div>
        <h2 className="text-xl font-semibold text-[#1a1a16] mb-1">Sale complete</h2>
        <p className="text-xs text-[rgba(26,26,22,.4)] mb-1">{receiptSale.sale_number}</p>
        <p className="text-4xl font-bold text-[#1D9E75] my-5">${Number(receiptSale.total_amount).toFixed(2)}</p>
        {receiptSale.change_given > 0 && (
          <div className="bg-[rgba(29,158,117,.08)] rounded-xl px-4 py-2 mb-5 text-sm">
            <span className="text-[rgba(26,26,22,.5)]">Change: </span>
            <span className="font-semibold text-[#1D9E75]">${Number(receiptSale.change_given).toFixed(2)}</span>
          </div>
        )}
        <div className="space-y-2 mb-5">
          <button className="w-full py-3 rounded-xl border border-[rgba(0,0,0,.1)] text-sm text-[#1a1a16] hover:bg-[#f5f4ef] transition-colors">
            🖨&nbsp; Print receipt
          </button>
          <button className="w-full py-3 rounded-xl border border-[rgba(0,0,0,.1)] text-sm text-[#1a1a16] hover:bg-[#f5f4ef] transition-colors">
            📧&nbsp; Email receipt
          </button>
        </div>
        <button onClick={clearCart}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-[#1D9E75] hover:opacity-90 transition-opacity">
          New sale →
        </button>
      </div>
    </div>
  );

  // ── Main terminal ──────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ── LEFT: Product grid (60%) ── */}
      <div className="flex flex-col bg-[#f5f4ef]" style={{ flex: '0 0 60%', minWidth: 0 }}>

        {/* Search bar */}
        <div className="px-4 pt-4 pb-3 bg-white border-b border-[rgba(0,0,0,.06)]">
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍  Search by name, SKU or barcode…"
            className="w-full bg-[#f5f4ef] border border-[rgba(0,0,0,.1)] rounded-xl px-4 py-3 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.35)] focus:outline-none focus:border-[#1D9E75]" />
        </div>

        {/* Category pills */}
        {categories.length > 0 && (
          <div className="px-4 py-2.5 bg-white border-b border-[rgba(0,0,0,.06)] flex gap-2 overflow-x-auto">
            <button onClick={() => setActiveCat(null)}
              className={`flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium border transition-all ${!activeCat ? 'bg-[#1D9E75] text-white border-[#1D9E75]' : 'bg-white text-[rgba(26,26,22,.5)] border-[rgba(0,0,0,.12)] hover:border-[#1D9E75] hover:text-[#1D9E75]'}`}>
              All
            </button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                className="flex-shrink-0 text-xs px-3.5 py-1.5 rounded-full font-medium border transition-all"
                style={activeCat === cat.id
                  ? { background: cat.color, color: '#fff', borderColor: cat.color }
                  : { background: 'white', color: 'rgba(26,26,22,.5)', borderColor: 'rgba(0,0,0,.12)' }}>
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Product cards */}
        <div className="flex-1 overflow-y-auto p-4">
          {!filtered.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center pb-16">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm text-[rgba(26,26,22,.35)]">
                {!products.length ? 'No products yet — add some in Products' : 'No products match your search'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(p => {
                const outOfStock = p.track_stock && p.stock_quantity <= 0;
                const lowStock   = p.track_stock && !outOfStock && p.stock_quantity <= p.low_stock_threshold;
                return (
                  <button key={p.id} onClick={() => !outOfStock && addToCart(p)} disabled={outOfStock}
                    className={`text-left bg-white rounded-xl p-4 border relative transition-all select-none
                      ${outOfStock
                        ? 'opacity-40 cursor-not-allowed border-[rgba(0,0,0,.07)]'
                        : 'border-[rgba(0,0,0,.08)] hover:border-[#1D9E75] hover:shadow-sm active:scale-[.97] cursor-pointer'
                      }`}
                    style={{ minHeight: '80px' }}>
                    {/* Stock badge */}
                    {p.track_stock && (
                      <span className={`absolute top-2.5 right-2.5 text-[9px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${
                        outOfStock ? 'bg-red-100 text-red-600'
                        : lowStock  ? 'bg-amber-100 text-amber-700'
                        : 'bg-[rgba(29,158,117,.1)] text-[#1D9E75]'
                      }`}>
                        {outOfStock ? 'Out' : p.stock_quantity}
                      </span>
                    )}
                    <p className="text-sm font-semibold text-[#1a1a16] leading-snug pr-10 mb-1.5">{p.name}</p>
                    {p.sku && <p className="text-[10px] text-[rgba(26,26,22,.3)] font-mono mb-2">{p.sku}</p>}
                    <p className="text-lg font-bold text-[#1D9E75]">${Number(p.price).toFixed(2)}</p>
                    {lowStock && (
                      <p className="text-[10px] text-amber-600 mt-1">Low stock</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Cart & checkout (40%) ── */}
      <div className="flex flex-col bg-white border-l border-[rgba(0,0,0,.08)]" style={{ flex: '0 0 40%', minWidth: 0 }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[rgba(0,0,0,.06)]">
          <h2 className="text-base font-semibold text-[#1a1a16]">New sale</h2>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-xs text-[rgba(26,26,22,.4)] hover:text-red-500 transition-colors">
              Clear all
            </button>
          )}
        </div>

        {/* Customer selector */}
        <div className="px-4 py-3 border-b border-[rgba(0,0,0,.06)] relative">
          {customer ? (
            <div className="flex items-center justify-between bg-[rgba(29,158,117,.07)] rounded-xl px-3 py-2.5 border border-[rgba(29,158,117,.2)]">
              <div>
                <p className="text-xs font-semibold text-[#1D9E75]">👤 {customer.name}</p>
                {customer.loyalty_points > 0 && (
                  <p className="text-[10px] text-[rgba(26,26,22,.45)] mt-0.5">★ {customer.loyalty_points} loyalty points</p>
                )}
              </div>
              <button onClick={() => setCustomer(null)} className="text-[rgba(26,26,22,.3)] hover:text-[#1a1a16] text-lg leading-none">×</button>
            </div>
          ) : (
            <>
              <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                placeholder="Search customer (optional)…"
                className="w-full bg-[#f5f4ef] border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-2.5 text-xs text-[#1a1a16] placeholder-[rgba(26,26,22,.4)] focus:outline-none focus:border-[#1D9E75]" />
              {customerResults.length > 0 && (
                <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-xl shadow-lg border border-[rgba(0,0,0,.1)] z-30 overflow-hidden">
                  {customerResults.map(c => (
                    <button key={c.id}
                      onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
                      className="w-full text-left px-4 py-3 text-xs hover:bg-[#f5f4ef] transition-colors border-b border-[rgba(0,0,0,.05)] last:border-0">
                      <span className="font-medium text-[#1a1a16]">{c.name}</span>
                      {c.phone && <span className="text-[rgba(26,26,22,.4)] ml-2">{c.phone}</span>}
                      {c.loyalty_points > 0 && <span className="text-[#1D9E75] ml-2">★ {c.loyalty_points} pts</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto">
          {!cart.length ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <p className="text-5xl mb-4">🛒</p>
              <p className="text-sm font-medium text-[rgba(26,26,22,.3)]">Scan or tap a product to start</p>
            </div>
          ) : (
            <ul className="divide-y divide-[rgba(0,0,0,.05)]">
              {cart.map(item => (
                <li key={item.product.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a16] truncate">{item.product.name}</p>
                    <p className="text-[11px] text-[rgba(26,26,22,.4)]">${Number(item.product.price).toFixed(2)} ea</p>
                  </div>
                  {/* Qty controls */}
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.product.id, item.qty - 1)}
                      className="w-7 h-7 rounded-lg bg-[#f5f4ef] flex items-center justify-center text-base font-semibold text-[#1a1a16] hover:bg-[rgba(0,0,0,.08)] transition-colors">
                      −
                    </button>
                    <span className="text-sm font-bold text-[#1a1a16] w-7 text-center">{item.qty}</span>
                    <button onClick={() => updateQty(item.product.id, item.qty + 1)}
                      className="w-7 h-7 rounded-lg bg-[#f5f4ef] flex items-center justify-center text-base font-semibold text-[#1a1a16] hover:bg-[rgba(0,0,0,.08)] transition-colors">
                      +
                    </button>
                  </div>
                  <span className="text-sm font-semibold text-[#1a1a16] w-16 text-right flex-shrink-0">
                    ${(item.product.price * item.qty).toFixed(2)}
                  </span>
                  <button onClick={() => updateQty(item.product.id, 0)}
                    className="text-[rgba(26,26,22,.2)] hover:text-red-500 transition-colors text-xl leading-none ml-1">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Summary + checkout */}
        <div className="border-t border-[rgba(0,0,0,.07)] px-4 pt-4 pb-4 space-y-3 bg-white">

          {/* Discount row */}
          <div className="flex items-center gap-2">
            <div className="flex rounded-xl overflow-hidden border border-[rgba(0,0,0,.12)] text-xs flex-shrink-0">
              <button onClick={() => setDiscountType('percent')}
                className={`px-3 py-2 font-medium transition-colors ${discountType === 'percent' ? 'bg-[#1a1a16] text-white' : 'text-[rgba(26,26,22,.5)] hover:bg-[#f5f4ef]'}`}>
                %
              </button>
              <button onClick={() => setDiscountType('fixed')}
                className={`px-3 py-2 font-medium transition-colors ${discountType === 'fixed' ? 'bg-[#1a1a16] text-white' : 'text-[rgba(26,26,22,.5)] hover:bg-[#f5f4ef]'}`}>
                $
              </button>
            </div>
            <input value={discountInput} onChange={e => setDiscountInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyDiscount()}
              placeholder={discountType === 'percent' ? 'Discount %' : 'Discount $'}
              className="flex-1 bg-[#f5f4ef] border border-[rgba(0,0,0,.1)] rounded-xl px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#1D9E75]" />
            <button onClick={applyDiscount}
              className="px-3 py-2 rounded-xl text-xs font-medium bg-[#1a1a16] text-white hover:opacity-80 transition-opacity flex-shrink-0">
              Apply
            </button>
            {appliedDiscount && (
              <button onClick={() => setAppliedDiscount(null)}
                className="text-red-400 hover:text-red-600 text-xs flex-shrink-0">✕</button>
            )}
          </div>

          {/* Totals */}
          <div className="bg-[#f5f4ef] rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex justify-between text-sm text-[rgba(26,26,22,.55)]">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-[rgba(26,26,22,.55)]">
              <span>GST (10%)</span><span>${taxAmount.toFixed(2)}</span>
            </div>
            {appliedDiscount && (
              <div className="flex justify-between text-sm text-[#1D9E75] font-medium">
                <span>Discount ({appliedDiscount.label})</span>
                <span>−${appliedDiscount.amount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-2 border-t border-[rgba(0,0,0,.08)]">
              <span className="text-base font-bold text-[#1a1a16]">Total</span>
              <span className="text-2xl font-bold text-[#1a1a16]">${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {(['card', 'cash', 'split'] as const).map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                className={`py-2.5 rounded-xl text-xs font-semibold border capitalize transition-all ${payMethod === m ? 'bg-[#1a1a16] text-white border-[#1a1a16]' : 'bg-white text-[rgba(26,26,22,.55)] border-[rgba(0,0,0,.12)] hover:border-[#1a1a16] hover:text-[#1a1a16]'}`}>
                {m === 'card' ? '💳 Card' : m === 'cash' ? '💵 Cash' : '⇌ Split'}
              </button>
            ))}
          </div>

          {/* Cash tendered */}
          {payMethod === 'cash' && (
            <div className="space-y-2">
              <input value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                type="number" min="0" step="0.01" placeholder="Amount tendered"
                className="w-full bg-[#f5f4ef] border border-[rgba(0,0,0,.1)] rounded-xl px-4 py-3 text-sm text-[#1a1a16] focus:outline-none focus:border-[#1D9E75]" />
              {cashTendered !== '' && tendered >= total && (
                <div className="flex justify-between items-center bg-[rgba(29,158,117,.08)] border border-[rgba(29,158,117,.2)] rounded-xl px-4 py-2.5">
                  <span className="text-sm text-[rgba(26,26,22,.55)]">Change due</span>
                  <span className="text-base font-bold text-[#1D9E75]">${change.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* CHARGE button */}
          <button onClick={charge} disabled={chargeDisabled}
            className="w-full rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: '#1D9E75', height: '56px', fontSize: '18px' }}>
            {loading
              ? <span className="w-5 h-5 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
              : `Charge $${total.toFixed(2)}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}