'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AriaSellAssistant } from '@/components/pos/AriaSellAssistant';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; tax_rate: number;
  stock_quantity: number; low_stock_threshold: number;
  track_stock: boolean; is_active: boolean;
  category_id: string | null;
  pos_categories?: { name: string; color: string } | null;
}
interface CartItem { product: Product; qty: number; discount_percent?: number; }
interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; total_spent: number; }
interface Category { id: string; name: string; color: string; }
interface ParkedSale { id: string; label: string | null; items: CartItem[]; total: number; customer_id: string | null; created_at: string; }
interface SaleKey { id: string; label: string; color: string; icon: string | null; type: string; function_name: string | null; product_id: string | null; position: number; }
interface RegisterSession { id: string; status: string; opening_float: number; opened_at: string; opened_by: string | null; }

/* ─── Default sale keys ─────────────────────────────────────────── */
const DEFAULT_KEYS: Omit<SaleKey, 'id'>[] = [
  { label: 'Clear Sale',     color: '#8B7355', icon: 'x',      type: 'function', function_name: 'clear',          position: 0, product_id: null },
  { label: 'Case Qty',       color: '#7CB87C', icon: 'box',    type: 'function', function_name: 'case_qty',       position: 1, product_id: null },
  { label: '– Qty',          color: '#9E9E9E', icon: 'minus',  type: 'function', function_name: 'minus_qty',      position: 2, product_id: null },
  { label: '+ Qty',          color: '#9E9E9E', icon: 'plus',   type: 'function', function_name: 'plus_qty',       position: 3, product_id: null },
  { label: 'More Functions', color: '#2196F3', icon: 'folder', type: 'function', function_name: 'more_functions', position: 4, product_id: null },
  { label: 'Cash Out',       color: '#C4956A', icon: 'hand',   type: 'function', function_name: 'cash_out',       position: 5, product_id: null },
  { label: 'Exact Cash',     color: '#C4956A', icon: 'dollar', type: 'function', function_name: 'exact_cash',     position: 6, product_id: null },
];
const DENOM_KEYS = [
  { label: '$1',   color: '#D4B800', amount: 1   },
  { label: '$2',   color: '#D4B800', amount: 2   },
  { label: '$5',   color: '#E75480', amount: 5   },
  { label: '$10',  color: '#2196F3', amount: 10  },
  { label: '$20',  color: '#EF9F27', amount: 20  },
  { label: '$50',  color: '#FF7043', amount: 50  },
  { label: '$100', color: '#66BB6A', amount: 100 },
];

type PayMethod = 'cash' | 'eftpos' | 'split';
type ActiveTab = 'keys' | 'parked';

/* ════════════════════════════════════════════════════════════════
   TERMINAL PAGE
════════════════════════════════════════════════════════════════ */
export default function TerminalPage() {
  const [products,        setProducts]        = useState<Product[]>([]);
  const [saleKeys,        setSaleKeys]        = useState<SaleKey[]>([]);
  const [parkedSales,     setParkedSales]     = useState<ParkedSale[]>([]);
  const [cart,            setCart]            = useState<CartItem[]>([]);
  const [selectedItem,    setSelectedItem]    = useState<string | null>(null);
  const [customer,        setCustomer]        = useState<Customer | null>(null);
  const [customerSearch,  setCustomerSearch]  = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [search,          setSearch]          = useState('');
  const [searchResults,   setSearchResults]   = useState<Product[]>([]);
  const [activeTab,       setActiveTab]       = useState<ActiveTab>('keys');
  const [showPayModal,    setShowPayModal]    = useState(false);
  const [showReceipt,     setShowReceipt]     = useState<any>(null);
  const [payMethod,       setPayMethod]       = useState<PayMethod>('eftpos');
  const [cashTendered,    setCashTendered]    = useState('');
  const [splitCash,       setSplitCash]       = useState('');
  const [processing,      setProcessing]      = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [lastAddedId,     setLastAddedId]     = useState<string | null>(null);
  const [businessId,      setBusinessId]      = useState<string | null>(null);

  // ── Register session state ──────────────────────────────────
  const [registerSession,   setRegisterSession]   = useState<RegisterSession | null>(null);
  const [registerLoading,   setRegisterLoading]   = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [openingFloat,      setOpeningFloat]      = useState('200');
  const [openingRegister,   setOpeningRegister]   = useState(false);
  const [closingRegister,   setClosingRegister]   = useState(false);
  const [showCloseModal,    setShowCloseModal]    = useState(false);
  const [closingFloat,      setClosingFloat]      = useState('');
  const [registerError,     setRegisterError]     = useState<string | null>(null);

  const searchRef     = useRef<HTMLInputElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeTs     = useRef<number>(0);

  /* ── Register session load ─────────────────────────────────── */
  const loadRegister = useCallback(async () => {
    setRegisterLoading(true);
    try {
      const res = await fetch('/api/pos/sessions');
      if (res.ok) {
        const d = await res.json();
        setRegisterSession(d.openSession ?? null);
      }
    } catch { /* silent */ }
    setRegisterLoading(false);
  }, []);

  /* ── Initial data load ─────────────────────────────────────── */
  useEffect(() => {
    loadRegister();
    Promise.all([
      fetch('/api/pos/products').then(r => r.json()),
      fetch('/api/pos/park').then(r => r.json()),
    ]).then(([prod, park]) => {
      if (prod.business_id) setBusinessId(prod.business_id);
      setProducts(prod.products || []);
      setSaleKeys(prod.sale_keys || []);
      setParkedSales(park.parked_sales || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [loadRegister]);

  /* ── Open Register ──────────────────────────────────────────── */
  async function openRegister() {
    setOpeningRegister(true);
    setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0 }),
      });
      const d = await res.json();
      if (!res.ok) {
        setRegisterError(d.error ?? 'Failed to open register');
        setOpeningRegister(false);
        return;
      }
      await loadRegister();
      setShowRegisterModal(false);
    } catch {
      setRegisterError('Failed to open register — check connection');
    }
    setOpeningRegister(false);
  }

  /* ── Close Register ─────────────────────────────────────────── */
  async function closeRegister() {
    if (!registerSession) return;
    setClosingRegister(true);
    setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: registerSession.id,
          closing_float: parseFloat(closingFloat) || 0,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setRegisterError(d.error ?? 'Failed to close register');
        setClosingRegister(false);
        return;
      }
      await loadRegister();
      setShowCloseModal(false);
      setClosingFloat('');
    } catch {
      setRegisterError('Failed to close register — check connection');
    }
    setClosingRegister(false);
  }

  /* ── Sync cart to customer display (localStorage) ─────────── */
  useEffect(() => {
    try {
      const displayState = {
        business_name: 'AriaPOS',
        cart: cart.map(i => ({ name: i.product.name, qty: i.qty, price: i.product.price })),
        total: cart.reduce((s, i) => s + i.product.price * i.qty, 0),
        customer_name: customer?.name ?? null,
        status: showReceipt ? 'complete' : cart.length > 0 ? 'sale_in_progress' : 'idle',
        complete_message: showReceipt ? `Thank you${customer ? `, ${customer.name}` : ''}!` : null,
      };
      localStorage.setItem('aria_pos_display_state', JSON.stringify(displayState));
    } catch { /* ignore */ }
  }, [cart, customer, showReceipt]);

  /* ── Barcode scanner (rapid keystrokes < 100ms) ────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target === searchRef.current) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const now = Date.now();
      if (e.key === 'Enter') {
        const code = barcodeBuffer.current.trim();
        barcodeBuffer.current = '';
        if (code.length >= 4) {
          const hit = products.find(p => p.barcode === code || p.sku === code);
          if (hit && hit.is_active && (!hit.track_stock || hit.stock_quantity > 0)) addToCart(hit);
        }
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F8') { e.preventDefault(); parkSale(); return; }
      if (e.key === 'Escape') { if (!showPayModal) confirmClear(); return; }
      if (e.key.length === 1) {
        if (now - barcodeTs.current > 100) barcodeBuffer.current = '';
        barcodeTs.current = now;
        barcodeBuffer.current += e.key;
        if (barcodeTimer.current) clearTimeout(barcodeTimer.current);
        barcodeTimer.current = setTimeout(() => { barcodeBuffer.current = ''; }, 150);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [products, showPayModal]);

  /* ── Product search ────────────────────────────────────────── */
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const q = search.toLowerCase();
    setSearchResults(
      products.filter(p =>
        p.is_active && (
          p.name.toLowerCase().includes(q) ||
          p.sku?.toLowerCase().includes(q) ||
          p.barcode?.toLowerCase().includes(q)
        )
      ).slice(0, 8)
    );
  }, [search, products]);

  /* ── Customer search ───────────────────────────────────────── */
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);
  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  /* ── Cart helpers ──────────────────────────────────────────── */
  function addToCart(p: Product) {
    setCart(c => {
      const hit = c.find(i => i.product.id === p.id);
      if (hit) return c.map(i => i.product.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { product: p, qty: 1 }];
    });
    setSelectedItem(p.id);
    setLastAddedId(p.id);
    setSearch(''); setSearchResults([]);
  }

  function updateQty(id: string, qty: number) {
    if (qty <= 0) setCart(c => c.filter(i => i.product.id !== id));
    else setCart(c => c.map(i => i.product.id === id ? { ...i, qty } : i));
  }

  function confirmClear() {
    if (!cart.length) return;
    if (confirm('Clear the current sale?')) clearSale();
  }

  function clearSale() {
    setCart([]); setCustomer(null); setSelectedItem(null);
    setCashTendered(''); setSplitCash(''); setCustomerSearch('');
    searchRef.current?.focus();
  }

  /* ── Calculations ──────────────────────────────────────────── */
  const subtotal     = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const taxAmount    = subtotal * 0.1;
  const total        = subtotal + taxAmount;
  const tendered     = parseFloat(cashTendered) || 0;
  const change       = payMethod === 'cash' && tendered >= total ? tendered - total : 0;
  const splitCardAmt = payMethod === 'split' ? Math.max(0, total - (parseFloat(splitCash) || 0)) : 0;

  /* ── Sale key tile action ──────────────────────────────────── */
  function handleKeyTile(fn: string | null) {
    if (!fn) return;
    switch (fn) {
      case 'clear':       confirmClear(); break;
      case 'exact_cash':  setPayMethod('cash'); setCashTendered(total.toFixed(2)); break;
      case 'minus_qty':   if (selectedItem) { const item = cart.find(i => i.product.id === selectedItem); if (item) updateQty(selectedItem, item.qty - 1); } break;
      case 'plus_qty':    if (selectedItem) { const item = cart.find(i => i.product.id === selectedItem); if (item) updateQty(selectedItem, item.qty + 1); } break;
      default: break;
    }
  }

  /* ── Park sale ─────────────────────────────────────────────── */
  async function parkSale() {
    if (!cart.length) return;
    const label = prompt('Label for parked sale (optional):') ?? undefined;
    await fetch('/api/pos/park', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label, items: cart, customer_id: customer?.id ?? null,
        subtotal: +subtotal.toFixed(2), total: +total.toFixed(2),
      }),
    });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    clearSale();
  }

  /* ── Restore parked sale ───────────────────────────────────── */
  async function restoreParked(p: ParkedSale) {
    setCart(p.items);
    await fetch(`/api/pos/park?id=${p.id}`, { method: 'DELETE' });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    setActiveTab('keys');
  }

  /* ── Process sale ──────────────────────────────────────────── */
  async function processSale() {
    if (!cart.length || processing) return;
    setProcessing(true);
    try {
      const outletId = typeof window !== 'undefined' ? localStorage.getItem('pos_outlet_id') || null : null;
      const r = await fetch('/api/pos/sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            product_id:       i.product.id,
            product_name:     i.product.name,
            product_sku:      i.product.sku,
            quantity:         i.qty,
            unit_price:       i.product.price,
            tax_rate:         i.product.tax_rate ?? 10,
            discount_percent: i.discount_percent ?? 0,
            line_total:       +(i.product.price * i.qty).toFixed(2),
          })),
          customer_id:     customer?.id ?? null,
          payment_method:  payMethod,
          subtotal:        +subtotal.toFixed(2),
          tax_amount:      +taxAmount.toFixed(2),
          discount_amount: 0,
          total_amount:    +total.toFixed(2),
          cash_tendered:   payMethod === 'cash' ? tendered : null,
          change_given:    payMethod === 'cash' ? +change.toFixed(2) : null,
          split_cash:      payMethod === 'split' ? parseFloat(splitCash) || 0 : null,
          split_card:      payMethod === 'split' ? +splitCardAmt.toFixed(2) : null,
          outlet_id:       outletId,
          session_id:      registerSession?.id ?? null,
        }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      // Optimistically update local stock
      setProducts(ps => ps.map(p => {
        const item = cart.find(i => i.product.id === p.id);
        if (!item || !p.track_stock) return p;
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - item.qty) };
      }));
      setShowPayModal(false);
      setShowReceipt(d.sale);
      clearSale();
    } finally {
      setProcessing(false);
    }
  }

  /* ── Render ────────────────────────────────────────────────── */
  const displayKeys = saleKeys.length
    ? saleKeys
    : DEFAULT_KEYS.map((k, i) => ({ ...k, id: `default-${i}` }));

  const registerIsOpen = !!registerSession;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f4ef]">

      {/* Top bar: search + register status */}
      <div className="bg-[#1a1a1a] px-4 py-2.5 flex items-center gap-3 flex-shrink-0 relative z-30">
        {/* Register status pill */}
        <button
          onClick={() => registerIsOpen ? setShowCloseModal(true) : setShowRegisterModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
            registerLoading ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]' :
            registerIsOpen ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75] hover:bg-[rgba(29,158,117,0.25)]' :
            'bg-[rgba(239,68,68,0.15)] text-red-400 hover:bg-[rgba(239,68,68,0.25)]'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${registerLoading ? 'bg-[rgba(255,255,255,0.3)]' : registerIsOpen ? 'bg-[#1D9E75]' : 'bg-red-400'}`} />
          {registerLoading ? 'Loading…' : registerIsOpen ? 'Register Open' : 'Register Closed'}
        </button>

        {/* Product search */}
        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.3)]" />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search products…  (F1)"
            className="w-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[rgba(255,255,255,0.3)] outline-none focus:border-[rgba(255,255,255,0.25)] transition-colors"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] shadow-2xl z-50 overflow-hidden">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(37,99,235,0.05)] transition-colors text-left border-b border-[rgba(0,0,0,0.05)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a16] truncate">{p.name}</p>
                    <p className="text-[11px] text-[rgba(26,26,22,0.4)]">
                      {p.sku ?? ''}{p.barcode ? ` · ${p.barcode}` : ''}
                      {p.track_stock && (
                        <span className={`ml-2 ${p.stock_quantity === 0 ? 'text-red-500' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-500' : 'text-[rgba(26,26,22,0.3)]'}`}>
                          {p.stock_quantity === 0 ? '⚠ Out of stock' : p.stock_quantity <= p.low_stock_threshold ? `⚡ Low: ${p.stock_quantity}` : `${p.stock_quantity} in stock`}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#1a1a16] flex-shrink-0">${p.price.toFixed(2)}</p>
                </button>
              ))}
            </div>
          )}
          {search.trim() && searchResults.length === 0 && !loading && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] shadow-xl z-50 px-4 py-3 text-sm text-[rgba(26,26,22,0.4)]">
              No products matching &ldquo;{search}&rdquo;
            </div>
          )}
        </div>
        <kbd className="hidden sm:block text-[10px] text-[rgba(255,255,255,0.2)] border border-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5 flex-shrink-0">F8 park</kbd>
        <kbd className="hidden sm:block text-[10px] text-[rgba(255,255,255,0.2)] border border-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5 flex-shrink-0">ESC clear</kbd>
      </div>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL — Sale keys (70%) */}
        <div className="flex flex-col flex-[7] overflow-hidden bg-white border-r border-[rgba(0,0,0,0.07)]">
          <div className="flex border-b border-[rgba(0,0,0,0.07)] flex-shrink-0">
            {(['keys', 'parked'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-xs font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? 'text-[#2563eb] border-[#2563eb]'
                    : 'text-[rgba(26,26,22,0.45)] border-transparent hover:text-[#1a1a16]'
                }`}>
                {tab === 'keys' ? 'Sale Keys' : `Parked Sales${parkedSales.length ? ` (${parkedSales.length})` : ''}`}
              </button>
            ))}
          </div>

          {activeTab === 'keys' ? (
            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="flex items-center justify-center h-full text-[rgba(26,26,22,0.3)] text-sm">Loading products…</div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12 px-6">
                  <p className="text-4xl mb-2">📦</p>
                  <p className="text-sm font-medium text-[rgba(26,26,22,0.6)]">No products yet</p>
                  <p className="text-xs text-[rgba(26,26,22,0.35)] mb-4">Add products to start selling through Aria POS.</p>
                  <a href="/pos/products" className="px-4 py-2 rounded-xl bg-[#1D9E75] text-white text-xs font-semibold hover:bg-[#179968] transition-colors">
                    Add products →
                  </a>
                </div>
              ) : (
                <div className="flex gap-3 h-full min-h-0">
                  <div className="flex-1 grid grid-cols-3 gap-2 auto-rows-[minmax(100px,auto)] content-start">
                    {displayKeys.map(k => (
                      <KeyTile key={k.id} label={k.label} color={k.color} icon={k.icon}
                        onClick={() => {
                          if (k.type === 'function') handleKeyTile(k.function_name);
                          else if (k.type === 'product' && k.product_id) {
                            const p = products.find(p => p.id === k.product_id);
                            if (p) addToCart(p);
                          }
                        }}
                      />
                    ))}
                    <button
                      onClick={() => { if (cart.length) { setPayMethod('eftpos'); setShowPayModal(true); } }}
                      className="col-span-1 row-span-2 rounded-xl flex flex-col items-center justify-center gap-2 text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.97] shadow-sm"
                      style={{ background: 'linear-gradient(135deg,#7B0000,#B71C1C)', minHeight: '208px' }}>
                      <CardIcon className="w-8 h-8" />
                      <span>EFTPOS</span>
                    </button>
                  </div>
                  <div className="w-[80px] flex flex-col gap-2">
                    {DENOM_KEYS.map(d => (
                      <button key={d.label}
                        onClick={() => setCashTendered(prev => ((parseFloat(prev) || 0) + d.amount).toFixed(2))}
                        className="flex-1 min-h-[48px] rounded-xl flex items-center justify-center text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.97] shadow-sm"
                        style={{ backgroundColor: d.color }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {parkedSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
                  <div className="w-12 h-12 rounded-full bg-[rgba(0,0,0,0.05)] flex items-center justify-center mb-2">
                    <PauseIcon className="w-6 h-6 text-[rgba(26,26,22,0.3)]" />
                  </div>
                  <p className="text-sm font-medium text-[rgba(26,26,22,0.5)]">No parked sales</p>
                  <p className="text-xs text-[rgba(26,26,22,0.35)]">Press F8 to park the current sale</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {parkedSales.map(p => (
                    <button key={p.id} onClick={() => restoreParked(p)}
                      className="w-full flex items-center gap-3 p-4 bg-white border border-[rgba(0,0,0,0.08)] rounded-xl hover:border-[#2563eb] hover:bg-[rgba(37,99,235,0.03)] transition-all text-left">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1a1a16]">{p.label || 'Parked Sale'}</p>
                        <p className="text-[11px] text-[rgba(26,26,22,0.4)] mt-0.5">
                          {Array.isArray(p.items) ? p.items.length : 0} items ·{' '}
                          {new Date(p.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-[#1a1a16]">${(p.total || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-[#2563eb] mt-0.5">Restore →</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Cart (30%) */}
        <div className="flex flex-col flex-[3] overflow-hidden bg-white">
          {/* Customer selector */}
          <div className="px-4 pt-4 pb-3 border-b border-[rgba(0,0,0,0.07)] flex-shrink-0">
            {customer ? (
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-[rgba(37,99,235,0.1)] flex items-center justify-center text-[12px] font-bold text-[#2563eb] flex-shrink-0">
                  {customer.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1a1a16] truncate">{customer.name}</p>
                  <p className="text-[10px] text-[rgba(26,26,22,0.4)]">{customer.loyalty_points} pts · ${customer.total_spent.toFixed(0)} spent</p>
                </div>
                <button onClick={() => { setCustomer(null); setCustomerSearch(''); }}
                  className="text-[rgba(26,26,22,0.3)] hover:text-[rgba(26,26,22,0.7)] transition-colors text-xl leading-none">×</button>
              </div>
            ) : (
              <div className="relative">
                <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                  placeholder="+ Add Customer"
                  className="w-full border border-[rgba(0,0,0,0.1)] rounded-lg px-3 py-2 text-xs outline-none focus:border-[#2563eb] transition-colors placeholder:text-[rgba(26,26,22,0.35)]" />
                {customerResults.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-[rgba(0,0,0,0.1)] rounded-xl shadow-xl z-50 overflow-hidden">
                    {customerResults.map(c => (
                      <button key={c.id}
                        onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[rgba(37,99,235,0.05)] text-left border-b border-[rgba(0,0,0,0.05)] last:border-0 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-[#1a1a16] truncate">{c.name}</p>
                          <p className="text-[10px] text-[rgba(26,26,22,0.4)]">{c.phone ?? c.email ?? ''}</p>
                        </div>
                        <span className="text-[10px] text-[rgba(26,26,22,0.3)] flex-shrink-0">{c.loyalty_points} pts</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8 gap-2">
                <div className="w-12 h-12 rounded-full bg-[rgba(0,0,0,0.04)] flex items-center justify-center mb-1">
                  <BagOutlineIcon className="w-6 h-6 text-[rgba(26,26,22,0.2)]" />
                </div>
                <p className="text-sm text-[rgba(26,26,22,0.35)]">Scan or tap a product to start</p>
              </div>
            ) : (
              <div className="divide-y divide-[rgba(0,0,0,0.05)]">
                {cart.map(item => (
                  <div key={item.product.id}
                    onClick={() => setSelectedItem(item.product.id)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${selectedItem === item.product.id ? 'bg-[rgba(37,99,235,0.05)]' : 'hover:bg-[rgba(0,0,0,0.02)]'}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-semibold text-[#1a1a16] leading-snug">{item.product.name}</p>
                        <p className="text-[11px] text-[rgba(26,26,22,0.4)] mt-0.5">${item.product.price.toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={e => { e.stopPropagation(); updateQty(item.product.id, item.qty - 1); }}
                          className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] transition-colors text-sm leading-none">−</button>
                        <span className="text-sm font-semibold text-[#1a1a16] w-5 text-center">{item.qty}</span>
                        <button onClick={e => { e.stopPropagation(); updateQty(item.product.id, item.qty + 1); }}
                          className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] transition-colors text-sm leading-none">+</button>
                      </div>
                      <p className="text-[12.5px] font-bold text-[#1a1a16] flex-shrink-0">${(item.product.price * item.qty).toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Aria Staff Assist — real-time prompts based on cart */}
          {businessId && (
            <AriaSellAssistant
              businessId={businessId}
              cart={cart}
              lastAddedProductId={lastAddedId}
              customerId={customer?.id ?? null}
            />
          )}

          {/* Often bought together suggestions */}
          <SuggestionsBar cart={cart} onAdd={addToCart} />

          {/* Totals */}
          <div className="border-t border-[rgba(0,0,0,0.07)] px-4 py-3 flex-shrink-0 space-y-1.5">
            <div className="flex justify-between text-xs text-[rgba(26,26,22,0.5)]">
              <span>{cart.reduce((s, i) => s + i.qty, 0)} Products</span>
              <span className="text-[#1D9E75]">Savings: $0.00</span>
            </div>
            <div className="flex justify-between text-xs text-[rgba(26,26,22,0.4)]">
              <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[rgba(26,26,22,0.4)]">
              <span>GST (10%)</span><span>${taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[15px] font-bold text-[#1a1a16] pt-1.5 border-t border-[rgba(0,0,0,0.07)]">
              <span>TOTAL</span><span>${total.toFixed(2)}</span>
            </div>
          </div>

          {/* Finalize */}
          <div className="px-3 pb-3 flex-shrink-0">
            {!registerIsOpen && !registerLoading && (
              <button
                onClick={() => setShowRegisterModal(true)}
                className="w-full h-14 rounded-xl bg-[#1D9E75] hover:bg-[#179968] text-white font-bold text-sm tracking-widest uppercase transition-colors mb-2">
                OPEN REGISTER
              </button>
            )}
            <button
              onClick={() => { if (cart.length && registerIsOpen) setShowPayModal(true); }}
              disabled={!cart.length || !registerIsOpen}
              title={!registerIsOpen ? 'Open the register first' : ''}
              className="w-full h-14 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[rgba(0,0,0,0.08)] disabled:text-[rgba(26,26,22,0.3)] text-white font-bold text-sm tracking-widest uppercase transition-colors">
              {!registerIsOpen && !registerLoading ? 'REGISTER CLOSED' : 'FINALIZE'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Open Register Modal ──────────────────────────────────── */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#1a1a16]">Open Register</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">Enter your opening float to start trading.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,0.5)] block mb-1.5">Opening float (A$)</label>
                <input
                  type="number" min="0" step="0.01" value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                  className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#1D9E75] transition-colors"
                  autoFocus
                />
              </div>
              {registerError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowRegisterModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm text-[rgba(26,26,22,0.5)] hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                Cancel
              </button>
              <button onClick={openRegister} disabled={openingRegister}
                className="flex-1 py-2.5 rounded-xl bg-[#1D9E75] hover:bg-[#179968] text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {openingRegister ? <><Spinner /> Opening…</> : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Close Register Modal ─────────────────────────────────── */}
      {showCloseModal && registerSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#1a1a16]">Close Register</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">
                Opened at {new Date(registerSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · Float: A${(registerSession.opening_float || 0).toFixed(2)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,0.5)] block mb-1.5">Closing float counted (A$)</label>
                <input
                  type="number" min="0" step="0.01" value={closingFloat}
                  onChange={e => setClosingFloat(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb] transition-colors"
                  autoFocus
                />
              </div>
              {registerError && (
                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowCloseModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm text-[rgba(26,26,22,0.5)] hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                Cancel
              </button>
              <button onClick={closeRegister} disabled={closingRegister}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {closingRegister ? <><Spinner /> Closing…</> : 'Close Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(0,0,0,0.08)]">
              <div>
                <h2 className="text-base font-bold text-[#1a1a16]">Payment</h2>
                <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">{cart.reduce((s,i)=>s+i.qty,0)} items · ${total.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowPayModal(false)}
                className="w-8 h-8 rounded-full hover:bg-[rgba(0,0,0,0.06)] flex items-center justify-center text-[rgba(26,26,22,0.4)] text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                {(['eftpos', 'cash', 'split'] as const).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
                      payMethod === m ? 'bg-[#2563eb] text-white' : 'bg-[rgba(0,0,0,0.05)] text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.09)]'
                    }`}>
                    {m === 'eftpos' ? 'EFTPOS' : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>

              <div className="bg-[#f5f4ef] rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-xs text-[rgba(26,26,22,0.5)]">Amount due</span>
                <span className="text-xl font-bold text-[#1a1a16]">${total.toFixed(2)}</span>
              </div>

              {payMethod === 'cash' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[rgba(26,26,22,0.5)] block mb-1.5">Cash tendered</label>
                    <input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb] transition-colors" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[...new Set([total, Math.ceil(total/5)*5, Math.ceil(total/10)*10, Math.ceil(total/20)*20])].map(v => (
                      <button key={v} onClick={() => setCashTendered(v.toFixed(2))}
                        className="py-2 rounded-lg text-xs font-semibold bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.09)] text-[rgba(26,26,22,0.7)] transition-colors">
                        ${v.toFixed(2)}
                      </button>
                    ))}
                  </div>
                  {tendered >= total && (
                    <div className="flex justify-between items-center bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl px-4 py-3">
                      <span className="text-xs font-medium text-[#1D9E75]">Change</span>
                      <span className="text-xl font-bold text-[#1D9E75]">${change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              {payMethod === 'eftpos' && (
                <div className="bg-[rgba(37,99,235,0.05)] border border-[rgba(37,99,235,0.15)] rounded-xl px-4 py-4 text-center">
                  <CardIcon className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                  <p className="text-sm text-[rgba(26,26,22,0.6)]">Process <span className="font-bold text-[#1a1a16]">${total.toFixed(2)}</span> on EFTPOS terminal</p>
                </div>
              )}

              {payMethod === 'split' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[rgba(26,26,22,0.5)] block mb-1.5">Cash portion</label>
                    <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb] transition-colors" />
                  </div>
                  <div className="flex justify-between items-center bg-[rgba(37,99,235,0.05)] rounded-xl px-4 py-3">
                    <span className="text-xs text-[rgba(26,26,22,0.5)]">EFTPOS remainder</span>
                    <span className="text-base font-bold text-[#2563eb]">${splitCardAmt.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <button
                onClick={processSale}
                disabled={processing || (payMethod === 'cash' && cashTendered !== '' && tendered < total)}
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold text-sm tracking-wide uppercase transition-colors flex items-center justify-center gap-2">
                {processing ? <><Spinner /> Processing…</> : `Process ${payMethod === 'eftpos' ? 'EFTPOS' : payMethod === 'cash' ? 'Cash' : 'Split'} Payment`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 text-center border-b border-[rgba(0,0,0,0.08)]">
              <div className="w-12 h-12 rounded-full bg-[rgba(29,158,117,0.1)] flex items-center justify-center mx-auto mb-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth={2.5} className="w-6 h-6">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-[#1a1a16]">Sale Complete</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-1">
                {showReceipt.sale_number} · ${showReceipt.total_amount?.toFixed(2)}
              </p>
            </div>
            <div className="px-6 py-4 space-y-2">
              <button onClick={() => window.print()}
                className="w-full py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm font-medium text-[rgba(26,26,22,0.7)] hover:bg-[rgba(0,0,0,0.03)] transition-colors">
                Print Receipt
              </button>
              <button onClick={() => setShowReceipt(null)}
                className="w-full py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold hover:bg-[#1d4ed8] transition-colors">
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AI suggestions bar ────────────────────────────────────────── */
function SuggestionsBar({ cart, onAdd }: { cart: CartItem[]; onAdd: (p: Product) => void }) {
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; price: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (cart.length === 0) { setSuggestions([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/aria/pos-suggestions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_ids: cart.map(i => i.product.id) }),
        }).then(r => r.json());
        setSuggestions(res.suggestions ?? []);
      } catch { /* silent */ }
    }, 800);
    return () => clearTimeout(timerRef.current);
  }, [cart.map(i => i.product.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 py-2 border-t border-[rgba(0,0,0,0.05)] bg-[rgba(37,99,235,0.02)]">
      <p className="text-[10px] text-[rgba(26,26,22,0.4)] mb-1.5">Often bought together</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {suggestions.map(s => (
          <button key={s.id} onClick={() => onAdd(s as unknown as Product)}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg border border-[rgba(0,0,0,.1)] bg-white text-xs font-medium text-[#1a1a16] hover:border-[#2563eb] transition-colors whitespace-nowrap">
            + {s.name} <span className="text-[rgba(26,26,22,.4)] ml-1">A${s.price?.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─── Key tile ───────────────────────────────────────────────────── */
function KeyTile({ label, color, icon, onClick }: { label: string; color: string; icon: string | null; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="rounded-xl flex flex-col items-center justify-center gap-2 text-white font-semibold text-xs transition-all hover:opacity-90 active:scale-[0.97] shadow-sm px-2"
      style={{ backgroundColor: color, minHeight: '100px' }}>
      <TileIcon icon={icon} />
      <span className="text-center leading-tight">{label}</span>
    </button>
  );
}

function TileIcon({ icon }: { icon: string | null }) {
  const cls = 'w-6 h-6';
  switch (icon) {
    case 'x':      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case 'box':    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls}><path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/></svg>;
    case 'minus':  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'plus':   return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'folder': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>;
    case 'hand':   return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls}><path d="M18 11V8a2 2 0 00-4 0v3M14 8V6a2 2 0 00-4 0v2M10 7a2 2 0 00-4 0v5M6 12v-1"/><path d="M6 12c0 3.314 2.686 6 6 6s6-2.686 6-6"/></svg>;
    case 'dollar': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
    default:       return <svg viewBox="0 0 24 24" fill="currentColor" className={cls}><circle cx="12" cy="12" r="4"/></svg>;
  }
}

function SearchIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function CardIcon({ className }: { className?: string })   { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function BagOutlineIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>; }
function PauseIcon({ className }: { className?: string })  { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>; }
function Spinner() { return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>; }
