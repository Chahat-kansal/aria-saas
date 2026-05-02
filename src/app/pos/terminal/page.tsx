'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
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

interface Modifier { id: string; name: string; price_adjustment: number; modifier_group: string | null; }
interface VariantGroup { id: string; name: string; values: string[]; affects_price: boolean; price_map: Record<string,number>; }
interface ModifierLink { id: string; modifier_id: string; pos_modifiers: Modifier; }

interface CartItem {
  product: Product; qty: number; discount_percent?: number;
  label?: string;            // "Large · Oat milk"
  variantLabel?: string;     // "Large"
  modifierDetails?: Modifier[];
  unitPrice: number;         // effective price after variant/modifier adjustments
}

interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; total_spent: number; }
interface ParkedSale { id: string; label: string | null; items: CartItem[]; total: number; customer_id: string | null; created_at: string; }
interface SaleKey { id: string; label: string; color: string; icon: string | null; type: string; function_name: string | null; product_id: string | null; position: number; }
interface RegisterSession { id: string; status: string; opening_float: number; opened_at: string; opened_by: string | null; }

interface VariantModalState {
  product: Product;
  variantGroups: VariantGroup[];
  modifiers: Modifier[];
}

interface AriaChatMsg { role: 'user' | 'aria'; text: string; ts: number; }

/* ─── Constants ─────────────────────────────────────────────────── */
const DEFAULT_KEYS: Omit<SaleKey, 'id'>[] = [
  { label: 'Clear Sale', color: '#8B7355', icon: 'x',      type: 'function', function_name: 'clear',      position: 0, product_id: null },
  { label: '– Qty',      color: '#9E9E9E', icon: 'minus',  type: 'function', function_name: 'minus_qty',  position: 1, product_id: null },
  { label: '+ Qty',      color: '#9E9E9E', icon: 'plus',   type: 'function', function_name: 'plus_qty',   position: 2, product_id: null },
  { label: 'Exact Cash', color: '#C4956A', icon: 'dollar', type: 'function', function_name: 'exact_cash', position: 3, product_id: null },
];
const DENOM_KEYS = [
  { label: '$1',   color: '#D4B800', amount: 1   }, { label: '$2',   color: '#D4B800', amount: 2   },
  { label: '$5',   color: '#E75480', amount: 5   }, { label: '$10',  color: '#2196F3', amount: 10  },
  { label: '$20',  color: '#EF9F27', amount: 20  }, { label: '$50',  color: '#FF7043', amount: 50  },
  { label: '$100', color: '#66BB6A', amount: 100 },
];
const CART_SESSION_KEY = 'aria_pos_cart_v1';

type PayMethod = 'cash' | 'eftpos' | 'split';

/* ─── Cash rounding (Australian 5-cent) ──────────────────────────── */
function roundCash(amount: number): number {
  return Math.round(amount * 20) / 20;
}

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
  const [activeTab,       setActiveTab]       = useState<'keys' | 'parked'>('keys');
  const [showPayModal,    setShowPayModal]    = useState(false);
  const [showReceipt,     setShowReceipt]     = useState<any>(null);
  const [payMethod,       setPayMethod]       = useState<PayMethod>('eftpos');
  const [cashTendered,    setCashTendered]    = useState('');
  const [splitCash,       setSplitCash]       = useState('');
  const [processing,      setProcessing]      = useState(false);
  const [loading,         setLoading]         = useState(true);
  const [lastAddedId,     setLastAddedId]     = useState<string | null>(null);
  const [businessId,      setBusinessId]      = useState<string | null>(null);
  const [businessName,    setBusinessName]    = useState<string>('AriaPOS');
  const [lowStockItems,   setLowStockItems]   = useState<Product[]>([]);
  const [lowStockDismissed, setLowStockDismissed] = useState(false);

  // Register
  const [registerSession,   setRegisterSession]   = useState<RegisterSession | null>(null);
  const [registerLoading,   setRegisterLoading]   = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [openingFloat,      setOpeningFloat]      = useState('200');
  const [openingRegister,   setOpeningRegister]   = useState(false);
  const [closingRegister,   setClosingRegister]   = useState(false);
  const [showCloseModal,    setShowCloseModal]    = useState(false);
  const [closingFloat,      setClosingFloat]      = useState('');
  const [registerError,     setRegisterError]     = useState<string | null>(null);

  // Variant/modifier modal
  const [variantModal,     setVariantModal]     = useState<VariantModalState | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedMods,     setSelectedMods]     = useState<Record<string, boolean>>({});
  const [variantQty,       setVariantQty]       = useState(1);
  const [variantLoading,   setVariantLoading]   = useState(false);

  // Missed sale modal
  const [showMissedModal,  setShowMissedModal]  = useState(false);
  const [missedName,       setMissedName]       = useState('');
  const [missedQty,        setMissedQty]        = useState('1');
  const [missedNote,       setMissedNote]       = useState('');
  const [savingMissed,     setSavingMissed]     = useState(false);

  // Aria chat panel
  const [showAriaChat,    setShowAriaChat]    = useState(false);
  const [chatInput,       setChatInput]       = useState('');
  const [chatMessages,    setChatMessages]    = useState<AriaChatMsg[]>([]);
  const [chatLoading,     setChatLoading]     = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const searchRef     = useRef<HTMLInputElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeTs     = useRef<number>(0);

  /* ── sessionStorage cart persistence ─────────────────────────── */
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CART_SESSION_KEY);
      if (saved) setCart(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(CART_SESSION_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  /* ── Register session load ─────────────────────────────────────── */
  const loadRegister = useCallback(async () => {
    setRegisterLoading(true);
    try {
      const res = await fetch('/api/pos/sessions');
      if (res.ok) { const d = await res.json(); setRegisterSession(d.openSession ?? null); }
    } catch { /* silent */ }
    setRegisterLoading(false);
  }, []);

  /* ── Initial data load ─────────────────────────────────────────── */
  useEffect(() => {
    loadRegister();
    Promise.all([
      fetch('/api/pos/products').then(r => r.json()),
      fetch('/api/pos/park').then(r => r.json()),
    ]).then(([prod, park]) => {
      if (prod.business_id) setBusinessId(prod.business_id);
      if (prod.business_name) setBusinessName(prod.business_name);
      const prods: Product[] = prod.products || [];
      setProducts(prods);
      setSaleKeys(prod.sale_keys || []);
      setParkedSales(park.parked_sales || []);
      setLowStockItems(prods.filter(p => p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [loadRegister]);

  /* ── Ctrl+K → open Aria chat ────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setShowAriaChat(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Customer display sync ──────────────────────────────────── */
  useEffect(() => {
    try {
      localStorage.setItem('aria_pos_display_state', JSON.stringify({
        business_name: businessName,
        cart: cart.map(i => ({ name: i.label ?? i.product.name, qty: i.qty, price: i.unitPrice })),
        total: cart.reduce((s, i) => s + i.unitPrice * i.qty, 0),
        customer_name: customer?.name ?? null,
        status: showReceipt ? 'complete' : cart.length > 0 ? 'sale_in_progress' : 'idle',
        complete_message: showReceipt ? `Thank you${customer ? `, ${customer.name}` : ''}!` : null,
      }));
    } catch { /* ignore */ }
  }, [cart, customer, showReceipt, businessName]);

  /* ── Barcode scanner ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target === searchRef.current) return;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
      if (showAriaChat) return;
      const now = Date.now();
      if (e.key === 'Enter') {
        const code = barcodeBuffer.current.trim();
        barcodeBuffer.current = '';
        if (code.length >= 4) {
          const hit = products.find(p => p.barcode === code || p.sku === code);
          if (hit && hit.is_active && (!hit.track_stock || hit.stock_quantity > 0)) checkAndAddToCart(hit);
        }
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F8') { e.preventDefault(); parkSale(); return; }
      if (e.key === 'Escape') { if (!showPayModal && !variantModal) confirmClear(); return; }
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
  }, [products, showPayModal, variantModal, showAriaChat]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Product search ─────────────────────────────────────────── */
  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const q = search.toLowerCase();
    setSearchResults(products.filter(p =>
      p.is_active && (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      )
    ).slice(0, 8));
  }, [search, products]);

  /* ── Customer search ────────────────────────────────────────── */
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);
  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  /* ── Scroll Aria chat to bottom ─────────────────────────────── */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  /* ── Check for variants/modifiers before adding to cart ─────── */
  async function checkAndAddToCart(p: Product) {
    if (!p.is_active) return;
    setVariantLoading(true);
    try {
      const res = await fetch(`/api/pos/variants?product_id=${p.id}`);
      if (res.ok) {
        const d = await res.json();
        const groups: VariantGroup[] = d.variants ?? [];
        const modLinks: ModifierLink[] = d.modifiers ?? [];
        const mods = modLinks.map(l => l.pos_modifiers).filter(Boolean);
        if (groups.length > 0 || mods.length > 0) {
          setVariantModal({ product: p, variantGroups: groups, modifiers: mods });
          setSelectedVariants({});
          setSelectedMods({});
          setVariantQty(1);
          setVariantLoading(false);
          return;
        }
      }
    } catch { /* silent — fall through to direct add */ }
    setVariantLoading(false);
    addToCartDirect(p, 1, undefined, undefined, []);
  }

  function addToCartDirect(p: Product, qty: number, variantLabel?: string, label?: string, mods: Modifier[] = []) {
    const modPrice = mods.reduce((s, m) => s + (m.price_adjustment ?? 0), 0);
    const unitPrice = p.price + modPrice;
    const fullLabel = label ?? (variantLabel ? `${p.name} · ${variantLabel}` : p.name);

    setCart(c => {
      // Match by product + label combination (same product different modifiers = separate line)
      const key = `${p.id}::${fullLabel}`;
      const hit = c.find(i => `${i.product.id}::${i.label ?? i.product.name}` === key);
      if (hit) return c.map(i => `${i.product.id}::${i.label ?? i.product.name}` === key ? { ...i, qty: i.qty + qty } : i);
      return [...c, { product: p, qty, label: fullLabel !== p.name ? fullLabel : undefined, variantLabel, modifierDetails: mods, unitPrice, discount_percent: 0 }];
    });
    setSelectedItem(p.id);
    setLastAddedId(p.id);
    setSearch(''); setSearchResults([]);
  }

  /* ── Confirm variant/modifier selection ─────────────────────── */
  function confirmVariantSelection() {
    if (!variantModal) return;
    const p = variantModal.product;
    const variantParts: string[] = [];
    let priceDelta = 0;

    for (const g of variantModal.variantGroups) {
      const sel = selectedVariants[g.id];
      if (sel) {
        variantParts.push(sel);
        if (g.affects_price && g.price_map[sel] != null) {
          priceDelta += g.price_map[sel] - p.price;
        }
      }
    }

    const selectedModList = variantModal.modifiers.filter(m => selectedMods[m.id]);
    const modParts = selectedModList.map(m => m.name);
    const allParts = [...variantParts, ...modParts];
    const label = allParts.length > 0 ? `${p.name} · ${allParts.join(' · ')}` : p.name;

    const effectivePrice = Math.max(0, p.price + priceDelta + selectedModList.reduce((s, m) => s + (m.price_adjustment ?? 0), 0));
    const fakeProduct = { ...p, price: effectivePrice };

    addToCartDirect(fakeProduct, variantQty, variantParts.join(' / ') || undefined, label, selectedModList);
    setVariantModal(null);
  }

  /* ── Aria chat ─────────────────────────────────────────────── */
  async function sendAriaChat() {
    if (!chatInput.trim() || chatLoading || !businessId) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/aria/pos-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          message: msg,
          cart_context: cart.length > 0 ? { items: cart.map(i => ({ name: i.label ?? i.product.name, qty: i.qty, price: i.unitPrice })), total_cents: Math.round(total * 100) } : null,
        }),
      });
      const d = await res.json();
      setChatMessages(m => [...m, { role: 'aria', text: d.reply ?? 'Sorry, I couldn\'t process that right now.', ts: Date.now() }]);
    } catch {
      setChatMessages(m => [...m, { role: 'aria', text: 'Connection error — try again.', ts: Date.now() }]);
    }
    setChatLoading(false);
  }

  /* ── Cart helpers ───────────────────────────────────────────── */
  function addToCart(p: Product) { checkAndAddToCart(p); }

  function updateQty(key: string, qty: number) {
    if (qty <= 0) setCart(c => c.filter(i => cartKey(i) !== key));
    else setCart(c => c.map(i => cartKey(i) === key ? { ...i, qty } : i));
  }

  function cartKey(i: CartItem) { return `${i.product.id}::${i.label ?? i.product.name}`; }

  function confirmClear() {
    if (!cart.length) return;
    if (confirm('Clear the current sale?')) clearSale();
  }

  function clearSale() {
    setCart([]); setCustomer(null); setSelectedItem(null);
    setCashTendered(''); setSplitCash(''); setCustomerSearch('');
    try { sessionStorage.removeItem(CART_SESSION_KEY); } catch { /* ignore */ }
    searchRef.current?.focus();
  }

  /* ── Calculations ───────────────────────────────────────────── */
  const subtotal  = cart.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);
  const taxAmount = subtotal - subtotal / 1.1; // GST-inclusive: GST = total - (total/1.1)
  const netAmount = subtotal / 1.1;
  const total     = subtotal;
  const tendered  = parseFloat(cashTendered) || 0;
  // Australian 5-cent cash rounding
  const roundedTotal  = payMethod === 'cash' ? roundCash(total) : total;
  const change        = payMethod === 'cash' && tendered >= roundedTotal ? tendered - roundedTotal : 0;
  const splitCardAmt  = payMethod === 'split' ? Math.max(0, total - (parseFloat(splitCash) || 0)) : 0;

  /* ── Sale key tile action ───────────────────────────────────── */
  function handleKeyTile(fn: string | null) {
    if (!fn) return;
    switch (fn) {
      case 'clear':      confirmClear(); break;
      case 'exact_cash': setPayMethod('cash'); setCashTendered(roundedTotal.toFixed(2)); break;
      case 'minus_qty':  if (selectedItem) { const item = cart.find(i => i.product.id === selectedItem); if (item) updateQty(cartKey(item), item.qty - 1); } break;
      case 'plus_qty':   if (selectedItem) { const item = cart.find(i => i.product.id === selectedItem); if (item) updateQty(cartKey(item), item.qty + 1); } break;
    }
  }

  /* ── Park sale ──────────────────────────────────────────────── */
  async function parkSale() {
    if (!cart.length) return;
    const label = prompt('Label for parked sale (optional):') ?? undefined;
    await fetch('/api/pos/park', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, items: cart, customer_id: customer?.id ?? null, subtotal: +subtotal.toFixed(2), total: +total.toFixed(2) }) });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    clearSale();
  }

  /* ── Restore parked sale ────────────────────────────────────── */
  async function restoreParked(p: ParkedSale) {
    setCart(p.items);
    await fetch(`/api/pos/park?id=${p.id}`, { method: 'DELETE' });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    setActiveTab('keys');
  }

  /* ── Open/close register ────────────────────────────────────── */
  async function openRegister() {
    setOpeningRegister(true); setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opening_float: parseFloat(openingFloat) || 0 }) });
      const d = await res.json();
      if (!res.ok) { setRegisterError(d.error ?? 'Failed to open register'); setOpeningRegister(false); return; }
      await loadRegister(); setShowRegisterModal(false);
    } catch { setRegisterError('Failed to open register — check connection'); }
    setOpeningRegister(false);
  }

  async function closeRegister() {
    if (!registerSession) return;
    setClosingRegister(true); setRegisterError(null);
    try {
      const res = await fetch('/api/pos/sessions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: registerSession.id, closing_float: parseFloat(closingFloat) || 0 }) });
      if (!res.ok) { const d = await res.json(); setRegisterError(d.error ?? 'Failed to close register'); setClosingRegister(false); return; }
      await loadRegister(); setShowCloseModal(false); setClosingFloat('');
    } catch { setRegisterError('Failed to close register — check connection'); }
    setClosingRegister(false);
  }

  /* ── Process sale ───────────────────────────────────────────── */
  async function processSale() {
    if (!cart.length || processing) return;
    setProcessing(true);
    try {
      const outletId = typeof window !== 'undefined' ? localStorage.getItem('pos_outlet_id') || null : null;
      const r = await fetch('/api/pos/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(i => ({
            product_id: i.product.id, product_name: i.label ?? i.product.name, product_sku: i.product.sku,
            quantity: i.qty, unit_price: i.unitPrice, tax_rate: i.product.tax_rate ?? 10,
            discount_percent: i.discount_percent ?? 0,
            line_total: +(i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100)).toFixed(2),
            variant_label: i.variantLabel ?? null,
            modifiers: i.modifierDetails?.map(m => ({ id: m.id, name: m.name, price_cents: Math.round(m.price_adjustment * 100) })) ?? [],
          })),
          customer_id: customer?.id ?? null, payment_method: payMethod,
          subtotal: +subtotal.toFixed(2), tax_amount: +taxAmount.toFixed(2),
          discount_amount: 0, total_amount: +roundedTotal.toFixed(2),
          cash_tendered: payMethod === 'cash' ? tendered : null,
          change_given: payMethod === 'cash' ? +change.toFixed(2) : null,
          split_cash: payMethod === 'split' ? parseFloat(splitCash) || 0 : null,
          split_card: payMethod === 'split' ? +splitCardAmt.toFixed(2) : null,
          outlet_id: outletId, session_id: registerSession?.id ?? null,
        }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setProducts(ps => ps.map(p => {
        const item = cart.find(i => i.product.id === p.id);
        if (!item || !p.track_stock) return p;
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - item.qty) };
      }));
      setShowPayModal(false);
      setShowReceipt({ ...d.sale, cartSnapshot: cart, customerSnapshot: customer, businessName });
      clearSale();
    } finally { setProcessing(false); }
  }

  /* ── Render ─────────────────────────────────────────────────── */
  const displayKeys = saleKeys.length ? saleKeys : DEFAULT_KEYS.map((k, i) => ({ ...k, id: `default-${i}` }));
  const registerIsOpen = !!registerSession;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#f5f4ef]" style={{ position: 'relative' }}>

      {/* ── Low stock alert bar ─────────────────────────────────── */}
      {lowStockItems.length > 0 && !lowStockDismissed && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3">
          <span className="text-amber-600 text-xs font-semibold flex-1">
            ⚡ {lowStockItems.length} product{lowStockItems.length > 1 ? 's' : ''} running low:{' '}
            {lowStockItems.slice(0, 3).map(p => p.name).join(', ')}{lowStockItems.length > 3 ? ' …' : ''}
          </span>
          <a href="/pos/orders" className="text-xs text-amber-700 underline font-medium">Order now</a>
          <button onClick={() => setLowStockDismissed(true)} className="text-amber-400 hover:text-amber-600 text-lg leading-none">×</button>
        </div>
      )}

      {/* ── Top bar ────────────────────────────────────────────── */}
      <div className="bg-[#1a1a1a] px-4 py-2.5 flex items-center gap-3 flex-shrink-0 relative z-30">
        <button
          onClick={() => registerIsOpen ? setShowCloseModal(true) : setShowRegisterModal(true)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
            registerLoading ? 'bg-[rgba(255,255,255,0.08)] text-[rgba(255,255,255,0.4)]' :
            registerIsOpen  ? 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75] hover:bg-[rgba(29,158,117,0.25)]' :
                              'bg-[rgba(239,68,68,0.15)] text-red-400 hover:bg-[rgba(239,68,68,0.25)]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${registerLoading ? 'bg-[rgba(255,255,255,0.3)]' : registerIsOpen ? 'bg-[#1D9E75]' : 'bg-red-400'}`} />
          {registerLoading ? 'Loading…' : registerIsOpen ? 'Register Open' : 'Register Closed'}
        </button>

        <div className="flex-1 relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.3)]" />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search products…  (F1)"
            className="w-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.1)] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder:text-[rgba(255,255,255,0.3)] outline-none focus:border-[rgba(255,255,255,0.25)] transition-colors" />
          {searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 right-0 bg-white rounded-xl border border-[rgba(0,0,0,0.1)] shadow-2xl z-50 overflow-hidden">
              {searchResults.map(p => (
                <button key={p.id} onClick={() => addToCart(p)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[rgba(37,99,235,0.05)] transition-colors text-left border-b border-[rgba(0,0,0,0.05)] last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#1a1a16] truncate">{p.name}</p>
                    <p className="text-[11px] text-[rgba(26,26,22,0.4)]">
                      {p.sku ?? ''}{p.barcode ? ` · ${p.barcode}` : ''}
                      {p.track_stock && <span className={`ml-2 ${p.stock_quantity === 0 ? 'text-red-500' : p.stock_quantity <= p.low_stock_threshold ? 'text-amber-500' : 'text-[rgba(26,26,22,0.3)]'}`}>
                        {p.stock_quantity === 0 ? '⚠ Out of stock' : p.stock_quantity <= p.low_stock_threshold ? `⚡ Low: ${p.stock_quantity}` : `${p.stock_quantity} in stock`}
                      </span>}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-[#1a1a16] flex-shrink-0">A${p.price.toFixed(2)}</p>
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

        {/* Missed sale button */}
        <button onClick={() => setShowMissedModal(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
          style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.2)' }}
          title="Log a product customer asked for">
          Missed sale
        </button>

        {/* Aria chat toggle */}
        <button onClick={() => setShowAriaChat(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
            showAriaChat ? 'bg-[#1D9E75] text-white' : 'bg-[rgba(29,158,117,0.15)] text-[#1D9E75] hover:bg-[rgba(29,158,117,0.25)]'}`}
          title="Ask Aria (Ctrl+K)">
          ✦ Aria
        </button>
        <kbd className="hidden sm:block text-[10px] text-[rgba(255,255,255,0.2)] border border-[rgba(255,255,255,0.1)] rounded px-1.5 py-0.5 flex-shrink-0">F8 park</kbd>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT PANEL — Sale keys */}
        <div className="flex flex-col flex-[7] overflow-hidden bg-white border-r border-[rgba(0,0,0,0.07)]">
          <div className="flex border-b border-[rgba(0,0,0,0.07)] flex-shrink-0">
            {(['keys', 'parked'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-xs font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? 'text-[#2563eb] border-[#2563eb]' : 'text-[rgba(26,26,22,0.45)] border-transparent hover:text-[#1a1a16]'}`}>
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
                  <a href="/pos/products" className="px-4 py-2 rounded-xl bg-[#1D9E75] text-white text-xs font-semibold">Add products →</a>
                </div>
              ) : (
                <div className="flex gap-3 h-full min-h-0">
                  <div className="flex-1 grid grid-cols-3 gap-2 auto-rows-[minmax(100px,auto)] content-start">
                    {displayKeys.map(k => (
                      <KeyTile key={k.id} label={k.label} color={k.color} icon={k.icon} onClick={() => {
                        if (k.type === 'function') handleKeyTile(k.function_name);
                        else if (k.type === 'product' && k.product_id) { const p = products.find(p => p.id === k.product_id); if (p) addToCart(p); }
                      }} />
                    ))}
                    <button onClick={() => { if (cart.length) { setPayMethod('eftpos'); setShowPayModal(true); } }}
                      className="col-span-1 row-span-2 rounded-xl flex flex-col items-center justify-center gap-2 text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.97] shadow-sm"
                      style={{ background: 'linear-gradient(135deg,#7B0000,#B71C1C)', minHeight: '208px' }}>
                      <CardIcon className="w-8 h-8" /><span>EFTPOS</span>
                    </button>
                  </div>
                  <div className="w-[80px] flex flex-col gap-2">
                    {DENOM_KEYS.map(d => (
                      <button key={d.label} onClick={() => setCashTendered(prev => ((parseFloat(prev) || 0) + d.amount).toFixed(2))}
                        className="flex-1 min-h-[48px] rounded-xl flex items-center justify-center text-white font-bold text-sm transition-all hover:opacity-90 active:scale-[0.97] shadow-sm"
                        style={{ backgroundColor: d.color }}>{d.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-4">
              {parkedSales.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-12">
                  <PauseIcon className="w-8 h-8 text-[rgba(26,26,22,0.2)] mb-2" />
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
                          {Array.isArray(p.items) ? p.items.length : 0} items · {new Date(p.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-[#1a1a16]">A${(p.total || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-[#2563eb] mt-0.5">Restore →</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Cart */}
        <div className="flex flex-col flex-[3] overflow-hidden bg-white">
          {/* Customer */}
          <div className="px-4 pt-3 pb-2.5 border-b border-[rgba(0,0,0,0.07)] flex-shrink-0">
            {customer ? (
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[rgba(37,99,235,0.1)] flex items-center justify-center text-[11px] font-bold text-[#2563eb] flex-shrink-0">{customer.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#1a1a16] truncate">{customer.name}</p>
                  <p className="text-[10px] text-[rgba(26,26,22,0.4)]">{customer.loyalty_points} pts</p>
                </div>
                <button onClick={() => { setCustomer(null); setCustomerSearch(''); }} className="text-[rgba(26,26,22,0.3)] hover:text-[rgba(26,26,22,0.7)] text-xl leading-none">×</button>
              </div>
            ) : (
              <div className="relative">
                <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="+ Add Customer"
                  className="w-full border border-[rgba(0,0,0,0.1)] rounded-lg px-3 py-1.5 text-xs outline-none focus:border-[#2563eb] transition-colors placeholder:text-[rgba(26,26,22,0.35)]" />
                {customerResults.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-[rgba(0,0,0,0.1)] rounded-xl shadow-xl z-50 overflow-hidden">
                    {customerResults.map(c => (
                      <button key={c.id} onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
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
                <BagOutlineIcon className="w-10 h-10 text-[rgba(26,26,22,0.15)] mb-1" />
                <p className="text-sm text-[rgba(26,26,22,0.35)]">Scan or tap a product to start</p>
              </div>
            ) : (
              <div className="divide-y divide-[rgba(0,0,0,0.05)]">
                {cart.map(item => {
                  const key = cartKey(item);
                  return (
                    <div key={key} onClick={() => setSelectedItem(item.product.id)}
                      className={`px-3 py-2.5 cursor-pointer transition-colors ${selectedItem === item.product.id ? 'bg-[rgba(37,99,235,0.05)]' : 'hover:bg-[rgba(0,0,0,0.02)]'}`}>
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12.5px] font-semibold text-[#1a1a16] leading-snug">
                            {item.label ?? item.product.name}
                          </p>
                          <p className="text-[11px] text-[rgba(26,26,22,0.4)] mt-0.5">A${item.unitPrice.toFixed(2)} each</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={e => { e.stopPropagation(); updateQty(key, item.qty - 1); }}
                            className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] text-sm leading-none">−</button>
                          <span className="text-sm font-semibold text-[#1a1a16] w-5 text-center">{item.qty}</span>
                          <button onClick={e => { e.stopPropagation(); updateQty(key, item.qty + 1); }}
                            className="w-6 h-6 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] text-sm leading-none">+</button>
                        </div>
                        <p className="text-[12.5px] font-bold text-[#1a1a16] flex-shrink-0">A${(item.unitPrice * item.qty).toFixed(2)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* AriaSellAssistant */}
          {businessId && (
            <AriaSellAssistant businessId={businessId} cart={cart} lastAddedProductId={lastAddedId} customerId={customer?.id ?? null} />
          )}

          {/* Totals */}
          <div className="border-t border-[rgba(0,0,0,0.07)] px-4 py-3 flex-shrink-0 space-y-1">
            <div className="flex justify-between text-xs text-[rgba(26,26,22,0.4)]">
              <span>Subtotal (excl. GST)</span><span>A${netAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs text-[rgba(26,26,22,0.4)]">
              <span>GST (10%)</span><span>A${taxAmount.toFixed(2)}</span>
            </div>
            {payMethod === 'cash' && Math.abs(roundedTotal - total) > 0.001 && (
              <div className="flex justify-between text-xs text-[rgba(26,26,22,0.4)]">
                <span>Cash rounding</span><span>{(roundedTotal - total) > 0 ? '+' : ''}A${(roundedTotal - total).toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-[15px] font-bold text-[#1a1a16] pt-1 border-t border-[rgba(0,0,0,0.07)]">
              <span>TOTAL</span><span>A${roundedTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Finalize */}
          <div className="px-3 pb-3 flex-shrink-0">
            {!registerIsOpen && !registerLoading && (
              <button onClick={() => setShowRegisterModal(true)}
                className="w-full h-12 rounded-xl bg-[#1D9E75] hover:bg-[#179968] text-white font-bold text-sm tracking-widest uppercase transition-colors mb-2">
                OPEN REGISTER
              </button>
            )}
            <button onClick={() => { if (cart.length && registerIsOpen) setShowPayModal(true); }}
              disabled={!cart.length || !registerIsOpen}
              className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:bg-[rgba(0,0,0,0.08)] disabled:text-[rgba(26,26,22,0.3)] text-white font-bold text-sm tracking-widest uppercase transition-colors">
              {!registerIsOpen && !registerLoading ? 'REGISTER CLOSED' : 'FINALIZE'}
            </button>
          </div>
        </div>

        {/* ── Aria Chat Panel ─────────────────────────────────── */}
        {showAriaChat && (
          <div className="flex flex-col w-64 bg-[#13131a] border-l border-[rgba(255,255,255,0.08)] flex-shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[rgba(255,255,255,0.07)]">
              <span className="text-xs font-semibold text-[#1D9E75]">✦ Ask Aria</span>
              <button onClick={() => setShowAriaChat(false)} className="text-[rgba(255,255,255,0.3)] hover:text-white text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
              {chatMessages.length === 0 && (
                <p className="text-[11px] text-[rgba(255,255,255,0.3)] text-center pt-4">
                  Ask me anything about products, stock, GST calculations, or today&apos;s sales.
                </p>
              )}
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-[11px] leading-snug ${
                    m.role === 'user' ? 'bg-[#2563eb] text-white' : 'bg-[rgba(255,255,255,0.06)] text-[rgba(255,255,255,0.8)]'
                  }`}>{m.text}</div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="bg-[rgba(255,255,255,0.06)] rounded-xl px-3 py-2 text-[11px] text-[rgba(255,255,255,0.4)]">
                    <span className="animate-pulse">Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-3 border-t border-[rgba(255,255,255,0.07)]">
              <div className="flex gap-2">
                <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAriaChat(); } }}
                  placeholder="Ask Aria…"
                  className="flex-1 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-[rgba(255,255,255,0.3)] outline-none focus:border-[#1D9E75]" />
                <button onClick={sendAriaChat} disabled={!chatInput.trim() || chatLoading}
                  className="px-2.5 py-1.5 rounded-lg bg-[#1D9E75] text-white text-xs disabled:opacity-40">↑</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}

      {/* Variant / Modifier selection modal */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.6)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#1a1a16]">{variantModal.product.name}</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">
                Base price A${variantModal.product.price.toFixed(2)} — select options below
              </p>
            </div>
            <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Variant groups */}
              {variantModal.variantGroups.map(g => (
                <div key={g.id}>
                  <p className="text-xs font-semibold text-[rgba(26,26,22,0.7)] mb-2">{g.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {(g.values as string[]).map(v => {
                      const priceNote = g.affects_price && g.price_map[v] != null ? ` · A$${g.price_map[v].toFixed(2)}` : '';
                      return (
                        <button key={v} onClick={() => setSelectedVariants(p => ({ ...p, [g.id]: v }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            selectedVariants[g.id] === v ? 'bg-[#2563eb] text-white' : 'bg-[rgba(0,0,0,0.05)] text-[rgba(26,26,22,0.7)] hover:bg-[rgba(0,0,0,0.09)]'}`}>
                          {v}{priceNote}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Modifiers */}
              {variantModal.modifiers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[rgba(26,26,22,0.7)] mb-2">Extras</p>
                  <div className="space-y-2">
                    {variantModal.modifiers.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={!!selectedMods[m.id]} onChange={e => setSelectedMods(p => ({ ...p, [m.id]: e.target.checked }))}
                          className="w-4 h-4 accent-[#2563eb]" />
                        <span className="text-xs text-[#1a1a16] flex-1">{m.name}</span>
                        {m.price_adjustment !== 0 && (
                          <span className="text-xs text-[rgba(26,26,22,0.5)]">
                            {m.price_adjustment > 0 ? '+' : ''}A${m.price_adjustment.toFixed(2)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Quantity */}
              <div>
                <p className="text-xs font-semibold text-[rgba(26,26,22,0.7)] mb-2">Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setVariantQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] text-lg leading-none">−</button>
                  <span className="text-base font-bold text-[#1a1a16] w-6 text-center">{variantQty}</span>
                  <button onClick={() => setVariantQty(q => q + 1)}
                    className="w-8 h-8 rounded-full bg-[rgba(0,0,0,0.07)] flex items-center justify-center text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.12)] text-lg leading-none">+</button>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setVariantModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm text-[rgba(26,26,22,0.5)]">Cancel</button>
              <button onClick={confirmVariantSelection}
                className="flex-1 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Register Modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#1a1a16]">Open Register</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">Enter opening float to start trading.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,0.5)] block mb-1.5">Opening float (A$)</label>
                <input type="number" min="0" step="0.01" value={openingFloat} onChange={e => setOpeningFloat(e.target.value)}
                  className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#1D9E75]" autoFocus />
              </div>
              {registerError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowRegisterModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm text-[rgba(26,26,22,0.5)]">Cancel</button>
              <button onClick={openRegister} disabled={openingRegister}
                className="flex-1 py-2.5 rounded-xl bg-[#1D9E75] text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {openingRegister ? <><Spinner /> Opening…</> : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register Modal */}
      {showCloseModal && registerSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,0.08)]">
              <h2 className="text-base font-bold text-[#1a1a16]">Close Register</h2>
              <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">
                Opened {new Date(registerSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · Float A${(registerSession.opening_float || 0).toFixed(2)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-[rgba(26,26,22,0.5)] block mb-1.5">Closing float counted (A$)</label>
                <input type="number" min="0" step="0.01" value={closingFloat} onChange={e => setClosingFloat(e.target.value)}
                  placeholder="0.00" className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb]" autoFocus />
              </div>
              {registerError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowCloseModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm text-[rgba(26,26,22,0.5)]">Cancel</button>
              <button onClick={closeRegister} disabled={closingRegister}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
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
                <p className="text-xs text-[rgba(26,26,22,0.45)] mt-0.5">{cart.reduce((s,i)=>s+i.qty,0)} items · A${roundedTotal.toFixed(2)}</p>
              </div>
              <button onClick={() => setShowPayModal(false)} className="w-8 h-8 rounded-full hover:bg-[rgba(0,0,0,0.06)] flex items-center justify-center text-[rgba(26,26,22,0.4)] text-xl leading-none">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex gap-2">
                {(['eftpos', 'cash', 'split'] as const).map(m => (
                  <button key={m} onClick={() => setPayMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${payMethod === m ? 'bg-[#2563eb] text-white' : 'bg-[rgba(0,0,0,0.05)] text-[rgba(26,26,22,0.6)] hover:bg-[rgba(0,0,0,0.09)]'}`}>
                    {m === 'eftpos' ? 'EFTPOS' : m.charAt(0).toUpperCase() + m.slice(1)}
                  </button>
                ))}
              </div>
              <div className="bg-[#f5f4ef] rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-xs text-[rgba(26,26,22,0.5)]">Amount due</span>
                <span className="text-xl font-bold text-[#1a1a16]">A${roundedTotal.toFixed(2)}</span>
              </div>
              {payMethod === 'cash' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[rgba(26,26,22,0.5)] block mb-1.5">Cash tendered</label>
                    <input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)} placeholder="0.00"
                      className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb]" autoFocus />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[...new Set([roundedTotal, Math.ceil(roundedTotal/5)*5, Math.ceil(roundedTotal/10)*10, Math.ceil(roundedTotal/20)*20])].map(v => (
                      <button key={v} onClick={() => setCashTendered(v.toFixed(2))}
                        className="py-2 rounded-lg text-xs font-semibold bg-[rgba(0,0,0,0.05)] hover:bg-[rgba(0,0,0,0.09)] text-[rgba(26,26,22,0.7)]">
                        A${v.toFixed(2)}
                      </button>
                    ))}
                  </div>
                  {tendered >= roundedTotal && (
                    <div className="flex justify-between items-center bg-[rgba(29,158,117,0.08)] border border-[rgba(29,158,117,0.2)] rounded-xl px-4 py-3">
                      <span className="text-xs font-medium text-[#1D9E75]">Change</span>
                      <span className="text-xl font-bold text-[#1D9E75]">A${change.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}
              {payMethod === 'eftpos' && (
                <div className="bg-[rgba(37,99,235,0.05)] border border-[rgba(37,99,235,0.15)] rounded-xl px-4 py-4 text-center">
                  <CardIcon className="w-8 h-8 text-[#2563eb] mx-auto mb-2" />
                  <p className="text-sm text-[rgba(26,26,22,0.6)]">Process <span className="font-bold text-[#1a1a16]">A${roundedTotal.toFixed(2)}</span> on EFTPOS terminal</p>
                </div>
              )}
              {payMethod === 'split' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[rgba(26,26,22,0.5)] block mb-1.5">Cash portion</label>
                    <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)} placeholder="0.00"
                      className="w-full border border-[rgba(0,0,0,0.1)] rounded-xl px-4 py-2.5 text-lg font-bold text-[#1a1a16] outline-none focus:border-[#2563eb]" />
                  </div>
                  <div className="flex justify-between items-center bg-[rgba(37,99,235,0.05)] rounded-xl px-4 py-3">
                    <span className="text-xs text-[rgba(26,26,22,0.5)]">EFTPOS remainder</span>
                    <span className="text-base font-bold text-[#2563eb]">A${splitCardAmt.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 pb-6">
              <button onClick={processSale}
                disabled={processing || (payMethod === 'cash' && cashTendered !== '' && tendered < roundedTotal)}
                className="w-full h-12 rounded-xl bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white font-bold text-sm tracking-wide uppercase flex items-center justify-center gap-2">
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
            {/* Receipt header */}
            <div className="px-6 py-5 text-center border-b border-[rgba(0,0,0,0.08)]">
              <div className="w-10 h-10 rounded-full bg-[rgba(29,158,117,0.1)] flex items-center justify-center mx-auto mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth={2.5} className="w-5 h-5"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <p className="font-bold text-[#1a1a16] text-lg">{showReceipt.businessName ?? businessName}</p>
              <p className="text-xs text-[rgba(26,26,22,0.5)] mt-0.5">Sale Complete</p>
            </div>

            {/* Receipt body — print-friendly */}
            <div className="px-6 py-4 font-mono text-xs text-[#1a1a16] space-y-1" id="receipt-body">
              <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">Receipt</span><span>{showReceipt.sale_number}</span></div>
              <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">Date</span><span>{new Date(showReceipt.created_at ?? Date.now()).toLocaleDateString('en-AU')}</span></div>
              <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">Time</span><span>{new Date(showReceipt.created_at ?? Date.now()).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span></div>
              {showReceipt.customerSnapshot && <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">Customer</span><span>{showReceipt.customerSnapshot.name}</span></div>}

              <div className="border-t border-dashed border-[rgba(0,0,0,0.15)] my-2 pt-2 space-y-1">
                {(showReceipt.cartSnapshot ?? []).map((item: CartItem, i: number) => (
                  <div key={i} className="flex justify-between gap-2">
                    <span className="flex-1 truncate">{item.qty}× {item.label ?? item.product.name}</span>
                    <span>A${(item.unitPrice * item.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-[rgba(0,0,0,0.15)] pt-2 space-y-0.5">
                <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">Excl. GST</span><span>A${(showReceipt.total_amount / 1.1).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-[rgba(26,26,22,0.5)]">GST (10%)</span><span>A${(showReceipt.total_amount - showReceipt.total_amount / 1.1).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-sm mt-1"><span>TOTAL</span><span>A${showReceipt.total_amount?.toFixed(2)}</span></div>
                <div className="flex justify-between text-[rgba(26,26,22,0.5)]"><span>Payment</span><span className="capitalize">{showReceipt.payment_method}</span></div>
                {showReceipt.cash_tendered != null && <div className="flex justify-between text-[rgba(26,26,22,0.5)]"><span>Tendered</span><span>A${showReceipt.cash_tendered?.toFixed(2)}</span></div>}
                {showReceipt.change_given != null && showReceipt.change_given > 0 && <div className="flex justify-between text-[rgba(26,26,22,0.5)]"><span>Change</span><span>A${showReceipt.change_given?.toFixed(2)}</span></div>}
              </div>

              <p className="text-center text-[rgba(26,26,22,0.4)] pt-2">Thank you for your business!</p>
            </div>

            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl border border-[rgba(0,0,0,0.1)] text-sm font-medium text-[rgba(26,26,22,0.7)]">Print</button>
              <button onClick={() => setShowReceipt(null)} className="flex-1 py-2.5 rounded-xl bg-[#2563eb] text-white text-sm font-bold">New Sale</button>
            </div>
          </div>
        </div>
      )}

      {/* Variant loading overlay */}
      {variantLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-[rgba(0,0,0,0.2)]">
          <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <Spinner /><span className="text-sm text-[#1a1a16]">Loading options…</span>
          </div>
        </div>
      )}

      {/* Missed sale modal */}
      {showMissedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: '#1a1a25', border: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="text-white font-semibold mb-1">Log Missed Sale</h2>
            <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Record what a customer asked for that you didn't stock</p>
            <div className="space-y-3">
              <input
                value={missedName}
                onChange={e => setMissedName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                placeholder="Product name e.g. Oat Milk 1L" autoFocus />
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>Qty wanted</p>
                  <input type="number" min="1"
                    value={missedQty}
                    onChange={e => setMissedQty(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }} />
                </div>
              </div>
              <input
                value={missedNote}
                onChange={e => setMissedNote(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm text-white outline-none"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
                placeholder="Customer note (optional)" />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setShowMissedModal(false); setMissedName(''); setMissedQty('1'); setMissedNote(''); }}
                className="flex-1 py-2.5 rounded-lg text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                Cancel
              </button>
              <button
                disabled={savingMissed || !missedName.trim()}
                onClick={async () => {
                  if (!businessId || !missedName.trim()) return;
                  setSavingMissed(true);
                  try {
                    await fetch('/api/pos/missed-demand', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        business_id: businessId,
                        product_name: missedName.trim(),
                        estimated_quantity_wanted: parseInt(missedQty) || 1,
                        customer_note: missedNote || undefined,
                        logged_by: 'pos_terminal',
                      }),
                    });
                    setShowMissedModal(false);
                    setMissedName(''); setMissedQty('1'); setMissedNote('');
                  } finally {
                    setSavingMissed(false);
                  }
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
                style={{ background: '#fbbf24', color: '#1a1208' }}>
                {savingMissed ? 'Saving…' : 'Log it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── AI suggestions bar ─────────────────────────────────────────── */
function SuggestionsBar({ cart, onAdd }: { cart: CartItem[]; onAdd: (p: Product) => void }) {
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; price: number }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const cartKey = cart.map(i => i.product.id).join(',');

  useEffect(() => {
    if (cart.length === 0) { setSuggestions([]); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/aria/pos-suggestions', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_ids: cart.map(i => i.product.id) }) }).then(r => r.json());
        setSuggestions(res.suggestions ?? []);
      } catch { /* silent */ }
    }, 800);
    return () => clearTimeout(timerRef.current);
  }, [cartKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <TileIcon icon={icon} /><span className="text-center leading-tight">{label}</span>
    </button>
  );
}

function TileIcon({ icon }: { icon: string | null }) {
  const cls = 'w-6 h-6';
  switch (icon) {
    case 'x':      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case 'minus':  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'plus':   return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={cls}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'dollar': return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={cls}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
    default:       return <svg viewBox="0 0 24 24" fill="currentColor" className={cls}><circle cx="12" cy="12" r="4"/></svg>;
  }
}

function SearchIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>; }
function CardIcon({ className }: { className?: string })   { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>; }
function BagOutlineIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>; }
function PauseIcon({ className }: { className?: string })  { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>; }
function Spinner() { return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>; }
