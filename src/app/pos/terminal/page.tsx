'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/* ─── Types ─────────────────────────────────────────────────────── */
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; tax_rate: number;
  stock_quantity: number; low_stock_threshold: number;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  category_id: string | null;
  pos_categories?: { name: string; color: string } | null;
}
interface GlobalProductHit {
  name: string; brand?: string; category?: string;
  suggested_price_cents?: number; is_age_restricted?: boolean;
}
interface Modifier { id: string; name: string; price_adjustment: number; modifier_group: string | null; }
interface VariantGroup { id: string; name: string; values: string[]; affects_price: boolean; price_map: Record<string, number>; }
interface ModifierLink { id: string; modifier_id: string; pos_modifiers: Modifier; }
interface CartItem {
  product: Product; qty: number; discount_percent?: number;
  label?: string; variantLabel?: string; modifierDetails?: Modifier[]; unitPrice: number;
}
interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; total_spent: number; }
interface ParkedSale { id: string; label: string | null; items: CartItem[]; total: number; customer_id: string | null; created_at: string; }
interface RegisterSession { id: string; status: string; opening_float: number; opened_at: string; opened_by: string | null; }
interface VariantModalState { product: Product; variantGroups: VariantGroup[]; modifiers: Modifier[]; }
interface AriaChatMsg { role: 'user' | 'aria'; text: string; ts: number; }
interface RecentSale { id: string; total: number; items: number; time: Date; }

/* ─── Cash rounding ─────────────────────────────────────────────── */
function roundCash(amount: number): number { return Math.round(amount * 20) / 20; }

/* ─── Product card visual constants ─────────────────────────────── */
interface CatStyle { bg: string; text: string; emoji: string; }
const CATEGORY_STYLES: Record<string, CatStyle> = {
  'Beer & Cider':  { bg: '#FEF3C7', text: '#92400E', emoji: '🍺' },
  'Wine':          { bg: '#FDF2F8', text: '#9D174D', emoji: '🍷' },
  'Spirits':       { bg: '#EFF6FF', text: '#1E40AF', emoji: '🥃' },
  'RTD':           { bg: '#ECFDF5', text: '#065F46', emoji: '🍹' },
  'Soft Drinks':   { bg: '#F0FDF4', text: '#166534', emoji: '🥤' },
  'Water':         { bg: '#E0F2FE', text: '#0369A1', emoji: '💧' },
  'Energy Drinks': { bg: '#FFFBEB', text: '#92400E', emoji: '⚡' },
  'Sports Drinks': { bg: '#F0FDF4', text: '#166534', emoji: '🏃' },
  'Snacks':        { bg: '#FFF7ED', text: '#9A3412', emoji: '🍿' },
  'Confectionery': { bg: '#FDF4FF', text: '#7E22CE', emoji: '🍬' },
  'Coffee':        { bg: '#FEF3C7', text: '#78350F', emoji: '☕' },
  'Food':          { bg: '#FFF7ED', text: '#C2410C', emoji: '🍔' },
  'Dairy':         { bg: '#F0F9FF', text: '#0369A1', emoji: '🥛' },
  'Frozen':        { bg: '#EFF6FF', text: '#1D4ED8', emoji: '🧊' },
  'Tobacco':       { bg: '#F8FAFC', text: '#374151', emoji: '🚬' },
  'Ice Cream':     { bg: '#FDF4FF', text: '#7E22CE', emoji: '🍦' },
  'Bakery':        { bg: '#FFFBEB', text: '#92400E', emoji: '🥐' },
};
const DEFAULT_CAT_STYLE: CatStyle = { bg: '#F9FAFB', text: '#374151', emoji: '📦' };

function getCatStyle(catName: string | null | undefined): CatStyle {
  if (!catName) return DEFAULT_CAT_STYLE;
  if (CATEGORY_STYLES[catName]) return CATEGORY_STYLES[catName];
  // Map unknown categories by first char to a colour slot
  const code = catName.charCodeAt(0) % 8;
  const fallbacks: CatStyle[] = [
    { bg: '#FEF3C7', text: '#92400E', emoji: '📦' },
    { bg: '#F0FDF4', text: '#166534', emoji: '📦' },
    { bg: '#EFF6FF', text: '#1E40AF', emoji: '📦' },
    { bg: '#FDF4FF', text: '#7E22CE', emoji: '📦' },
    { bg: '#FFF7ED', text: '#9A3412', emoji: '📦' },
    { bg: '#FDF2F8', text: '#9D174D', emoji: '📦' },
    { bg: '#ECFDF5', text: '#065F46', emoji: '📦' },
    { bg: '#F9FAFB', text: '#374151', emoji: '📦' },
  ];
  return fallbacks[code] ?? DEFAULT_CAT_STYLE;
}

// Keep legacy helpers for category tabs
function getCategoryEmoji(catName: string | null | undefined): string {
  return getCatStyle(catName).emoji;
}
function getCategoryBg(catName: string | null | undefined): string {
  return getCatStyle(catName).bg;
}

const CART_SESSION_KEY = 'aria_pos_cart_v1';
type PayMethod = 'card' | 'cash' | 'split';

/* ═══════════════════════════════════════════════════════════════════
   TERMINAL
═══════════════════════════════════════════════════════════════════ */
export default function TerminalPage() {
  /* ── Data ─────────────────────────────────────────────────────── */
  const [products,       setProducts]       = useState<Product[]>([]);
  const [parkedSales,    setParkedSales]    = useState<ParkedSale[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [businessId,     setBusinessId]     = useState<string | null>(null);
  const [businessName,   setBusinessName]   = useState<string>('AriaPOS');
  const [lowStockItems,  setLowStockItems]  = useState<Product[]>([]);
  const [lowStockDismissed, setLowStockDismissed] = useState(false);
  const [recentSales,    setRecentSales]    = useState<RecentSale[]>([]);

  /* ── Cart ─────────────────────────────────────────────────────── */
  const [cart,           setCart]           = useState<CartItem[]>([]);
  const [selectedItem,   setSelectedItem]   = useState<string | null>(null);
  const [customer,       setCustomer]       = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [lastAddedId,    setLastAddedId]    = useState<string | null>(null);
  const [discountMode,   setDiscountMode]   = useState<'pct' | 'amt' | null>(null);
  const [discountVal,    setDiscountVal]    = useState('');

  /* ── Commission / sale attribution ───────────────────────────── */
  const [servedBy,       setServedBy]       = useState<string>('');

  /* ── Payment ──────────────────────────────────────────────────── */
  const [payMethod,      setPayMethod]      = useState<PayMethod>('card');
  const [cashTendered,   setCashTendered]   = useState('');
  const [splitCash,      setSplitCash]      = useState('');
  const [processing,     setProcessing]     = useState(false);
  const [showReceipt,    setShowReceipt]    = useState<any>(null);

  /* ── Register ─────────────────────────────────────────────────── */
  const [registerSession,   setRegisterSession]   = useState<RegisterSession | null>(null);
  const [registerLoading,   setRegisterLoading]   = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [openingFloat,      setOpeningFloat]      = useState('200');
  const [openingRegister,   setOpeningRegister]   = useState(false);
  const [closingRegister,   setClosingRegister]   = useState(false);
  const [showCloseModal,    setShowCloseModal]    = useState(false);
  const [closingFloat,      setClosingFloat]      = useState('');
  const [registerError,     setRegisterError]     = useState<string | null>(null);

  /* ── Variants/modifiers ───────────────────────────────────────── */
  const [variantModal,     setVariantModal]     = useState<VariantModalState | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [selectedMods,     setSelectedMods]     = useState<Record<string, boolean>>({});
  const [variantQty,       setVariantQty]       = useState(1);
  const [variantLoading,   setVariantLoading]   = useState(false);

  /* ── UI ───────────────────────────────────────────────────────── */
  const [search,         setSearch]         = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showParked,     setShowParked]     = useState(false);
  const [mobileTab,      setMobileTab]      = useState<'products' | 'cart' | 'aria'>('products');

  /* ── Aria chat ────────────────────────────────────────────────── */
  const [chatInput,      setChatInput]      = useState('');
  const [chatMessages,   setChatMessages]   = useState<AriaChatMsg[]>([]);
  const [chatLoading,    setChatLoading]    = useState(false);

  /* ── Missed sale ──────────────────────────────────────────────── */
  const [showMissedModal, setShowMissedModal] = useState(false);
  const [missedName,      setMissedName]      = useState('');
  const [missedQty,       setMissedQty]       = useState('1');
  const [missedNote,      setMissedNote]      = useState('');
  const [savingMissed,    setSavingMissed]    = useState(false);

  /* ── Age verification ──────────────────────────────────────────── */
  const [ageVerified,    setAgeVerified]    = useState(false);
  const [showAgeModal,   setShowAgeModal]   = useState(false);

  /* ── Product suggestions (/api/aria/pos-suggestions) ───────────── */
  const [suggestions,        setSuggestions]        = useState<Array<{ id: string; name: string; price: number }>>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  /* ── Barcode external lookup (/api/products/barcode-lookup) ────── */
  const [barcodeLookupHit,  setBarcodeLookupHit]  = useState<GlobalProductHit | null>(null);
  const [barcodeScanning,   setBarcodeScanning]   = useState(false);

  /* ── Quick access panel ───────────────────────────────────────── */
  const [showQuickPanel,   setShowQuickPanel]   = useState(false);

  /* ── Custom item / Note ───────────────────────────────────────── */
  const [showCustomItem,   setShowCustomItem]   = useState(false);
  const [customItemForm,   setCustomItemForm]   = useState({ desc: '', price: '', qty: '1', taxable: true, isNote: false });

  /* ── Price check mode ─────────────────────────────────────────── */
  const [priceCheckMode,   setPriceCheckMode]   = useState(false);
  const [priceCheckProd,   setPriceCheckProd]   = useState<Product | null>(null);

  /* ── Refund ───────────────────────────────────────────────────── */
  const [showRefundModal,  setShowRefundModal]  = useState(false);
  const [refundSearch,     setRefundSearch]     = useState('');
  const [refundResults,    setRefundResults]    = useState<any[]>([]);
  const [refundSale,       setRefundSale]       = useState<any>(null);
  const [refundItems,      setRefundItems]      = useState<Record<string, boolean>>({});
  const [processingRefund, setProcessingRefund] = useState(false);

  /* ── Cashier switch ───────────────────────────────────────────── */
  const [showCashierModal, setShowCashierModal] = useState(false);
  const [cashierName,      setCashierName]      = useState('');
  const [switchingCashier, setSwitchingCashier] = useState(false);

  /* ── Receipt reprint ──────────────────────────────────────────── */
  const [reprintSale,      setReprintSale]      = useState<any>(null);

  /* ── Context menu ─────────────────────────────────────────────── */
  const [contextMenu,      setContextMenu]      = useState<{ product: Product; x: number; y: number } | null>(null);

  const searchRef  = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const barcodeBuffer = useRef('');
  const barcodeTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const barcodeTs     = useRef<number>(0);
  const quickPanelRef = useRef<HTMLDivElement>(null);

  /* ── sessionStorage cart persistence ─────────────────────────── */
  useEffect(() => {
    try { const saved = sessionStorage.getItem(CART_SESSION_KEY); if (saved) setCart(JSON.parse(saved)); } catch { /* ignore */ }
    // Pre-fill served_by from logged-in POS user
    try {
      const posUser = localStorage.getItem('aria_pos_user');
      if (posUser) { const u = JSON.parse(posUser); if (u.name) setServedBy(u.name); }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    try { sessionStorage.setItem(CART_SESSION_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  /* ── Register load ────────────────────────────────────────────── */
  const loadRegister = useCallback(async () => {
    setRegisterLoading(true);
    try { const r = await fetch('/api/pos/sessions'); if (r.ok) { const d = await r.json(); setRegisterSession(d.openSession ?? null); } }
    catch { /* silent */ }
    setRegisterLoading(false);
  }, []);

  /* ── Initial data load ────────────────────────────────────────── */
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
      setParkedSales(park.parked_sales || []);
      setLowStockItems(prods.filter(p => p.track_stock && p.stock_quantity <= (p.low_stock_threshold ?? 5) && p.is_active));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [loadRegister]);

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setMobileTab('aria'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Customer display sync ────────────────────────────────────── */
  useEffect(() => {
    if (showReceipt) return; // handled by processSale
    try {
      const sub = cart.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);
      const tax = sub - sub / 1.1;
      const tot = sub;
      localStorage.setItem('aria_pos_display_state', JSON.stringify({
        status: cart.length > 0 ? 'active' : 'idle',
        business_name: businessName,
        cart: cart.map(i => ({ name: i.label ?? i.product.name, qty: i.qty, price: i.unitPrice })),
        subtotal_cents: Math.round(sub * 100),
        discount_cents: 0,
        tax_cents: Math.round(tax * 100),
        total_cents: Math.round(tot * 100),
        customer_name: customer?.name ?? null,
        timestamp: Date.now(),
      }));
    } catch { /* ignore */ }
  }, [cart, customer, businessName, showReceipt]);

  /* ── Barcode scanner ──────────────────────────────────────────── */
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
          if (hit && hit.is_active && (!hit.track_stock || hit.stock_quantity > 0)) {
            checkAndAddToCart(hit);
          } else if (!hit) {
            // Not in local catalog — try global products / Open Food Facts
            setBarcodeLookupHit(null);
            setBarcodeScanning(true);
            fetch(`/api/products/barcode-lookup?barcode=${encodeURIComponent(code)}`)
              .then(r => r.json())
              .then(d => {
                if (d.found && d.product) setBarcodeLookupHit(d.product as GlobalProductHit);
              })
              .catch(() => null)
              .finally(() => setBarcodeScanning(false));
          }
        }
        return;
      }
      if (e.key === 'F1')  { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === 'F2')  { e.preventDefault(); setShowCustomItem(true); return; }
      if (e.key === 'F3')  { e.preventDefault(); parkSale(); return; }
      if (e.key === 'F8')  { e.preventDefault(); setPayMethod('cash'); return; }
      if (e.key === 'F9')  { e.preventDefault(); setPayMethod('card'); return; }
      if (e.key === 'F10') { e.preventDefault(); processSale(); return; }
      if (e.key === 'Escape') { if (!variantModal) confirmClear(); return; }
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
  }, [products, variantModal]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Customer search ──────────────────────────────────────────── */
  const searchCustomers = useCallback(async (q: string) => {
    if (q.length < 2) { setCustomerResults([]); return; }
    const r = await fetch(`/api/pos/customers?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    setCustomerResults(d.customers || []);
  }, []);
  useEffect(() => { searchCustomers(customerSearch); }, [customerSearch, searchCustomers]);

  /* ── Aria chat scroll ─────────────────────────────────────────── */
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  /* ── Close context menu on outside click ──────────────────────── */
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [contextMenu]);

  /* ── Product suggestions — debounced on cart change ───────────── */
  useEffect(() => {
    if (cart.length === 0) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const res = await fetch('/api/aria/pos-suggestions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart_item_ids: cart.map(i => i.product.id) }),
        });
        if (res.ok) {
          const d = await res.json();
          setSuggestions((d.suggestions ?? []).slice(0, 3));
        }
      } catch { /* non-critical */ }
      setSuggestionsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, [cart.map(i => i.product.id).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Derived values ─────────────────────────────────────────── */
  const categories = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) {
      if (p.pos_categories?.name) m.set(p.pos_categories.name, p.pos_categories.color);
    }
    return Array.from(m.entries()).map(([name, color]) => ({ name, color }));
  }, [products]);

  const displayedProducts = useMemo(() => {
    let ps = products.filter(p => p.is_active);
    if (activeCategory) ps = ps.filter(p => p.pos_categories?.name === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      ps = ps.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      );
    }
    return ps;
  }, [products, activeCategory, search]);

  const ageRestrictedInCart = useMemo(() =>
    cart.some(i => (i.product as any).is_age_restricted), [cart]);

  const loyaltyCustomer = customer && customer.loyalty_points > 0;

  /* ─── Cart calculations ──────────────────────────────────────── */
  const cartKey    = (i: CartItem) => `${i.product.id}::${i.label ?? i.product.name}`;
  const subtotal   = cart.reduce((s, i) => s + i.unitPrice * i.qty * (1 - (i.discount_percent ?? 0) / 100), 0);
  const taxAmount  = subtotal - subtotal / 1.1;
  const netAmount  = subtotal / 1.1;
  const total      = subtotal;
  const tendered   = parseFloat(cashTendered) || 0;
  const roundedTotal = payMethod === 'cash' ? roundCash(total) : total;
  const change     = payMethod === 'cash' && tendered >= roundedTotal ? tendered - roundedTotal : 0;
  const splitCardAmt = payMethod === 'split' ? Math.max(0, total - (parseFloat(splitCash) || 0)) : 0;

  /* ─── Cart helpers ───────────────────────────────────────────── */
  function updateQty(key: string, qty: number) {
    if (qty <= 0) setCart(c => c.filter(i => cartKey(i) !== key));
    else setCart(c => c.map(i => cartKey(i) === key ? { ...i, qty } : i));
  }
  function confirmClear() { if (!cart.length) return; if (confirm('Clear the current sale?')) clearSale(); }
  function clearSale() {
    setCart([]); setCustomer(null); setSelectedItem(null);
    setCashTendered(''); setSplitCash(''); setCustomerSearch('');
    setDiscountMode(null); setDiscountVal('');
    setAgeVerified(false); setSuggestions([]);
    try { sessionStorage.removeItem(CART_SESSION_KEY); } catch { /* ignore */ }
    searchRef.current?.focus();
  }

  function addToCartDirect(p: Product, qty: number, variantLabel?: string, label?: string, mods: Modifier[] = []) {
    const modPrice = mods.reduce((s, m) => s + (m.price_adjustment ?? 0), 0);
    const unitPrice = p.price + modPrice;
    const fullLabel = label ?? (variantLabel ? `${p.name} · ${variantLabel}` : p.name);
    setCart(c => {
      const key = `${p.id}::${fullLabel}`;
      const hit = c.find(i => `${i.product.id}::${i.label ?? i.product.name}` === key);
      if (hit) return c.map(i => `${i.product.id}::${i.label ?? i.product.name}` === key ? { ...i, qty: i.qty + qty } : i);
      return [...c, { product: p, qty, label: fullLabel !== p.name ? fullLabel : undefined, variantLabel, modifierDetails: mods, unitPrice, discount_percent: 0 }];
    });
    setSelectedItem(p.id);
    setLastAddedId(p.id);
    setSearch('');
    if (window.innerWidth < 768) setMobileTab('cart');
  }

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
          setSelectedVariants({}); setSelectedMods({}); setVariantQty(1);
          setVariantLoading(false); return;
        }
      }
    } catch { /* fall through */ }
    setVariantLoading(false);
    addToCartDirect(p, 1, undefined, undefined, []);
  }

  function confirmVariantSelection() {
    if (!variantModal) return;
    const p = variantModal.product;
    const variantParts: string[] = [];
    let priceDelta = 0;
    for (const g of variantModal.variantGroups) {
      const sel = selectedVariants[g.id];
      if (sel) {
        variantParts.push(sel);
        if (g.affects_price && g.price_map[sel] != null) priceDelta += g.price_map[sel] - p.price;
      }
    }
    const selectedModList = variantModal.modifiers.filter(m => selectedMods[m.id]);
    const allParts = [...variantParts, ...selectedModList.map(m => m.name)];
    const label = allParts.length > 0 ? `${p.name} · ${allParts.join(' · ')}` : p.name;
    const effectivePrice = Math.max(0, p.price + priceDelta + selectedModList.reduce((s, m) => s + (m.price_adjustment ?? 0), 0));
    addToCartDirect({ ...p, price: effectivePrice }, variantQty, variantParts.join(' / ') || undefined, label, selectedModList);
    setVariantModal(null);
  }

  /* ─── Aria chat ──────────────────────────────────────────────── */
  async function sendAriaChat() {
    if (!chatInput.trim() || chatLoading || !businessId) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatMessages(m => [...m, { role: 'user', text: msg, ts: Date.now() }]);
    setChatLoading(true);
    try {
      const res = await fetch('/api/aria/pos-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId, message: msg,
          cart_context: cart.length > 0 ? { items: cart.map(i => ({ name: i.label ?? i.product.name, qty: i.qty, price: i.unitPrice })), total_cents: Math.round(total * 100) } : null,
        }),
      });
      const d = await res.json();
      setChatMessages(m => [...m, { role: 'aria', text: d.reply ?? 'Could not process that right now.', ts: Date.now() }]);
    } catch {
      setChatMessages(m => [...m, { role: 'aria', text: 'Connection error — try again.', ts: Date.now() }]);
    }
    setChatLoading(false);
  }

  /* ─── Custom item / Note ────────────────────────────────────── */
  function addCustomItemToCart() {
    const price = parseFloat(customItemForm.price) || 0;
    const qty   = parseInt(customItemForm.qty) || 1;
    if (!customItemForm.desc.trim()) return;
    if (!customItemForm.isNote && price <= 0) return;
    const fakeProduct: Product = {
      id: `custom-${Date.now()}`,
      name: customItemForm.isNote ? `📝 ${customItemForm.desc}` : customItemForm.desc,
      sku: null, barcode: null,
      price: customItemForm.isNote ? 0 : price,
      cost_price: 0,
      tax_rate: customItemForm.taxable ? 10 : 0,
      stock_quantity: 999, low_stock_threshold: 0,
      track_stock: false, is_active: true,
      category_id: null,
    };
    addToCartDirect(fakeProduct, qty);
    setCustomItemForm({ desc: '', price: '', qty: '1', taxable: true, isNote: false });
    setShowCustomItem(false);
  }

  /* ─── Refund search & process ────────────────────────────────── */
  async function searchRefundSales(q: string) {
    if (q.length < 2) { setRefundResults([]); return; }
    try {
      const res = await fetch(`/api/pos/sales?q=${encodeURIComponent(q)}&limit=10`);
      const d = await res.json();
      setRefundResults(d.sales ?? []);
    } catch { setRefundResults([]); }
  }
  async function processRefund() {
    if (!refundSale || processingRefund) return;
    const selectedItems = refundSale.items?.filter((item: any) => refundItems[item.id]) ?? [];
    if (selectedItems.length === 0) return;
    setProcessingRefund(true);
    try {
      const refundTotal = selectedItems.reduce((s: number, i: any) => s + (i.line_total ?? 0), 0);
      await fetch('/api/pos/sale', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedItems.map((i: any) => ({
            product_id: i.product_id, product_name: i.product_name,
            quantity: -Math.abs(i.quantity), unit_price: i.unit_price,
            tax_rate: i.tax_rate ?? 10, discount_percent: 0,
            line_total: -Math.abs(i.line_total ?? 0),
          })),
          payment_method: refundSale.payment_method ?? 'card',
          subtotal: -refundTotal, tax_amount: -(refundTotal - refundTotal / 1.1),
          discount_amount: 0, total_amount: -refundTotal,
          session_id: registerSession?.id ?? null,
          original_sale_id: refundSale.id,
          notes: `Refund for sale ${refundSale.sale_number ?? refundSale.id}`,
        }),
      });
      setShowRefundModal(false);
      setRefundSale(null); setRefundItems({}); setRefundSearch(''); setRefundResults([]);
      alert(`Refund of A$${refundTotal.toFixed(2)} processed.`);
    } catch { alert('Refund failed — try again.'); }
    setProcessingRefund(false);
  }

  /* ─── Cashier switch ─────────────────────────────────────────── */
  async function switchCashier() {
    if (!cashierName.trim() || !registerSession) return;
    setSwitchingCashier(true);
    try {
      await fetch('/api/pos/sessions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: registerSession.id, cashier_name: cashierName.trim() }),
      });
      setRegisterSession({ ...registerSession, opened_by: cashierName.trim() });
      setShowCashierModal(false); setCashierName('');
    } catch { /* silent */ }
    setSwitchingCashier(false);
  }

  /* ─── Park sale ──────────────────────────────────────────────── */
  async function parkSale() {
    if (!cart.length) return;
    const label = prompt('Label for parked sale (optional):') ?? undefined;
    await fetch('/api/pos/park', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, items: cart, customer_id: customer?.id ?? null, subtotal: +subtotal.toFixed(2), total: +total.toFixed(2) }) });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    clearSale();
  }
  async function restoreParked(p: ParkedSale) {
    setCart(p.items);
    await fetch(`/api/pos/park?id=${p.id}`, { method: 'DELETE' });
    const r = await fetch('/api/pos/park').then(r => r.json());
    setParkedSales(r.parked_sales || []);
    setShowParked(false);
  }

  /* ─── Register ───────────────────────────────────────────────── */
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

  /* ─── Process sale ───────────────────────────────────────────── */
  async function processSale() {
    if (!cart.length || processing) return;
    // Age restriction gate — require ID check confirmation before proceeding
    const hasAgeRestricted = cart.some(i => i.product.is_age_restricted);
    if (hasAgeRestricted && !ageVerified) {
      setShowAgeModal(true);
      return;
    }
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
          served_by: servedBy || null,
          subtotal: +subtotal.toFixed(2), tax_amount: +taxAmount.toFixed(2),
          discount_amount: 0, total_amount: +roundedTotal.toFixed(2),
          cash_tendered: payMethod === 'cash' ? tendered : null,
          change_given: payMethod === 'cash' ? +change.toFixed(2) : null,
          split_cash: payMethod === 'split' ? parseFloat(splitCash) || 0 : null,
          split_card: payMethod === 'split' ? +splitCardAmt.toFixed(2) : null,
          outlet_id: outletId, session_id: registerSession?.id ?? null,
          age_verified: ageVerified,
        }),
      });
      const d = await r.json();
      if (d.error) { alert(d.error); return; }
      setProducts(ps => ps.map(p => {
        const item = cart.find(i => i.product.id === p.id);
        if (!item || !p.track_stock) return p;
        return { ...p, stock_quantity: Math.max(0, p.stock_quantity - item.qty) };
      }));
      const cartSnapshot = [...cart];
      const customerSnapshot = customer;
      setRecentSales(prev => [{
        id: d.sale?.id ?? String(Date.now()),
        total: roundedTotal,
        items: cartSnapshot.reduce((s, i) => s + i.qty, 0),
        time: new Date(),
      }, ...prev].slice(0, 5));
      // Calculate commission (non-blocking)
      if (servedBy && businessId) {
        fetch('/api/pos/commission-rules?business_id=' + businessId).then(r => r.json()).then(async data => {
          const rules = data.rules ?? [];
          const activeRule = rules[0]; // Use first active rule
          if (!activeRule) return;
          const saleCents = Math.round(roundedTotal * 100);
          if (saleCents < (activeRule.min_sale_cents ?? 0)) return;
          const commissionCents = Math.round(saleCents * (activeRule.rate / 100));
          await fetch('/api/pos/commissions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId, sale_id: d.sale?.id, pos_user_name: servedBy,
              rule_id: activeRule.id, sale_total_cents: saleCents,
              commission_rate: activeRule.rate, commission_cents: commissionCents,
            }),
          }).catch(() => null);
        }).catch(() => null);
      }

      // Signal customer display: complete state
      try {
        const changeCents = payMethod === 'cash' ? Math.round(change * 100) : 0;
        localStorage.setItem('aria_pos_display_state', JSON.stringify({
          status: 'complete',
          business_name: businessName,
          change_cents: changeCents,
          customer_name: customerSnapshot?.name ?? null,
          loyalty_earned: Math.floor(roundedTotal),
          timestamp: Date.now(),
        }));
      } catch { /* ignore */ }

      setShowReceipt({ ...d.sale, cartSnapshot, customerSnapshot, businessName });
      clearSale();
    } finally { setProcessing(false); }
  }

  const registerIsOpen = !!registerSession;

  /* ══════════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100%', background: '#0A0910' }}>

      {/* Low stock alert bar */}
      {lowStockItems.length > 0 && !lowStockDismissed && (
        <div className="flex-shrink-0 px-4 py-2 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.15)' }}>
          <span className="text-xs font-medium flex-1" style={{ color: '#F59E0B' }}>
            ⚠ {lowStockItems.length} product{lowStockItems.length > 1 ? 's' : ''} running low:{' '}
            {lowStockItems.slice(0, 3).map(p => p.name).join(', ')}{lowStockItems.length > 3 ? ' …' : ''}
          </span>
          <a href="/dashboard/reorder" className="text-xs font-semibold hover:underline" style={{ color: '#F59E0B' }}>Reorder →</a>
          <button onClick={() => setLowStockDismissed(true)} className="text-lg leading-none" style={{ color: 'rgba(245,158,11,0.5)' }}>×</button>
        </div>
      )}

      {/* Register status bar */}
      {!registerLoading && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 text-xs" style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid #1C1928' }}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: registerIsOpen ? '#22C55E' : '#EF4444' }} />
            <span style={{ color: registerIsOpen ? '#22C55E' : '#EF4444' }}>
              {registerIsOpen
                ? `Open since ${new Date(registerSession!.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
                : 'Register closed'}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {parkedSales.length > 0 && (
              <button onClick={() => setShowParked(true)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#8B85A8', border: '1px solid #2A2540', background: 'rgba(255,255,255,0.03)' }}>
                Parked ({parkedSales.length})
              </button>
            )}
            <button onClick={() => setShowRefundModal(true)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#8B85A8', border: '1px solid #2A2540', background: 'rgba(255,255,255,0.03)' }}>
              ⟳ Refund
            </button>
            {registerIsOpen && (
              <button onClick={() => setShowCashierModal(true)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#8B85A8', border: '1px solid #2A2540', background: 'rgba(255,255,255,0.03)' }}>
                {registerSession?.opened_by ? `👤 ${registerSession.opened_by}` : 'Switch cashier'}
              </button>
            )}
            {registerIsOpen
              ? <button onClick={() => setShowCloseModal(true)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>Close register</button>
              : <button onClick={() => setShowRegisterModal(true)} className="px-2 py-0.5 rounded text-xs" style={{ color: '#22C55E', border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)' }}>Open register</button>
            }
          </div>
        </div>
      )}

      {/* 3-column grid */}
      <div className="flex-1 min-h-0 grid overflow-hidden"
        style={{ gridTemplateColumns: '272px 1fr 308px' }}>

        {/* ── LEFT: Product browser ──────────────────────────────── */}
        <div className={`relative flex flex-col overflow-hidden ${mobileTab !== 'products' ? 'hidden md:flex' : 'flex'}`}
          style={{ borderRight: '1px solid #1C1928', background: '#110F1A' }}>

          {/* Quick panel slide-out */}
          {showQuickPanel && (
            <div ref={quickPanelRef} className="absolute inset-0 z-20 flex flex-col" style={{ background: '#1A1728', boxShadow: '4px 0 24px rgba(0,0,0,0.5)' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #1C1928' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#EDE8FF' }}>{businessName}</p>
                  <p className="text-xs" style={{ color: '#4A4565' }}>{new Date().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                </div>
                <button onClick={() => setShowQuickPanel(false)} className="text-xl" style={{ color: '#4A4565' }}>×</button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {[
                  { icon: '🏠', label: 'Dashboard',        href: '/dashboard' },
                  { icon: '📦', label: 'Products',         href: '/pos/products' },
                  { icon: '👥', label: 'Customers',        href: '/pos/customers' },
                  { icon: '🎁', label: 'Gift Cards',       href: '/pos/gift-cards' },
                  { icon: '🏷️', label: 'Promotions',      href: '/pos/promotions' },
                  { icon: '📊', label: 'Reports',          href: '/pos/reports' },
                  { icon: '⏰', label: 'Timesheets',       href: '/pos/timesheets' },
                  { icon: '💰', label: 'Cash Management',  href: '/pos/cash' },
                ].map(link => (
                  <a key={link.href} href={link.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                    style={{ color: '#8B85A8' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(255,255,255,0.04)'; (e.currentTarget as HTMLAnchorElement).style.color = '#EDE8FF'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = ''; (e.currentTarget as HTMLAnchorElement).style.color = '#8B85A8'; }}>
                    <span className="text-base w-6 text-center">{link.icon}</span>
                    <span>{link.label}</span>
                  </a>
                ))}
                <button
                  onClick={() => {
                    try {
                      localStorage.setItem('aria_display_state', JSON.stringify({
                        status: 'idle', business_name: businessName, timestamp: Date.now(),
                      }));
                    } catch { /* ignore */ }
                    const w = window.open(
                      '/pos/display',
                      'AriaCustomerDisplay',
                      ['width=1280','height=800','menubar=no','toolbar=no','location=no','status=no','scrollbars=no','resizable=yes'].join(',')
                    );
                    if (w) w.focus();
                    setShowQuickPanel(false);
                  }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors w-full text-left">
                  <span className="text-base w-6 text-center">📺</span>
                  <span>Customer Display ↗</span>
                </button>
              </div>
              {lowStockItems.length > 0 && (
                <div className="p-3" style={{ borderTop: '1px solid #1C1928' }}>
                  <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: '#4A4565' }}>Low stock</p>
                  {lowStockItems.slice(0, 3).map(p => (
                    <p key={p.id} className="text-xs py-0.5" style={{ color: '#F59E0B' }}>⚠ {p.name} ({p.stock_quantity} left)</p>
                  ))}
                </div>
              )}
              {registerIsOpen && (
                <div className="p-3" style={{ borderTop: '1px solid #1C1928' }}>
                  <button onClick={() => { setShowCloseModal(true); setShowQuickPanel(false); }}
                    className="w-full py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
                    Close Register
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Search + menu button row */}
          <div className="px-3 py-2.5 flex gap-2" style={{ borderBottom: '1px solid #1C1928' }}>
            <button onClick={() => setShowQuickPanel(v => !v)}
              className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl text-base"
              style={{ border: '1px solid #2A2540', background: 'rgba(255,255,255,0.03)', color: '#8B85A8' }}>
              ≡
            </button>
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(139,133,168,0.4)' } as React.CSSProperties} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search or scan barcode…"
                className="w-full pl-9 pr-8 py-2.5 rounded-[10px] text-sm outline-none"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid #1C1928', color: '#EDE8FF', fontFamily: "'Manrope', sans-serif" }}
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none"
                  style={{ color: '#4A4565' }}>
                  ×
                </button>
              )}
            </div>
          </div>

          {/* Category tabs */}
          <div className="px-3 py-2 overflow-x-auto" style={{ borderBottom: '1px solid #1C1928', scrollbarWidth: 'none' }}>
            <div className="flex gap-1.5 whitespace-nowrap">
              <button onClick={() => setActiveCategory(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
                style={!activeCategory
                  ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#8B5CF6' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid transparent', color: 'rgba(139,133,168,0.5)' }}>
                All
              </button>
              {categories.map(c => (
                <button key={c.name} onClick={() => setActiveCategory(activeCategory === c.name ? null : c.name)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 flex items-center gap-1.5 transition-all"
                  style={activeCategory === c.name
                    ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', color: '#8B5CF6' }
                    : { background: 'rgba(255,255,255,0.03)', border: '1px solid transparent', color: 'rgba(139,133,168,0.5)' }}>
                  <span className="text-sm leading-none">{getCategoryEmoji(c.name)}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick sale row */}
          <div className="px-3 py-1.5 flex gap-1.5" style={{ borderBottom: '1px solid #1C1928' }}>
            <button onClick={() => { setCustomItemForm(f => ({ ...f, isNote: false })); setShowCustomItem(true); }}
              className="flex-1 text-xs rounded-lg py-1.5 transition-colors"
              style={{ border: '1px dashed #2A2540', color: '#4A4565' }}>
              + Custom item
            </button>
            <button onClick={() => { setCustomItemForm(f => ({ ...f, isNote: true, price: '0' })); setShowCustomItem(true); }}
              className="flex-1 text-xs rounded-lg py-1.5 transition-colors"
              style={{ border: '1px dashed #2A2540', color: '#4A4565' }}>
              + Note
            </button>
            <button onClick={() => setPriceCheckMode(v => !v)}
              className="px-2.5 text-xs rounded-lg py-1.5 transition-colors"
              style={priceCheckMode
                ? { background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', color: '#8B5CF6' }
                : { border: '1px solid #2A2540', color: '#4A4565' }}
              title="Price check mode">
              🔍
            </button>
          </div>

          {priceCheckMode && (
            <div className="px-3 py-1.5" style={{ background: 'rgba(139,92,246,0.06)', borderBottom: '1px solid rgba(139,92,246,0.15)' }}>
              <p className="text-xs font-medium" style={{ color: '#8B5CF6' }}>Price check mode — tap product to check price, not add to cart</p>
            </div>
          )}

          {/* Barcode lookup result */}
          {(barcodeScanning || barcodeLookupHit) && (
            <div className="mx-3 mb-2 mt-1">
              {barcodeScanning ? (
                <div className="rounded-lg px-3 py-2 text-xs flex items-center gap-2" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', color: '#8B5CF6' }}>
                  <span className="w-3 h-3 rounded-full border border-t-transparent animate-spin" style={{ borderColor: '#8B5CF6', borderTopColor: 'transparent' }} />
                  Looking up barcode…
                </div>
              ) : barcodeLookupHit && (
                <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                  <p className="text-xs font-medium" style={{ color: '#F59E0B' }}>{barcodeLookupHit.name}</p>
                  {barcodeLookupHit.brand && <p className="text-[10px]" style={{ color: 'rgba(245,158,11,0.7)' }}>{barcodeLookupHit.brand}</p>}
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(245,158,11,0.5)' }}>Not in your catalogue — add via Products</p>
                  <button onClick={() => setBarcodeLookupHit(null)} className="text-[10px] mt-0.5" style={{ color: 'rgba(245,158,11,0.4)' }}>Dismiss</button>
                </div>
              )}
            </div>
          )}

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="rounded-2xl p-3 animate-pulse" style={{ background: 'rgba(26,23,40,0.9)', border: '1px solid #2A2540' }}>
                    <div className="h-12 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div className="h-3 rounded mb-1" style={{ background: 'rgba(255,255,255,0.06)', width: '70%' }} />
                    <div className="h-3 rounded" style={{ background: 'rgba(255,255,255,0.04)', width: '45%' }} />
                  </div>
                ))}
              </div>
            ) : displayedProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <p className="text-3xl mb-2">📦</p>
                <p className="text-sm" style={{ color: '#4A4565' }}>{search ? `No products match "${search}"` : 'No products yet'}</p>
                {!search && <a href="/pos/products" className="mt-3 text-xs font-medium hover:underline" style={{ color: '#8B5CF6' }}>Add products →</a>}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {displayedProducts.map((p, idx) => {
                  const isOut = p.track_stock && p.stock_quantity <= 0;
                  const isLow = p.track_stock && p.stock_quantity > 0 && p.stock_quantity <= (p.low_stock_threshold ?? 5);
                  const catName = (p.pos_categories?.name ?? '').toLowerCase();
                  // Category gradient map
                  const catGrad: Record<string, { grad: string; border: string; color: string }> = {
                    'beer': { grad: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(146,64,14,0.4))', border: 'rgba(245,158,11,0.27)', color: '#F59E0B' },
                    'beer & cider': { grad: 'linear-gradient(135deg,rgba(245,158,11,0.2),rgba(146,64,14,0.4))', border: 'rgba(245,158,11,0.27)', color: '#F59E0B' },
                    'wine': { grad: 'linear-gradient(135deg,rgba(147,51,234,0.2),rgba(76,29,149,0.4))', border: 'rgba(147,51,234,0.27)', color: '#9333EA' },
                    'spirits': { grad: 'linear-gradient(135deg,rgba(59,130,246,0.2),rgba(30,58,95,0.4))', border: 'rgba(59,130,246,0.27)', color: '#3B82F6' },
                    'coffee': { grad: 'linear-gradient(135deg,rgba(161,98,7,0.2),rgba(69,26,3,0.4))', border: 'rgba(161,98,7,0.27)', color: '#A16207' },
                    'food': { grad: 'linear-gradient(135deg,rgba(239,68,68,0.2),rgba(127,29,29,0.4))', border: 'rgba(239,68,68,0.27)', color: '#EF4444' },
                    'soft drinks': { grad: 'linear-gradient(135deg,rgba(16,185,129,0.2),rgba(6,78,59,0.4))', border: 'rgba(16,185,129,0.27)', color: '#10B981' },
                    'snacks': { grad: 'linear-gradient(135deg,rgba(249,115,22,0.2),rgba(124,45,18,0.4))', border: 'rgba(249,115,22,0.27)', color: '#F97316' },
                  };
                  const cg = catGrad[catName] ?? { grad: 'linear-gradient(135deg,rgba(99,102,241,0.2),rgba(49,46,129,0.4))', border: 'rgba(99,102,241,0.27)', color: '#6366F1' };
                  return (
                    <button key={p.id}
                      onClick={() => {
                        if (isOut) return;
                        if (priceCheckMode) { setPriceCheckProd(p); return; }
                        checkAndAddToCart(p);
                      }}
                      onContextMenu={e => { e.preventDefault(); setContextMenu({ product: p, x: e.clientX, y: e.clientY }); }}
                      disabled={isOut}
                      className="relative text-left rounded-2xl overflow-hidden pos-card-enter"
                      style={{
                        background: 'rgba(26,23,40,0.9)',
                        border: '1px solid #2A2540',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
                        cursor: isOut ? 'not-allowed' : 'pointer',
                        transition: 'all 150ms cubic-bezier(0.16,1,0.3,1)',
                        filter: isOut ? 'grayscale(0.7)' : 'none',
                        opacity: isOut ? 0.5 : 1,
                        animationDelay: `${idx * 30}ms`,
                      }}
                      onMouseEnter={e => { if (!isOut) { const el = e.currentTarget as HTMLButtonElement; el.style.transform = 'translateY(-2px) scale(1.02)'; el.style.border = '1px solid rgba(139,92,246,0.3)'; el.style.boxShadow = '0 8px 24px rgba(0,0,0,0.5),0 0 0 1px rgba(139,92,246,0.2),inset 0 1px 0 rgba(255,255,255,0.06)'; }}}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLButtonElement; el.style.transform = ''; el.style.border = '1px solid #2A2540'; el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.04)'; }}
                      onMouseDown={e => { const el = e.currentTarget as HTMLButtonElement; el.style.transform = 'translateY(0) scale(0.97)'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)'; }}
                      onMouseUp={e => { const el = e.currentTarget as HTMLButtonElement; el.style.transform = 'translateY(-2px) scale(1.02)'; }}>
                      {/* Card top — category gradient */}
                      <div className="flex flex-col items-center justify-center py-3.5 relative overflow-hidden"
                        style={{ background: cg.grad, minHeight: 68, borderBottom: `1px solid ${cg.border}` }}>
                        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 30% 30%, ${cg.color}26, transparent 60%)`, opacity: 0.15 }} />
                        {(p as any).image_url ? (
                          <img src={(p as any).image_url} alt={p.name} className="h-12 w-12 object-contain relative z-10" />
                        ) : (
                          <div className="relative z-10 flex flex-col items-center">
                            <span className="text-2xl leading-none">{getCatStyle(p.pos_categories?.name).emoji}</span>
                            <span className="text-[9px] font-bold mt-0.5 tracking-wide" style={{ color: cg.color, opacity: 0.8 }}>
                              {p.name.slice(0, 6).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {isOut && (
                          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(10,9,16,0.5)' }}>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', color: '#EF4444' }}>Out</span>
                          </div>
                        )}
                      </div>
                      {/* Card bottom */}
                      <div className="px-2.5 py-2">
                        <p className="text-xs font-semibold leading-tight line-clamp-2 min-h-[32px]" style={{ color: '#EDE8FF' }}>
                          {p.name}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-sm font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: '#EDE8FF' }}>A${p.price.toFixed(2)}</span>
                          {isOut && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}>Out</span>
                          )}
                          {isLow && !isOut && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>{p.stock_quantity} left</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── CENTRE: Cart + Payment (or Receipt) ───────────────── */}
        <div className={`flex flex-col bg-gray-50 border-r border-gray-200 overflow-hidden
          ${mobileTab !== 'cart' ? 'hidden md:flex' : 'flex'}`}>

          {showReceipt ? (
            /* ── RECEIPT VIEW ─────────────────────────────────── */
            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4">
              <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
                {/* Success */}
                <div className="bg-emerald-50 px-6 py-4 flex items-center gap-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth={2.5} className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Sale complete</p>
                    <p className="text-xs text-gray-500">{showReceipt.businessName ?? businessName}</p>
                  </div>
                </div>
                {/* Receipt body */}
                <div className="px-5 py-4 font-mono text-xs text-gray-700 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Receipt</span><span>{showReceipt.sale_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Date</span>
                    <span>{new Date(showReceipt.created_at ?? Date.now()).toLocaleDateString('en-AU')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Time</span>
                    <span>{new Date(showReceipt.created_at ?? Date.now()).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {showReceipt.customerSnapshot && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Customer</span><span>{showReceipt.customerSnapshot.name}</span>
                    </div>
                  )}
                  <div className="border-t border-dashed border-gray-200 my-2 pt-2 space-y-1">
                    {(showReceipt.cartSnapshot ?? []).map((item: CartItem, i: number) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="flex-1 truncate">{item.qty}× {item.label ?? item.product.name}</span>
                        <span>A${(item.unitPrice * item.qty).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-dashed border-gray-200 pt-2 space-y-0.5">
                    <div className="flex justify-between text-gray-400 text-[10px]">
                      <span>Excl. GST</span><span>A${(showReceipt.total_amount / 1.1).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400 text-[10px]">
                      <span>GST (10%)</span><span>A${(showReceipt.total_amount - showReceipt.total_amount / 1.1).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-sm text-gray-900 mt-1">
                      <span>TOTAL</span><span>A${showReceipt.total_amount?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400 text-[10px]">
                      <span>Payment</span><span className="capitalize">{showReceipt.payment_method}</span>
                    </div>
                    {showReceipt.cash_tendered != null && (
                      <div className="flex justify-between text-gray-400 text-[10px]">
                        <span>Tendered</span><span>A${showReceipt.cash_tendered?.toFixed(2)}</span>
                      </div>
                    )}
                    {showReceipt.change_given != null && showReceipt.change_given > 0 && (
                      <div className="flex justify-between text-gray-400 text-[10px]">
                        <span>Change</span><span>A${showReceipt.change_given?.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-center text-gray-400 text-[10px] pt-2">Thank you for shopping with us!</p>
                  <p className="text-center text-gray-300 text-[9px]">Powered by Aria</p>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => window.print()}
                  className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50">
                  🖨️ Print
                </button>
                <button onClick={() => { setShowReceipt(null); if (window.innerWidth < 768) setMobileTab('products'); }}
                  className="px-5 py-2.5 rounded-xl bg-[#111827] text-white text-sm font-medium hover:bg-gray-800">
                  New Sale
                </button>
              </div>
            </div>
          ) : (
            /* ── CART VIEW ────────────────────────────────────── */
            <>
              {/* Cart header */}
              <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-gray-100 flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Current sale</span>
                {cart.length > 0 && (
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {cart.reduce((s, i) => s + i.qty, 0)} item{cart.reduce((s, i) => s + i.qty, 0) !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="flex-1" />
                {cart.length > 0 && (
                  <button onClick={() => parkSale()}
                    className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                    Park
                  </button>
                )}
                {cart.length > 0 && (
                  <button onClick={confirmClear}
                    className="text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                    Clear
                  </button>
                )}
                {/* Customer selector */}
                {customer ? (
                  <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[9px] font-bold text-blue-600 flex-shrink-0">
                      {customer.name[0]}
                    </div>
                    <span className="text-xs text-gray-700 max-w-[80px] truncate">{customer.name}</span>
                    {customer.loyalty_points > 0 && (
                      <span className="text-[10px] text-blue-500">{customer.loyalty_points}pts</span>
                    )}
                    <button onClick={() => { setCustomer(null); setCustomerSearch(''); }}
                      className="text-gray-300 hover:text-gray-500 text-base leading-none ml-0.5">×</button>
                  </div>
                ) : (
                  <div className="relative">
                    <input value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                      placeholder="+ Customer"
                      className="text-xs border border-dashed border-gray-300 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 w-28 text-gray-500" />
                    {customerResults.length > 0 && (
                      <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden w-48">
                        {customerResults.map(c => (
                          <button key={c.id}
                            onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }}
                            className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-50 last:border-0">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-900 truncate">{c.name}</p>
                              <p className="text-[10px] text-gray-400">{c.phone ?? c.email ?? ''}</p>
                            </div>
                            <span className="text-[10px] text-gray-400">{c.loyalty_points}pts</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sale attribution (commission) */}
              <div className="flex-shrink-0 px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider flex-shrink-0">Sale by</span>
                <input value={servedBy} onChange={e => setServedBy(e.target.value)}
                  placeholder="Cashier name…"
                  className="flex-1 text-xs text-gray-700 bg-transparent outline-none placeholder-gray-300" />
              </div>

              {/* Cart items */}
              <div className="flex-1 overflow-y-auto bg-white">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
                    <BagOutlineIcon className="w-10 h-10 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Add items to start a sale</p>
                  </div>
                ) : (
                  <div>
                    {cart.map(item => {
                      const key = cartKey(item);
                      const lineTotal = item.unitPrice * item.qty * (1 - (item.discount_percent ?? 0) / 100);
                      return (
                        <div key={key}
                          onClick={() => setSelectedItem(item.product.id)}
                          className={`group px-4 py-2.5 border-b border-gray-50 last:border-0 cursor-pointer transition-colors
                            ${selectedItem === item.product.id ? 'bg-gray-50' : 'hover:bg-gray-50/80'}`}>
                          {/* Row 1: name + total */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900 leading-snug">
                                {item.label ?? item.product.name}
                              </p>
                              {item.modifierDetails && item.modifierDetails.length > 0 && (
                                <p className="text-xs text-gray-400 italic mt-0.5">· {item.modifierDetails.map(m => m.name).join(', ')}</p>
                              )}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {(item.discount_percent ?? 0) > 0 && (
                                <p className="text-[10px] text-gray-400 line-through font-mono">A${(item.unitPrice * item.qty).toFixed(2)}</p>
                              )}
                              <p className="text-sm font-semibold font-mono text-gray-900">A${lineTotal.toFixed(2)}</p>
                            </div>
                          </div>
                          {/* Row 2: qty pill + remove */}
                          <div className="flex items-center justify-between">
                            {/* Connected pill qty control */}
                            <div className="flex rounded-full border border-gray-200 overflow-hidden shadow-sm">
                              <button
                                onClick={e => { e.stopPropagation(); updateQty(key, item.qty - 1); }}
                                className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm font-bold leading-none transition-colors">
                                −
                              </button>
                              <span className="px-3 py-1 font-mono text-sm font-bold text-gray-900 bg-white border-l border-r border-gray-200 min-w-[28px] text-center">
                                {item.qty}
                              </span>
                              <button
                                onClick={e => { e.stopPropagation(); updateQty(key, item.qty + 1); }}
                                className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm font-bold leading-none transition-colors">
                                +
                              </button>
                            </div>
                            <button onClick={e => { e.stopPropagation(); updateQty(key, 0); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-base leading-none px-1">×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Discount row */}
              {cart.length > 0 && (
                <div className="flex-shrink-0 px-4 py-2 border-t border-gray-100 bg-white flex items-center gap-2">
                  {discountMode === null ? (
                    <>
                      <button onClick={() => setDiscountMode('pct')}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white hover:bg-gray-50">
                        % Discount
                      </button>
                      <button onClick={() => setDiscountMode('amt')}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white hover:bg-gray-50">
                        A$ Discount
                      </button>
                    </>
                  ) : (
                    <>
                      <input
                        type="number" min="0" max={discountMode === 'pct' ? 100 : undefined}
                        value={discountVal}
                        onChange={e => setDiscountVal(e.target.value)}
                        placeholder={discountMode === 'pct' ? '10' : '5.00'}
                        className="w-20 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-gray-300"
                        autoFocus />
                      <span className="text-xs text-gray-400">{discountMode === 'pct' ? '%' : 'A$'}</span>
                      <button onClick={() => {
                        const val = parseFloat(discountVal);
                        if (isNaN(val) || val <= 0) { setDiscountMode(null); setDiscountVal(''); return; }
                        if (selectedItem) {
                          setCart(c => c.map(i => {
                            if (i.product.id !== selectedItem) return i;
                            const pct = discountMode === 'pct' ? Math.min(100, val) : Math.min(100, (val / i.unitPrice) * 100);
                            return { ...i, discount_percent: pct };
                          }));
                        } else {
                          setCart(c => c.map(i => {
                            const pct = discountMode === 'pct' ? Math.min(100, val) : Math.min(100, (val / i.unitPrice) * 100);
                            return { ...i, discount_percent: pct };
                          }));
                        }
                        setDiscountMode(null); setDiscountVal('');
                      }} className="text-xs bg-gray-900 text-white rounded-lg px-3 py-1.5">Apply</button>
                      <button onClick={() => { setDiscountMode(null); setDiscountVal(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                    </>
                  )}
                  {cart.some(i => (i.discount_percent ?? 0) > 0) && (
                    <span className="text-xs text-[#059669] ml-auto">
                      Discount applied ·{' '}
                      <button onClick={() => setCart(c => c.map(i => ({ ...i, discount_percent: 0 })))} className="text-red-400 hover:underline">Remove</button>
                    </span>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="flex-shrink-0 px-3 py-3 bg-white border-t border-gray-200">
                <div className="bg-gray-50 rounded-2xl px-3 py-2.5 space-y-1">
                  <div className="flex justify-between text-sm py-0.5">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-mono text-gray-900">A${netAmount.toFixed(2)}</span>
                  </div>
                  {cart.some(i => (i.discount_percent ?? 0) > 0) && (
                    <div className="flex justify-between text-sm py-0.5">
                      <span className="text-gray-600">Discount</span>
                      <span className="font-mono text-green-600">-A${(subtotal / 1.1 - netAmount < 0 ? 0 : (cart.reduce((s,i)=>s+i.unitPrice*i.qty,0)/1.1 - netAmount)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-400">GST (10%)</span>
                    <span className="font-mono text-gray-500">A${taxAmount.toFixed(2)}</span>
                  </div>
                  {payMethod === 'cash' && Math.abs(roundedTotal - total) > 0.001 && (
                    <div className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-400">Cash rounding</span>
                      <span className="font-mono text-gray-500">{(roundedTotal - total) > 0 ? '+' : ''}A${(roundedTotal - total).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t border-dashed border-gray-200 pt-2 mt-1 flex justify-between items-baseline">
                    <span className="text-base font-bold text-gray-900">Total</span>
                    <span className="text-2xl font-black font-mono text-gray-900">A${roundedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Payment section */}
              <div className="flex-shrink-0 px-4 py-3 bg-white border-t border-gray-300">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">Payment method</p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {([
                    { id: 'card', label: 'Card', emoji: '💳' },
                    { id: 'cash', label: 'Cash', emoji: '💵' },
                    { id: 'split', label: 'Split', emoji: '✂️' },
                  ] as const).map(m => (
                    <button key={m.id} onClick={() => setPayMethod(m.id)}
                      className={`border-2 rounded-2xl min-h-[64px] flex flex-col items-center justify-center gap-1 transition-all font-medium ${
                        payMethod === m.id
                          ? 'border-gray-900 bg-gray-900 text-white shadow-md'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:shadow-sm'
                      }`}>
                      <span className="text-2xl">{m.emoji}</span>
                      <span className="text-xs font-semibold">{m.label}</span>
                    </button>
                  ))}
                </div>

                {payMethod === 'cash' && (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs text-gray-400">Amount tendered</p>
                    <div className="relative">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">A$</span>
                      <input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                        placeholder="0.00"
                        className="w-full border-2 border-gray-200 rounded-full pl-12 pr-5 py-3 text-2xl font-mono font-bold text-center bg-white outline-none focus:border-gray-900 transition-colors shadow-sm"
                        autoFocus />
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {[...new Set([roundedTotal, Math.ceil(roundedTotal/5)*5, Math.ceil(roundedTotal/10)*10, 50])].filter(v=>v>=roundedTotal).slice(0,4).map(v => (
                        <button key={v} onClick={() => setCashTendered(v.toFixed(2))}
                          className="text-xs border border-gray-200 rounded-full px-3 py-1.5 bg-white hover:bg-gray-50 font-mono shadow-sm">
                          A${v.toFixed(0)}
                        </button>
                      ))}
                    </div>
                    {tendered >= roundedTotal && (
                      <div className="bg-green-50 border-2 border-green-200 rounded-2xl px-5 py-3 text-center">
                        <p className="text-xs text-green-600 uppercase tracking-wider font-medium mb-0.5">Change</p>
                        <p className="text-3xl font-black font-mono text-green-700">A${change.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                )}
                {payMethod === 'card' && (
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-center mb-3">
                    <p className="text-2xl mb-1">💳</p>
                    <p className="text-sm text-gray-500">Process on EFTPOS</p>
                    <p className="text-xl font-black font-mono text-gray-900 mt-0.5">A${roundedTotal.toFixed(2)}</p>
                  </div>
                )}
                {payMethod === 'split' && (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs text-gray-400">Cash portion</p>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-sm">A$</span>
                      <input type="number" value={splitCash} onChange={e => setSplitCash(e.target.value)} placeholder="0.00"
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-3 text-xl font-mono bg-gray-50 outline-none focus:ring-2 focus:ring-gray-900" />
                    </div>
                    <div className="flex justify-between items-center bg-gray-50 rounded-xl px-4 py-2.5">
                      <span className="text-xs text-gray-500">Card remainder</span>
                      <span className="font-bold font-mono text-gray-900">A${splitCardAmt.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* Complete Sale + Hold buttons */}
                {!registerIsOpen && !registerLoading ? (
                  <button onClick={() => setShowRegisterModal(true)}
                    className="w-full h-14 bg-[#059669] hover:bg-emerald-700 text-white font-semibold text-base rounded-xl transition-colors">
                    Open Register to Sell
                  </button>
                ) : (
                  <div className="flex gap-2">
                    {cart.length > 0 && (
                      <button onClick={parkSale}
                        className="h-14 px-4 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-50 flex-shrink-0 flex flex-col items-center justify-center gap-0.5">
                        <span>⏸</span>
                        <span className="text-[10px]">Hold</span>
                      </button>
                    )}
                    <button
                      onClick={processSale}
                      disabled={!cart.length || !registerIsOpen || processing || (payMethod === 'cash' && cashTendered !== '' && tendered < roundedTotal)}
                      className="flex-1 h-16 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 text-white font-bold rounded-2xl shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all duration-150 flex items-center justify-center gap-3"
                      style={{ background: processing ? '#374151' : 'linear-gradient(135deg, #111827 0%, #1f2937 100%)' }}>
                      {processing ? (
                        <><Spinner /> <span className="text-base">Processing…</span></>
                      ) : (
                        <>
                          <span className="text-lg font-bold">Complete Sale</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-xl font-black font-mono">A${roundedTotal.toFixed(2)}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT: Aria + Recent sales ────────────────────────── */}
        <div className={`flex flex-col bg-white overflow-hidden
          ${mobileTab !== 'aria' ? 'hidden md:flex' : 'flex'}`}>

          {/* Aria header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #fafafa 100%)' }}>
            <div className="flex items-center gap-2">
              <div className="relative">
                <span className="w-2 h-2 rounded-full bg-emerald-400 block" />
                <span className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </div>
              <div>
                <span className="text-sm font-bold text-gray-900">Aria</span>
                <span className="text-[10px] text-gray-400 ml-1.5">AI co-pilot</span>
              </div>
            </div>
            <kbd className="text-[10px] bg-white border border-gray-200 text-gray-500 rounded px-1.5 py-0.5 shadow-sm">⌘K</kbd>
          </div>

          {/* Proactive alerts */}
          <div className="flex-shrink-0 px-3 py-2 space-y-1.5">
            {ageRestrictedInCart && (
              <div className="bg-red-50 rounded-lg px-2.5 py-1.5 text-xs text-red-700 flex items-center gap-1.5">
                🔞 ID check required
              </div>
            )}
            {loyaltyCustomer && (
              <div className="bg-blue-50 rounded-lg px-2.5 py-1.5 text-xs text-blue-700 flex items-center gap-1.5">
                ⭐ {customer!.name} has {customer!.loyalty_points} loyalty points
              </div>
            )}
            {lowStockItems.slice(0, 2).map(p => (
              <div key={p.id} className="bg-amber-50 rounded-lg px-2.5 py-1.5 text-xs text-amber-700 flex items-center gap-1.5">
                ⚠️ {p.name} at {p.stock_quantity} units
              </div>
            ))}
          </div>

          {/* Product suggestions */}
          {(suggestions.length > 0 || suggestionsLoading) && (
            <div className="flex-shrink-0 px-3 pb-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Often bought together</p>
              {suggestionsLoading ? (
                <div className="h-6 bg-gray-100 rounded animate-pulse w-2/3" />
              ) : (
                <div className="flex flex-col gap-1">
                  {suggestions.map(s => {
                    const prod = products.find(p => p.id === s.id);
                    return (
                      <button key={s.id}
                        onClick={() => prod && checkAndAddToCart(prod)}
                        disabled={!prod}
                        className="text-left px-2.5 py-1.5 rounded-lg border border-gray-100 bg-gray-50 hover:border-gray-300 hover:bg-white transition-colors text-xs disabled:opacity-40">
                        <span className="font-medium text-gray-900">{s.name}</span>
                        <span className="text-gray-400 ml-1.5 font-mono">A${s.price?.toFixed(2)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Aria chat */}
          <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 min-h-0">
            {chatMessages.length === 0 && (
              <p className="text-xs text-gray-400 text-center pt-4 px-2">
                Ask about products, GST, stock levels, or today's sales.
              </p>
            )}
            {chatMessages.slice(-4).map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-snug ${
                  m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-emerald-50 text-emerald-900'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-emerald-50 rounded-xl px-3 py-2 text-xs text-emerald-700 animate-pulse">Thinking…</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Aria input */}
          <div className="flex-shrink-0 px-3 pb-2">
            <div className="flex gap-1.5 items-center bg-white border border-gray-200 rounded-full shadow-sm px-3 py-1.5">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAriaChat(); } }}
                placeholder="Ask Aria…"
                className="flex-1 text-xs bg-transparent outline-none placeholder-gray-400" />
              <button onClick={sendAriaChat} disabled={!chatInput.trim() || chatLoading}
                className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs disabled:opacity-40 flex items-center justify-center flex-shrink-0">↑</button>
            </div>
          </div>

          {/* Log missed sale */}
          <div className="flex-shrink-0 px-3 pb-3">
            <button onClick={() => setShowMissedModal(true)}
              className="w-full border border-dashed border-gray-200 rounded-lg py-2 text-xs text-gray-400 hover:text-gray-600 hover:border-gray-300 transition-colors">
              Log missed sale
            </button>
          </div>

          {/* Parked sales in Aria panel */}
          {parkedSales.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-100 px-3 py-2">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Held sales ({parkedSales.length})</p>
              <div className="space-y-1">
                {parkedSales.slice(0, 3).map(p => (
                  <button key={p.id} onClick={() => restoreParked(p)}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-left transition-colors">
                    <span className="text-xs text-gray-700 truncate">{p.label || 'Sale'} · {Array.isArray(p.items) ? p.items.length : 0} items</span>
                    <span className="text-xs font-mono font-medium text-gray-900 flex-shrink-0 ml-2">A${(p.total || 0).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recent sales */}
          <div className="flex-shrink-0 border-t border-gray-100">
            <div className="px-4 py-2">
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Recent sales</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-3 min-h-0" style={{ maxHeight: '160px' }}>
            {recentSales.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No sales yet this session</p>
            ) : (
              <div>
                {recentSales.map(s => (
                  <div key={s.id} className="py-2 border-b border-gray-50 last:border-0 group flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>#{s.id.slice(-6).toUpperCase()}</span>
                        <span>{s.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-xs text-gray-600">{s.items} item{s.items !== 1 ? 's' : ''}</span>
                        <span className="text-xs font-semibold font-mono text-gray-900">A${s.total.toFixed(2)}</span>
                      </div>
                    </div>
                    <button onClick={() => setReprintSale(s)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-600 flex-shrink-0 text-base"
                      title="Reprint receipt">
                      🖨️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts bar — desktop only */}
      <div className="hidden md:flex flex-shrink-0 bg-gray-50 border-t border-gray-200 h-8 items-center px-4 gap-4 overflow-hidden">
        {[
          ['F1','Search'], ['F2','Custom item'], ['F3','Hold'], ['F8','Cash'],
          ['F9','Card'], ['F10','Complete'], ['Esc','Clear'],
        ].map(([key, label]) => (
          <span key={key} className="flex items-center gap-1 text-[10px] text-gray-400 whitespace-nowrap">
            <kbd className="bg-white border border-gray-200 rounded px-1 py-0.5 text-gray-500 font-mono text-[10px]">{key}</kbd>
            {label}
          </span>
        ))}
      </div>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden flex-shrink-0 bg-white border-t border-gray-200 h-16 grid grid-cols-3">
        {([
          { tab: 'products' as const, label: 'Products', icon: '🛍️' },
          { tab: 'cart' as const, label: `Cart${cart.length > 0 ? ` (${cart.reduce((s,i)=>s+i.qty,0)})` : ''}`, icon: '🛒' },
          { tab: 'aria' as const, label: 'Aria', icon: '✦' },
        ]).map(t => (
          <button key={t.tab} onClick={() => setMobileTab(t.tab)}
            className={`flex flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
              mobileTab === t.tab ? 'text-gray-900' : 'text-gray-400'
            }`}>
            <span className="text-lg">{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}

      {/* Variant / Modifier modal */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">{variantModal.product.name}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Base A${variantModal.product.price.toFixed(2)} — select options below
              </p>
            </div>
            <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
              {variantModal.variantGroups.map(g => (
                <div key={g.id}>
                  <p className="text-xs font-semibold text-gray-600 mb-2">{g.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {(g.values as string[]).map(v => {
                      const priceNote = g.affects_price && g.price_map[v] != null ? ` · A$${g.price_map[v].toFixed(2)}` : '';
                      return (
                        <button key={v} onClick={() => setSelectedVariants(p => ({ ...p, [g.id]: v }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            selectedVariants[g.id] === v ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}>
                          {v}{priceNote}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {variantModal.modifiers.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 mb-2">Extras</p>
                  <div className="space-y-2">
                    {variantModal.modifiers.map(m => (
                      <label key={m.id} className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={!!selectedMods[m.id]}
                          onChange={e => setSelectedMods(p => ({ ...p, [m.id]: e.target.checked }))}
                          className="w-4 h-4 accent-gray-900" />
                        <span className="text-xs text-gray-900 flex-1">{m.name}</span>
                        {m.price_adjustment !== 0 && (
                          <span className="text-xs text-gray-400 font-mono">
                            {m.price_adjustment > 0 ? '+' : ''}A${m.price_adjustment.toFixed(2)}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-600 mb-2">Quantity</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => setVariantQty(q => Math.max(1, q - 1))}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50">−</button>
                  <span className="text-base font-bold text-gray-900 w-6 text-center">{variantQty}</span>
                  <button onClick={() => setVariantQty(q => q + 1)}
                    className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50">+</button>
                </div>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setVariantModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmVariantSelection}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Open Register modal */}
      {showRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Open Register</h2>
              <p className="text-xs text-gray-400 mt-0.5">Enter opening float to start trading.</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Opening float (A$)</label>
                <input type="number" min="0" step="0.01" value={openingFloat}
                  onChange={e => setOpeningFloat(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-gray-900 outline-none focus:ring-2 focus:ring-[#059669]" autoFocus />
              </div>
              {registerError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowRegisterModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={openRegister} disabled={openingRegister}
                className="flex-1 py-2.5 rounded-xl bg-[#059669] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-emerald-700">
                {openingRegister ? <><Spinner /> Opening…</> : 'Open Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Register modal */}
      {showCloseModal && registerSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Close Register</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Opened {new Date(registerSession.opened_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })} · Float A${(registerSession.opening_float || 0).toFixed(2)}
              </p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1.5">Closing float counted (A$)</label>
                <input type="number" min="0" step="0.01" value={closingFloat}
                  onChange={e => setClosingFloat(e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-gray-900 outline-none focus:ring-2 focus:ring-red-500" autoFocus />
              </div>
              {registerError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{registerError}</p>}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowCloseModal(false); setRegisterError(null); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={closeRegister} disabled={closingRegister}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-red-700">
                {closingRegister ? <><Spinner /> Closing…</> : 'Close Register'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parked sales drawer */}
      {showParked && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Parked Sales</h2>
              <button onClick={() => setShowParked(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
              {parkedSales.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No parked sales. Press F8 to park.</p>
              ) : parkedSales.map(p => (
                <button key={p.id} onClick={() => restoreParked(p)}
                  className="w-full flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-300 transition-all text-left">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{p.label || 'Parked Sale'}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {Array.isArray(p.items) ? p.items.length : 0} items · {new Date(p.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold font-mono text-gray-900">A${(p.total || 0).toFixed(2)}</p>
                    <p className="text-[10px] text-[#059669] mt-0.5">Restore →</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Missed sale modal */}
      {showMissedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Log Missed Sale</h2>
              <p className="text-xs text-gray-400 mt-0.5">Record what a customer asked for that you didn't stock</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <input value={missedName} onChange={e => setMissedName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Product name e.g. Oat Milk 1L" autoFocus />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Qty wanted</label>
                <input type="number" min="1" value={missedQty} onChange={e => setMissedQty(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900" />
              </div>
              <input value={missedNote} onChange={e => setMissedNote(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Customer note (optional)" />
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowMissedModal(false); setMissedName(''); setMissedQty('1'); setMissedNote(''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button disabled={savingMissed || !missedName.trim()}
                onClick={async () => {
                  if (!businessId || !missedName.trim()) return;
                  setSavingMissed(true);
                  try {
                    await fetch('/api/pos/missed-demand', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ business_id: businessId, product_name: missedName.trim(),
                        estimated_quantity_wanted: parseInt(missedQty) || 1, customer_note: missedNote || undefined, logged_by: 'pos_terminal' }),
                    });
                    setShowMissedModal(false);
                    setMissedName(''); setMissedQty('1'); setMissedNote('');
                  } finally { setSavingMissed(false); }
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-400 text-gray-900 text-sm font-semibold disabled:opacity-40 hover:bg-amber-500">
                {savingMissed ? 'Saving…' : 'Log it'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom item / Note modal */}
      {showCustomItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {customItemForm.isNote ? 'Add Note to Cart' : 'Custom Item'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {customItemForm.isNote ? 'Non-priced note — appears on receipt' : 'One-time item, not saved to products'}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">{customItemForm.isNote ? 'Note text' : 'Description'}</label>
                <input value={customItemForm.desc} onChange={e => setCustomItemForm(f => ({ ...f, desc: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder={customItemForm.isNote ? 'e.g. Gift wrap requested' : 'e.g. Custom engraving'} autoFocus />
              </div>
              {!customItemForm.isNote && (
                <>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 mb-1 block">Price (A$)</label>
                      <input type="number" min="0" step="0.01" value={customItemForm.price}
                        onChange={e => setCustomItemForm(f => ({ ...f, price: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                    </div>
                    <div className="w-20">
                      <label className="text-xs text-gray-500 mb-1 block">Qty</label>
                      <input type="number" min="1" value={customItemForm.qty}
                        onChange={e => setCustomItemForm(f => ({ ...f, qty: e.target.value }))}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={customItemForm.taxable}
                      onChange={e => setCustomItemForm(f => ({ ...f, taxable: e.target.checked }))}
                      className="w-4 h-4 accent-gray-900" />
                    <span className="text-sm text-gray-700">GST inclusive (10%)</span>
                  </label>
                </>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowCustomItem(false); setCustomItemForm({ desc: '', price: '', qty: '1', taxable: true, isNote: false }); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={addCustomItemToCart}
                disabled={!customItemForm.desc.trim() || (!customItemForm.isNote && !customItemForm.price)}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-gray-800">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Price check overlay */}
      {priceCheckProd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100 text-center">
              <p className="text-xs text-blue-500 font-medium uppercase tracking-wider mb-1">Price Check</p>
              <h2 className="text-lg font-bold text-gray-900">{priceCheckProd.name}</h2>
              {priceCheckProd.pos_categories && <p className="text-sm text-gray-500">{priceCheckProd.pos_categories.name}</p>}
            </div>
            <div className="px-6 py-5 text-center">
              <p className="text-4xl font-bold font-mono text-gray-900 mb-1">A${priceCheckProd.price.toFixed(2)}</p>
              <p className="text-xs text-gray-400">Includes GST: A${(priceCheckProd.price - priceCheckProd.price / 1.1).toFixed(2)}</p>
              {priceCheckProd.track_stock && (
                <p className={`mt-3 text-sm font-medium ${priceCheckProd.stock_quantity <= 0 ? 'text-red-500' : priceCheckProd.stock_quantity <= priceCheckProd.low_stock_threshold ? 'text-amber-500' : 'text-emerald-600'}`}>
                  {priceCheckProd.stock_quantity <= 0 ? 'Out of stock' : `${priceCheckProd.stock_quantity} in stock`}
                </p>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setPriceCheckProd(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Close</button>
              <button onClick={() => { checkAndAddToCart(priceCheckProd); setPriceCheckProd(null); setPriceCheckMode(false); }}
                disabled={priceCheckProd.track_stock && priceCheckProd.stock_quantity <= 0}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 hover:bg-gray-800">
                Add to cart
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Process Refund</h2>
                <p className="text-xs text-gray-400 mt-0.5">Search by receipt number or customer name</p>
              </div>
              <button onClick={() => { setShowRefundModal(false); setRefundSale(null); setRefundSearch(''); setRefundResults([]); }}
                className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {!refundSale ? (
                <>
                  <input value={refundSearch} onChange={e => { setRefundSearch(e.target.value); searchRefundSales(e.target.value); }}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                    placeholder="Search receipt # or customer name…" autoFocus />
                  <div className="space-y-2">
                    {refundResults.map((sale: any) => (
                      <button key={sale.id} onClick={() => { setRefundSale(sale); setRefundItems({}); }}
                        className="w-full flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:border-gray-300 text-left transition-all">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">#{sale.sale_number ?? sale.id?.slice(-6).toUpperCase()}</p>
                          <p className="text-xs text-gray-400">{new Date(sale.created_at).toLocaleDateString('en-AU')} · {sale.customer_name ?? 'Walk-in'}</p>
                        </div>
                        <span className="font-mono font-semibold text-sm text-gray-900">A${(sale.total_amount ?? 0).toFixed(2)}</span>
                      </button>
                    ))}
                    {refundSearch.length >= 2 && refundResults.length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-4">No sales found</p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">#{refundSale.sale_number ?? refundSale.id?.slice(-6).toUpperCase()}</p>
                      <p className="text-xs text-gray-400">{new Date(refundSale.created_at).toLocaleDateString('en-AU')} · A${(refundSale.total_amount ?? 0).toFixed(2)}</p>
                    </div>
                    <button onClick={() => setRefundSale(null)} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
                  </div>
                  <p className="text-xs text-gray-500">Select items to refund:</p>
                  <div className="space-y-1.5">
                    {(refundSale.items ?? []).map((item: any) => (
                      <label key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={!!refundItems[item.id]}
                          onChange={e => setRefundItems(r => ({ ...r, [item.id]: e.target.checked }))}
                          className="w-4 h-4 accent-gray-900" />
                        <div className="flex-1">
                          <p className="text-sm text-gray-900">{item.product_name ?? item.name}</p>
                          <p className="text-xs text-gray-400">qty {item.quantity} × A${(item.unit_price ?? 0).toFixed(2)}</p>
                        </div>
                        <span className="font-mono text-sm text-gray-900">A${(item.line_total ?? 0).toFixed(2)}</span>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2">
                    <p className="text-sm font-medium text-gray-900">
                      Refund total: A${(refundSale.items ?? []).filter((i: any) => refundItems[i.id]).reduce((s: number, i: any) => s + (i.line_total ?? 0), 0).toFixed(2)}
                    </p>
                  </div>
                </>
              )}
            </div>
            {refundSale && (
              <div className="px-6 pb-6 flex gap-2">
                <button onClick={() => { setShowRefundModal(false); setRefundSale(null); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
                <button onClick={processRefund} disabled={processingRefund || Object.values(refundItems).every(v => !v)}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-700 flex items-center justify-center gap-2">
                  {processingRefund ? <><Spinner /> Processing…</> : 'Process Refund'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cashier switch modal */}
      {showCashierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Switch Cashier</h2>
              <p className="text-xs text-gray-400 mt-0.5">Current: {registerSession?.opened_by ?? 'Unknown'}</p>
            </div>
            <div className="px-6 py-5">
              <label className="text-xs text-gray-500 mb-1.5 block">New cashier name</label>
              <input value={cashierName} onChange={e => setCashierName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') switchCashier(); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-gray-900"
                placeholder="Enter name…" autoFocus />
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => { setShowCashierModal(false); setCashierName(''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">Cancel</button>
              <button onClick={switchCashier} disabled={!cashierName.trim() || switchingCashier}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2">
                {switchingCashier ? <><Spinner /> Switching…</> : 'Switch'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt reprint modal */}
      {reprintSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
            <div className="bg-emerald-50 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="font-semibold text-gray-900 text-sm">#{reprintSale.id.slice(-6).toUpperCase()}</p>
              <button onClick={() => setReprintSale(null)} className="text-gray-400 hover:text-gray-600">×</button>
            </div>
            <div className="px-5 py-4 font-mono text-xs text-gray-700 space-y-0.5">
              <div className="flex justify-between"><span className="text-gray-400">Time</span><span>{reprintSale.time.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Items</span><span>{reprintSale.items}</span></div>
              <div className="flex justify-between font-bold text-sm text-gray-900 mt-2"><span>TOTAL</span><span>A${reprintSale.total.toFixed(2)}</span></div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setReprintSale(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500">Close</button>
              <button onClick={() => window.print()} className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium">🖨️ Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Product context menu */}
      {contextMenu && (
        <div className="fixed z-50" style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={() => setContextMenu(null)}>
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl py-1 min-w-44"
            onClick={e => e.stopPropagation()}>
            {[
              { label: 'View price & stock', action: () => { setPriceCheckProd(contextMenu.product); setContextMenu(null); } },
              { label: 'Edit price', action: async () => {
                const newPrice = prompt(`New price for ${contextMenu.product.name}:`, contextMenu.product.price.toFixed(2));
                if (newPrice && !isNaN(parseFloat(newPrice))) {
                  await fetch('/api/pos/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: contextMenu.product.id, price: parseFloat(newPrice) }) });
                  setProducts(ps => ps.map(p => p.id === contextMenu.product.id ? { ...p, price: parseFloat(newPrice!) } : p));
                }
                setContextMenu(null);
              }},
              { label: 'Reorder product', action: () => { window.location.href = `/pos/orders?product=${contextMenu.product.id}`; setContextMenu(null); } },
              { label: 'View in products', action: () => { window.location.href = `/pos/products?q=${encodeURIComponent(contextMenu.product.name)}`; setContextMenu(null); } },
            ].map(item => (
              <button key={item.label} onClick={item.action}
                className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                {item.label}
              </button>
            ))}
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => setContextMenu(null)} className="block w-full text-left px-4 py-2.5 text-xs text-gray-400 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      {/* Age verification modal */}
      {showAgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-50 px-6 py-5 border-b border-red-100">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🔞</span>
                <div>
                  <h2 className="text-base font-bold text-gray-900">Age verification required</h2>
                  <p className="text-xs text-red-600 mt-0.5">This sale contains age-restricted items</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700">
                You must verify the customer is <span className="font-semibold">18 years or older</span> before completing this sale.
              </p>
              <p className="text-xs text-gray-400 mt-2">Check photo ID (driver's licence, passport, or Proof of Age card).</p>
            </div>
            <div className="px-6 pb-6 flex gap-2">
              <button onClick={() => setShowAgeModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">
                Cancel sale
              </button>
              <button
                onClick={() => { setAgeVerified(true); setShowAgeModal(false); processSale(); }}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800">
                ✓ ID verified — complete sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Variant loading overlay */}
      {variantLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
            <Spinner /><span className="text-sm text-gray-700">Loading options…</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function Spinner() {
  return <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>;
}
function SearchIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}
function BagOutlineIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>;
}
