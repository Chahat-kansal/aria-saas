'use client';
import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { isMobileDevice, hasCameraSupport } from '@/lib/mobile-detect';
import { getOfflineQueue, queueOfflineSale, saveProductsToCache, loadProductsFromCache, clearOfflineQueue } from '@/lib/pos-offline';

// Lazy-load ZXing — never loads server-side or until user opens camera
const BarcodeScanner = lazy(() => import('@/components/pos/BarcodeScanner'));

/* ─── Types ─────────────────────────────────────────────────────── */
interface CartItem {
  id:          string;
  name:        string;
  price_cents: number;
  quantity:    number;
  barcode?:    string;
  sku?:        string;
}

interface SessionInfo {
  id:        string;
  opened_by: string | null;
  status:    string;
}

type ViewState = 'cart' | 'scanning' | 'payment' | 'receipt';

type AppMode = 'sell' | 'stocktake' | 'order' | 'receive'

type InventoryItem = {
  product_id:      string
  product_name:    string
  barcode?:        string
  sku?:            string
  current_stock:   number
  scanned_qty:     number
  unit_cost_cents: number
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function fmt(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

function roundToFiveCents(cents: number): number {
  return Math.round(cents / 5) * 5;
}

/* ─── Spinner ────────────────────────────────────────────────────── */
function Spinner() {
  return <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white animate-spin" />;
}

/* ─── Main page ──────────────────────────────────────────────────── */
export default function MobileTerminal() {
  const [businessId,   setBusinessId]   = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('AriaPOS');
  const [view,         setView]         = useState<ViewState>('cart');
  const [cart,         setCart]         = useState<CartItem[]>([]);
  const [session,      setSession]      = useState<SessionInfo | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [notFound,     setNotFound]     = useState<string | null>(null);
  const [processing,   setProcessing]   = useState(false);
  const [payMethod,    setPayMethod]    = useState<'cash' | 'eftpos'>('eftpos');
  const [cashTendered, setCashTendered] = useState('');
  const [saleResult,   setSaleResult]   = useState<{ offline: boolean; total: number; change: number } | null>(null);
  const [syncMsg,      setSyncMsg]      = useState('');

  const [appMode,       setAppMode]       = useState<AppMode>('sell')
  const [invSession,    setInvSession]    = useState<{ id: string } | null>(null)
  const [invItems,      setInvItems]      = useState<InventoryItem[]>([])
  const [invScanning,   setInvScanning]   = useState(false)
  const [invSubmitting, setInvSubmitting] = useState(false)
  const [invDone,       setInvDone]       = useState(false)

  /* ── Bootstrap ────────────────────────────────────────────────── */
  useEffect(() => {
    // Load business info + products cache
    (async () => {
      try {
        const r = await fetch('/api/pos/products');
        if (r.ok) {
          const d = await r.json();
          if (d.business_id)   setBusinessId(d.business_id);
          if (d.business_name) setBusinessName(d.business_name);
          if (d.products)      saveProductsToCache(d.products);
        }
      } catch {
        // Use cache
        const cached = loadProductsFromCache();
        if (cached?.products?.length) {
          // extract business name from cache not possible, keep default
        }
      }

      // Load session
      try {
        const r = await fetch('/api/pos/sessions');
        if (r.ok) {
          const d = await r.json();
          setSession(d.openSession ?? null);
        }
      } catch { /* offline */ }

      // Offline queue count
      setOfflineCount(getOfflineQueue().length);

      // Attempt to sync any queued offline sales
      await syncOfflineQueue();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function syncOfflineQueue() {
    const queue = getOfflineQueue();
    if (queue.length === 0) return;
    try {
      const r = await fetch('/api/pos/sync-offline', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ sales: queue, business_id: businessId }),
      });
      if (r.ok) {
        const d = await r.json();
        if (d.synced > 0) {
          clearOfflineQueue();
          setOfflineCount(0);
          setSyncMsg(`✓ ${d.synced} offline sale${d.synced > 1 ? 's' : ''} synced`);
          setTimeout(() => setSyncMsg(''), 4000);
        }
      }
    } catch { /* still offline */ }
  }

  /* ── Barcode scan handler ─────────────────────────────────────── */
  const handleScan = useCallback(async (barcode: string) => {
    setNotFound(null);

    // 1. Try server API
    try {
      const url = `/api/pos/products/scan?barcode=${encodeURIComponent(barcode)}${businessId ? `&business_id=${businessId}` : ''}`;
      const r = await fetch(url);
      if (r.ok) {
        const { product } = await r.json();
        if (product) { addToCart(product); setView('cart'); return; }
      }
    } catch { /* offline — fall through */ }

    // 2. Offline cache fallback
    const cached = loadProductsFromCache();
    if (cached?.products) {
      const found = cached.products.find((p: Record<string, unknown>) =>
        p.barcode === barcode || p.sku === barcode
      );
      if (found) { addToCart(found as Record<string, unknown>); setView('cart'); return; }
    }

    // 3. Not found
    setNotFound(barcode);
    setView('cart');
  }, [businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCart = useCallback((product: Record<string, unknown>) => {
    const id    = product.id as string;
    const price = typeof product.price === 'number' ? product.price : parseFloat(product.price as string) || 0;
    setCart(prev => {
      const existing = prev.find(i => i.id === id);
      if (existing) return prev.map(i => i.id === id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        id,
        name:        product.name as string,
        price_cents: Math.round(price * 100),
        quantity:    1,
        barcode:     product.barcode as string | undefined,
        sku:         product.sku as string | undefined,
      }];
    });
  }, []);

  const updateQty = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.id === id ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
          .filter(i => i.quantity > 0)
    );
  };

  /* ── Calculations ─────────────────────────────────────────────── */
  const subtotalCents = cart.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const gstCents      = Math.round(subtotalCents - subtotalCents / 1.1);
  const totalCents    = subtotalCents;
  const roundedTotal  = payMethod === 'cash' ? roundToFiveCents(totalCents) : totalCents;
  const tenderedCents = Math.round(parseFloat(cashTendered || '0') * 100);
  const changeCents   = payMethod === 'cash' && tenderedCents >= roundedTotal
    ? tenderedCents - roundedTotal : 0;

  /* ── Complete sale ────────────────────────────────────────────── */
  async function completeSale() {
    if (!cart.length || processing) return;
    setProcessing(true);

    const salePayload = {
      business_id:           businessId ?? undefined,
      session_id:            session?.id ?? null,
      items:                 cart.map(i => ({
        product_id:           i.id.startsWith('custom') ? undefined : i.id,
        product_name:         i.name,
        quantity:             i.quantity,
        unit_price_cents:     i.price_cents,
        discount_cents:       0,
        total_cents:          i.price_cents * i.quantity,
      })),
      subtotal_cents:        subtotalCents,
      discount_cents:        0,
      tax_cents:             gstCents,
      total_cents:           totalCents,
      payment_method:        payMethod,
      payment_tendered_cents: tenderedCents || totalCents,
      change_cents:          changeCents,
      status:                'completed',
      source:                'mobile',
    };

    let offline = false;

    try {
      const r = await fetch('/api/pos/sale', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          business_id:    businessId,
          session_id:     session?.id ?? null,
          items:          cart.map(i => ({
            product_id:       i.id,
            product_name:     i.name,
            quantity:         i.quantity,
            unit_price:       i.price_cents / 100,
            tax_rate:         10,
            discount_percent: 0,
            line_total:       (i.price_cents * i.quantity) / 100,
          })),
          payment_method: payMethod,
          subtotal:       subtotalCents / 100,
          tax_amount:     gstCents / 100,
          discount_amount: 0,
          total_amount:   totalCents / 100,
          cash_tendered:  payMethod === 'cash' ? tenderedCents / 100 : null,
          change_given:   payMethod === 'cash' ? changeCents / 100 : null,
        }),
      });
      offline = !r.ok;
    } catch {
      offline = true;
    }

    if (offline) {
      queueOfflineSale({ id: `offline-${Date.now()}`, items: salePayload.items as never[], total_amount: totalCents / 100, payment_method: payMethod, customer_id: null, created_at: new Date().toISOString() });
      setOfflineCount(getOfflineQueue().length);
    }

    setSaleResult({ offline, total: totalCents, change: changeCents });
    setCart([]);
    setCashTendered('');
    setView('receipt');
    setProcessing(false);
  }

  /* ── switchMode ──────────────────────────────────────────────── */
  const switchMode = useCallback(async (mode: AppMode) => {
    if (mode === appMode) return
    setAppMode(mode)
    setInvItems([])
    setInvSession(null)
    setInvDone(false)

    if (mode !== 'sell' && businessId) {
      try {
        const sessionType = mode === 'stocktake' ? 'count'
          : mode === 'order' ? 'order' : 'receive'
        const r = await fetch('/api/pos/mobile-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, session_type: sessionType }),
        })
        if (r.ok) {
          const d = await r.json()
          setInvSession({ id: d.session?.id ?? d.id })
        }
      } catch { /* offline — session will be null */ }
    }
  }, [appMode, businessId])

  /* ── handleInventoryScan ─────────────────────────────────────── */
  const handleInventoryScan = useCallback(async (barcode: string) => {
    setInvScanning(false)
    setNotFound(null)

    let product: Record<string, any> | null = null
    try {
      const url = `/api/pos/products/scan?barcode=${encodeURIComponent(barcode)}${businessId ? `&business_id=${businessId}` : ''}`
      const r = await fetch(url)
      if (r.ok) {
        const d = await r.json()
        product = d.product ?? null
      }
    } catch {}

    if (!product) {
      const cached = loadProductsFromCache()
      product = cached?.products?.find((p: any) =>
        p.barcode === barcode || p.sku === barcode
      ) ?? null
    }

    if (!product) { setNotFound(barcode); return }

    setInvItems(prev => {
      const existing = prev.find(i => i.product_id === product!.id)
      if (existing) {
        return prev.map(i =>
          i.product_id === product!.id
            ? { ...i, scanned_qty: i.scanned_qty + 1 }
            : i
        )
      }
      return [...prev, {
        product_id:      product!.id,
        product_name:    product!.name,
        barcode:         product!.barcode,
        sku:             product!.sku,
        current_stock:   product!.stock_quantity ?? 0,
        scanned_qty:     1,
        unit_cost_cents: Math.round((product!.cost_price ?? 0) * 100),
      }]
    })
  }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── submitInventorySession ──────────────────────────────────── */
  const submitInventorySession = useCallback(async () => {
    if (!invSession || invItems.length === 0) return
    setInvSubmitting(true)

    try {
      await fetch(`/api/pos/mobile-session?id=${invSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanned_items: invItems }),
      })
    } catch {}

    try {
      const r = await fetch(`/api/pos/mobile-session/${invSession.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId }),
      })
      if (r.ok) setInvDone(true)
    } catch {}

    setInvSubmitting(false)
  }, [invSession, invItems, businessId])

  /* ══ SCANNER VIEW ════════════════════════════════════════════════ */
  if (view === 'scanning') {
    return (
      <Suspense fallback={
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <div className="text-center text-white">
            <Spinner />
            <p className="text-sm mt-3">Loading camera…</p>
          </div>
        </div>
      }>
        <BarcodeScanner
          isActive
          onScan={handleScan}
          onClose={() => setView('cart')}
        />
      </Suspense>
    );
  }

  /* ══ RECEIPT VIEW ════════════════════════════════════════════════ */
  if (view === 'receipt' && saleResult) {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0d0d14', fontFamily: "'Manrope',system-ui,sans-serif" }}>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: saleResult.offline ? '#F59E0B' : '#1D9E75' }}>
            <span className="text-white text-3xl font-bold">{saleResult.offline ? '⏳' : '✓'}</span>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">
            {saleResult.offline ? 'Sale saved offline' : 'Sale complete'}
          </h2>
          <p className="text-gray-400 text-sm mb-6">
            {saleResult.offline
              ? 'Will sync automatically when connected'
              : `${fmt(saleResult.total)} · ${payMethod.toUpperCase()}`}
          </p>

          {payMethod === 'cash' && saleResult.change > 0 && (
            <div className="w-full mb-5 p-4 rounded-2xl text-center"
              style={{ background: 'rgba(29,158,117,0.12)', border: '1px solid rgba(29,158,117,0.3)' }}>
              <p className="text-gray-400 text-sm mb-1">Change</p>
              <p className="text-[#1D9E75] text-4xl font-bold">{fmt(saleResult.change)}</p>
            </div>
          )}
        </div>

        <div className="p-4 pb-safe-bottom pb-6">
          <button onClick={() => { setSaleResult(null); setView('cart'); }}
            className="w-full py-5 rounded-2xl text-white font-bold text-lg"
            style={{ background: '#1D9E75' }}>
            New sale
          </button>
        </div>
      </div>
    );
  }

  /* ══ PAYMENT VIEW ════════════════════════════════════════════════ */
  if (view === 'payment') {
    const canCharge = payMethod === 'eftpos' ||
      (payMethod === 'cash' && tenderedCents >= roundedTotal);

    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#0d0d14', fontFamily: "'Manrope',system-ui,sans-serif" }}>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#13131a' }}>
          <button onClick={() => setView('cart')}
            className="p-2.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.08)' }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h1 className="text-white font-semibold text-lg">Payment</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Total */}
          <div className="text-center py-6">
            <p className="text-gray-400 text-sm mb-1">Amount due</p>
            <p className="text-white font-bold" style={{ fontSize: 52, lineHeight: 1 }}>{fmt(totalCents)}</p>
            <p className="text-gray-500 text-xs mt-2">Inc. GST {fmt(gstCents)}</p>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-2 gap-3">
            {(['eftpos', 'cash'] as const).map(m => (
              <button key={m} onClick={() => setPayMethod(m)}
                className="py-4 rounded-2xl font-semibold text-sm transition-all"
                style={{ background: payMethod === m ? '#1D9E75' : 'rgba(255,255,255,0.06)', border: payMethod === m ? 'none' : '1px solid rgba(255,255,255,0.1)', color: payMethod === m ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                {m === 'eftpos' ? '💳 EFTPOS' : '💵 Cash'}
              </button>
            ))}
          </div>

          {/* Cash input */}
          {payMethod === 'cash' && (
            <div className="rounded-2xl p-4 space-y-3" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
              <p className="text-gray-400 text-sm">Rounded total: {fmt(roundedTotal)}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-white text-2xl font-bold">A$</span>
                <input type="number" value={cashTendered} onChange={e => setCashTendered(e.target.value)}
                  inputMode="decimal" placeholder="0.00"
                  className="flex-1 text-white font-bold bg-transparent outline-none border-b-2 border-[#1D9E75] pb-1"
                  style={{ fontSize: 36 }}
                />
              </div>
              {cashTendered && changeCents >= 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">Change</span>
                  <span className="text-[#1D9E75] text-2xl font-bold">{fmt(changeCents)}</span>
                </div>
              )}
              {/* Quick cash presets */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                {[10, 20, 50, 100].map(a => (
                  <button key={a} onClick={() => setCashTendered(String(a))}
                    className="py-2.5 rounded-xl text-sm font-medium text-white"
                    style={{ background: 'rgba(255,255,255,0.09)' }}>
                    ${a}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 pb-safe-bottom pb-6 flex-shrink-0">
          <button onClick={completeSale} disabled={!canCharge || processing}
            className="w-full py-5 rounded-2xl text-white font-bold text-xl disabled:opacity-40 flex items-center justify-center gap-3"
            style={{ background: '#1D9E75' }}>
            {processing ? <Spinner /> : (
              <>
                <span>{payMethod === 'eftpos' ? 'Charge EFTPOS' : 'Complete sale'}</span>
                <span className="opacity-75 text-lg">{fmt(totalCents)}</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  /* ══ INVENTORY MODES (stocktake / order / receive) ══════════════ */
  if (appMode !== 'sell') {
    const modeLabel = appMode === 'stocktake' ? 'Stocktake'
      : appMode === 'order' ? 'Build Order' : 'Receive Stock'
    const modeIcon = appMode === 'stocktake' ? '📦'
      : appMode === 'order' ? '📋' : '📥'
    const modeHint = appMode === 'stocktake'
      ? 'Scan each product — count updates when you submit'
      : appMode === 'order'
      ? 'Scan products to add to a purchase order draft'
      : 'Scan products as they arrive to add to stock'

    if (invDone) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
          style={{ background: '#0d0d14', fontFamily: "'Manrope',system-ui,sans-serif" }}>
          <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: '#1D9E75' }}>
            <span className="text-white text-3xl">✓</span>
          </div>
          <h2 className="text-white text-2xl font-bold mb-2">{modeLabel} complete</h2>
          <p className="text-gray-400 text-sm mb-6">
            {invItems.length} product{invItems.length !== 1 ? 's' : ''} processed
          </p>
          <button
            onClick={() => { setInvDone(false); setInvItems([]); switchMode('sell') }}
            className="px-8 py-4 rounded-2xl text-white font-bold"
            style={{ background: '#1D9E75' }}>
            Back to Sell
          </button>
        </div>
      )
    }

    if (invScanning) {
      return (
        <Suspense fallback={
          <div className="fixed inset-0 bg-black flex items-center justify-center">
            <Spinner />
          </div>
        }>
          <BarcodeScanner
            isActive
            onScan={handleInventoryScan}
            onClose={() => setInvScanning(false)}
          />
        </Suspense>
      )
    }

    return (
      <div className="min-h-screen flex flex-col"
        style={{ background: '#0d0d14', fontFamily: "'Manrope',system-ui,sans-serif" }}>

        {/* Header */}
        <div className="px-4 pt-safe-top pt-4 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#13131a' }}>
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-white font-semibold text-lg">
              {modeIcon} {modeLabel}
            </h1>
            <button onClick={() => switchMode('sell')}
              className="text-gray-500 text-xs px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              ✕ Cancel
            </button>
          </div>
          {/* Mode tabs */}
          <div className="grid grid-cols-4 gap-1">
            {([
              { mode: 'sell',      label: 'Sell',      icon: '🛒' },
              { mode: 'stocktake', label: 'Stocktake', icon: '📦' },
              { mode: 'order',     label: 'Order',     icon: '📋' },
              { mode: 'receive',   label: 'Receive',   icon: '📥' },
            ] as { mode: AppMode; label: string; icon: string }[]).map(({ mode, label, icon }) => (
              <button key={mode} onClick={() => switchMode(mode)}
                className="flex flex-col items-center py-2 rounded-xl text-xs font-medium"
                style={{
                  background: appMode === mode ? 'rgba(29,158,117,0.2)' : 'transparent',
                  color: appMode === mode ? '#1D9E75' : 'rgba(255,255,255,0.4)',
                  border: appMode === mode ? '1px solid rgba(29,158,117,0.3)' : '1px solid transparent',
                }}>
                <span className="text-base mb-0.5">{icon}</span>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Hint */}
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm text-gray-400"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
          {modeHint}
        </div>

        {/* Not found banner */}
        {notFound && (
          <div className="mx-4 mt-3 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <p className="text-red-400 text-sm">
              Barcode not found: <span className="font-mono">{notFound}</span>
            </p>
            <button onClick={() => setNotFound(null)} className="text-red-400/50 text-xs mt-1">
              Dismiss
            </button>
          </div>
        )}

        {/* Scanned items list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {invItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <span className="text-4xl mb-3">{modeIcon}</span>
              <p className="text-gray-400 text-sm">
                Tap <strong className="text-white">Scan</strong> to start
              </p>
            </div>
          ) : (
            invItems.map(item => (
              <div key={item.product_id}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm truncate">{item.product_name}</p>
                  {appMode === 'stocktake' && (
                    <p className="text-gray-500 text-xs mt-0.5">
                      Was: {item.current_stock} → Now: {item.scanned_qty}
                    </p>
                  )}
                  {appMode === 'receive' && (
                    <p className="text-gray-500 text-xs mt-0.5">
                      Current: {item.current_stock} + {item.scanned_qty} = {item.current_stock + item.scanned_qty}
                    </p>
                  )}
                  {appMode === 'order' && (
                    <p className="text-gray-500 text-xs mt-0.5">
                      Stock: {item.current_stock} · Ordering: {item.scanned_qty}
                    </p>
                  )}
                </div>
                {/* Qty controls */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setInvItems(prev =>
                      prev.map(i => i.product_id === item.product_id
                        ? { ...i, scanned_qty: Math.max(0, i.scanned_qty - 1) }
                        : i
                      ).filter(i => i.scanned_qty > 0)
                    )}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: 'rgba(255,255,255,0.1)' }}>−
                  </button>
                  <span className="text-white font-bold w-6 text-center">{item.scanned_qty}</span>
                  <button
                    onClick={() => setInvItems(prev =>
                      prev.map(i => i.product_id === item.product_id
                        ? { ...i, scanned_qty: i.scanned_qty + 1 }
                        : i
                      )
                    )}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold"
                    style={{ background: '#1D9E75' }}>+
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Action bar */}
        <div className="p-4 pb-safe-bottom pb-6 flex-shrink-0 grid grid-cols-2 gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#13131a' }}>
          <button onClick={() => setInvScanning(true)}
            className="py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2"
            style={{ background: '#1D9E75' }}>
            <span>📷</span> Scan
          </button>
          <button
            onClick={submitInventorySession}
            disabled={invItems.length === 0 || invSubmitting || !invSession}
            className="py-4 rounded-2xl text-white font-semibold disabled:opacity-40"
            style={{ background: 'rgba(29,158,117,0.2)', border: '1px solid rgba(29,158,117,0.35)' }}>
            {invSubmitting ? 'Saving…' : `Submit (${invItems.length})`}
          </button>
        </div>
      </div>
    )
  }

  /* ══ CART VIEW (default) ═════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0d14', fontFamily: "'Manrope',system-ui,sans-serif" }}>

      {/* Title bar */}
      <div className="flex items-center justify-between px-4 pt-safe-top pt-4 pb-3 flex-shrink-0"
        style={{ background: '#13131a' }}>
        <div>
          <h1 className="text-white font-semibold text-lg leading-tight">Aria POS</h1>
          <p className="text-xs leading-tight" style={{ color: session ? '#1D9E75' : '#ef4444' }}>
            {session ? `Register open · ${session.opened_by ?? 'Unknown'}` : '⚠ No open register'}
          </p>
        </div>
        <a href="/pos" className="text-gray-500 text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(255,255,255,0.06)' }}>
          Desktop
        </a>
      </div>

      {/* Mode switcher */}
      <div className="grid grid-cols-4 gap-1 px-3 py-2 flex-shrink-0"
        style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {([
          { mode: 'sell',      label: 'Sell',      icon: '🛒' },
          { mode: 'stocktake', label: 'Stocktake', icon: '📦' },
          { mode: 'order',     label: 'Order',     icon: '📋' },
          { mode: 'receive',   label: 'Receive',   icon: '📥' },
        ] as { mode: AppMode; label: string; icon: string }[]).map(({ mode, label, icon }) => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            className="flex flex-col items-center py-2 rounded-xl text-xs font-medium transition-all"
            style={{
              background: appMode === mode ? 'rgba(29,158,117,0.2)' : 'transparent',
              color: appMode === mode ? '#1D9E75' : 'rgba(255,255,255,0.4)',
              border: appMode === mode ? '1px solid rgba(29,158,117,0.3)' : '1px solid transparent',
            }}>
            <span className="text-base mb-0.5">{icon}</span>
            {label}
          </button>
        ))}
      </div>

      {/* Sync / offline banners */}
      {syncMsg && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium text-[#1D9E75]"
          style={{ background: 'rgba(29,158,117,0.1)', border: '1px solid rgba(29,158,117,0.25)' }}>
          {syncMsg}
        </div>
      )}
      {offlineCount > 0 && !syncMsg && (
        <div className="mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium text-amber-400 flex items-center justify-between"
          style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <span>⚠ {offlineCount} sale{offlineCount > 1 ? 's' : ''} waiting to sync</span>
          <button onClick={syncOfflineQueue} className="text-xs underline">Sync now</button>
        </div>
      )}

      {/* Not found */}
      {notFound && (
        <div className="mx-4 mt-3 px-4 py-3 rounded-xl"
          style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
          <p className="text-red-400 text-sm font-medium">Barcode not found: <span className="font-mono">{notFound}</span></p>
          <p className="text-red-400/60 text-xs mt-0.5">Add this product in the Products catalogue to enable scanning.</p>
          <button onClick={() => setNotFound(null)} className="text-red-400/50 text-xs mt-1">Dismiss</button>
        </div>
      )}

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 p-8">
            <span className="text-5xl mb-4">🛒</span>
            <p className="text-gray-400 text-sm text-center leading-relaxed">
              Tap <strong className="text-white">Scan</strong> to add products by barcode
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm leading-tight truncate">{item.name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{fmt(item.price_cents)} each</p>
                </div>
                {/* Qty controls */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <button onClick={() => updateQty(item.id, -1)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-transform"
                    style={{ background: 'rgba(255,255,255,0.1)' }}>−</button>
                  <span className="text-white font-bold w-5 text-center">{item.quantity}</span>
                  <button onClick={() => updateQty(item.id, 1)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-lg active:scale-90 transition-transform"
                    style={{ background: '#1D9E75' }}>+</button>
                </div>
                {/* Line total */}
                <div className="text-right flex-shrink-0 ml-1">
                  <p className="text-white font-semibold text-sm">{fmt(item.price_cents * item.quantity)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + action bar */}
      <div className="flex-shrink-0 pb-safe-bottom" style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#13131a' }}>
        {cart.length > 0 && (
          <div className="px-4 pt-3 pb-1 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Subtotal (inc. GST)</span>
              <span className="text-white">{fmt(subtotalCents)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">GST included</span>
              <span className="text-gray-600">{fmt(gstCents)}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          {/* SCAN */}
          <button onClick={() => setView('scanning')}
            className="flex flex-col items-center justify-center py-5 rounded-2xl gap-1.5 active:scale-95 transition-transform"
            style={{ background: '#1D9E75' }}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={1.5}>
              <path strokeLinecap="round" d="M6.75 4.5h.75v.75h-.75V4.5zm0 4.5h.75v.75h-.75V9zm7.5 0h.75v.75h-.75V9zm-7.5 7.5h.75v.75h-.75V16.5zm7.5 0h.75v.75h-.75V16.5zm0 3h.75v.75h-.75V19.5z"/>
              <rect x="3.75" y="3.75" width="6" height="6" rx=".75"/>
              <rect x="14.25" y="3.75" width="6" height="6" rx=".75"/>
              <rect x="3.75" y="14.25" width="6" height="6" rx=".75"/>
              <path strokeLinecap="round" d="M14.25 14.25h1.5v1.5h-1.5v-1.5zm3 0h1.5v1.5h-1.5v-1.5zm0 3h1.5v1.5h-1.5v-1.5zm-3 3h1.5v1.5h-1.5V20.25zm3-1.5h1.5"/>
            </svg>
            <span className="text-white font-semibold text-sm">Scan</span>
          </button>

          {/* CHARGE */}
          <button onClick={() => cart.length > 0 && setView('payment')}
            disabled={cart.length === 0}
            className="flex flex-col items-center justify-center py-5 rounded-2xl gap-1 disabled:opacity-35 active:scale-95 transition-transform"
            style={{ background: cart.length > 0 ? 'rgba(29,158,117,0.18)' : 'rgba(255,255,255,0.05)', border: cart.length > 0 ? '1px solid rgba(29,158,117,0.35)' : '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-white font-extrabold" style={{ fontSize: cart.length > 0 ? 22 : 16 }}>
              {cart.length > 0 ? fmt(totalCents) : 'A$0.00'}
            </span>
            <span className="text-gray-300 text-sm">Charge →</span>
          </button>
        </div>

        {cart.length > 0 && (
          <div className="px-4 pb-3 text-center">
            <button onClick={() => setCart([])} className="text-xs text-red-400/50 hover:text-red-400">
              Clear cart
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
