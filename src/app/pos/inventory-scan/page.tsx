'use client';
import { useState, useEffect, useCallback, Suspense, lazy } from 'react';

const BarcodeScanner = lazy(() => import('@/components/pos/BarcodeScanner'));

// ── palette (matches Aria POS Financial Trust) ────────────────────────────────
const C = {
  bg:     'rgba(5,4,15,1)',
  card:   'var(--bg-surface)',
  border: 'rgba(217,217,217,0.15)',
  text:   'var(--text-primary)',
  muted:  'var(--text-secondary)',
  dim:    'var(--text-tertiary)',
  green:  '#7FB897',
  forest: '#2D5240',
  amber:  '#F59E0B',
  red:    '#EF4444',
  blue:   '#006AFF',
};

type Mode = 'select' | 'count' | 'order' | 'receive' | 'replenish' | 'price' | 'expiry';

interface Product {
  id: string; name: string; price: number; cost_price: number | null;
  stock_quantity: number | null; qty_backroom: number | null;
  shelf_capacity: number | null; expiry_date: string | null;
  barcode: string | null; sku: string | null; is_active: boolean;
  low_stock_threshold: number | null;
  pos_categories?: { name: string; color: string } | null;
}
interface External { name?: string; brand?: string; image_url?: string }
interface ScannedEntry {
  barcode: string; product_id: string | null; product_name: string;
  current_stock: number; scanned_qty: number; unit_cost_cents: number;
  scanned_at: string; action: string; note?: string;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: `${color}22`, color, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
      {label}
    </span>
  );
}

function QtyControl({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 14,
      overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 52, height: 52, background: C.card, border: 'none', color: C.text,
          fontSize: 24, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
      <div style={{ width: 72, height: 52, display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: `${C.green}18`,
        fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: C.text }}>
        {value}
      </div>
      <button onClick={() => onChange(value + 1)}
        style={{ width: 52, height: 52, background: C.card, border: 'none', color: C.text,
          fontSize: 24, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
    </div>
  );
}

// ── Mode config ───────────────────────────────────────────────────────────────
const MODES: Record<string, { icon: string; label: string; desc: string; color: string; confirmLabel: string; hint: string }> = {
  count:     { icon: '📦', label: 'Count',      desc: 'Update floor stock levels',          color: C.blue,   confirmLabel: 'Set stock',      hint: 'Scan → set count → auto-continues' },
  replenish: { icon: '🔄', label: 'Replenish',  desc: 'Floor vs backroom quantities',       color: C.green,  confirmLabel: 'Log replenish',  hint: 'Scan → move from backroom to floor' },
  order:     { icon: '📋', label: 'Order',      desc: 'Build a supplier order',             color: C.amber,  confirmLabel: 'Add to order',   hint: 'Scan products you need to reorder' },
  receive:   { icon: '📥', label: 'Receive',    desc: 'Receive stock from supplier',        color: C.forest, confirmLabel: 'Receive',        hint: 'Scan items as they arrive' },
  price:     { icon: '💰', label: 'Price check', desc: 'View price, margin & cost',         color: '#A855F7', confirmLabel: 'Done',          hint: 'Scan any product to check pricing' },
  expiry:    { icon: '📅', label: 'Expiry',     desc: 'Log expiry dates & flag near-expiry', color: C.red,   confirmLabel: 'Log date',       hint: 'Scan → enter expiry date' },
};

export default function InventoryScanPage() {
  const [mode, setMode]           = useState<Mode>('select');
  const [bid, setBid]             = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [entries, setEntries]     = useState<ScannedEntry[]>([]);
  const [product, setProduct]     = useState<Product | null>(null);
  const [external, setExternal]   = useState<External | null>(null);
  const [barcode, setBarcode]     = useState('');
  const [qty, setQty]             = useState(1);
  const [qtyBackroom, setQtyBackroom] = useState(0);
  const [expiryInput, setExpiryInput] = useState('');
  const [notFound, setNotFound]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [toast, setToast]         = useState<{ msg: string; type: 'ok' | 'warn' } | null>(null);
  // Quick-create state
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState('');
  const [newPrice, setNewPrice]   = useState('');
  const [newCost, setNewCost]     = useState('');
  const [newShelf, setNewShelf]   = useState('');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { if (d.business_id) setBid(d.business_id); });
  }, []);

  const showToast = useCallback((msg: string, type: 'ok' | 'warn' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2000);
  }, []);

  // ── Scan handler — continuous: always re-opens camera after confirm ─────────
  const handleScan = useCallback(async (code: string) => {
    if (!bid || loading) return;
    setLoading(true);
    setScanActive(false);
    setBarcode(code);
    setQty(1);
    setQtyBackroom(0);
    setExpiryInput('');
    setCreating(false);
    setNewName(''); setNewPrice(''); setNewCost(''); setNewShelf('');

    const res = await fetch(`/api/pos/products/scan?barcode=${encodeURIComponent(code)}&business_id=${bid}`);
    const d = await res.json() as { product: Product | null; barcode: string; external?: External };
    setProduct(d.product);
    setExternal(d.external ?? null);
    setNotFound(!d.product);

    // Pre-fill backroom qty for replenish mode
    if (d.product && mode === 'replenish') setQtyBackroom(d.product.qty_backroom ?? 0);
    // Pre-fill expiry if already set
    if (d.product?.expiry_date) setExpiryInput(d.product.expiry_date);
    // Price mode: auto-confirm instantly (just show info card)
    setLoading(false);
  }, [bid, loading, mode]);

  function clearScan() {
    setProduct(null); setExternal(null); setBarcode('');
    setNotFound(false); setCreating(false);
    setScanActive(true); // continuous — re-open camera
  }

  function confirm() {
    if (!barcode) return;
    const entry: ScannedEntry = {
      barcode,
      product_id:     product?.id ?? null,
      product_name:   notFound ? `Unknown (${barcode})` : product!.name,
      current_stock:  product?.stock_quantity ?? 0,
      scanned_qty:    qty,
      unit_cost_cents: Math.round((product?.cost_price ?? 0) * 100),
      scanned_at:     new Date().toISOString(),
      action:         mode,
      note: mode === 'replenish' ? `backroom:${qtyBackroom}` : mode === 'expiry' ? expiryInput : undefined,
    };
    setEntries(prev => [entry, ...prev]);

    // Inline stock patch for count/replenish/receive/expiry — no session needed
    if (product?.id && bid) {
      const patch: Record<string, unknown> = {};
      if (mode === 'count')     patch.stock_quantity = qty;
      if (mode === 'receive')   patch.stock_quantity = (product.stock_quantity ?? 0) + qty;
      if (mode === 'replenish') { patch.qty_backroom = Math.max(0, qtyBackroom - qty); patch.stock_quantity = (product.stock_quantity ?? 0) + qty; }
      if (mode === 'expiry' && expiryInput) patch.expiry_date = expiryInput;
      if (Object.keys(patch).length) {
        fetch(`/api/pos/products/${product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      }
    }

    const label = mode === 'count' ? `→ ${qty}` : mode === 'receive' ? `+${qty}` : mode === 'replenish' ? `floor +${qty}, backroom −${qty}` : mode === 'expiry' ? expiryInput : `×${qty}`;
    showToast(`${entry.product_name} ${label}`);
    clearScan();
  }

  async function quickCreate() {
    if (!bid || !newName.trim()) return;
    setSubmitting(true);
    const res = await fetch('/api/pos/products/quick-create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: bid, barcode, name: newName.trim(),
        price: parseFloat(newPrice) || 0, cost_price: parseFloat(newCost) || null,
        stock_quantity: qty, qty_backroom: qtyBackroom,
        shelf_capacity: parseInt(newShelf) || null,
      }),
    });
    const d = await res.json() as { product: Product };
    setProduct(d.product); setNotFound(false); setCreating(false);
    setSubmitting(false);
    showToast(`${newName} created ✓`);
  }

  async function submitSession() {
    if (!bid) return;
    setSubmitting(true);
    // For order mode — create a purchase order record
    if (mode === 'order' && entries.length > 0) {
      await fetch('/api/pos/mobile-session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bid, session_type: 'order', scanned_items: entries }),
      });
    }
    setDone(true); setSubmitting(false);
  }

  const mCfg = MODES[mode] ?? MODES.count;

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (done) return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>
        {mode === 'count' ? 'Stock updated!' : mode === 'order' ? 'Order saved!' : mode === 'receive' ? 'Stock received!' : mode === 'replenish' ? 'Replenishment logged!' : mode === 'expiry' ? 'Expiry dates saved!' : 'Done!'}
      </h1>
      <p style={{ fontSize: 14, color: C.muted }}>{entries.length} products processed</p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={() => { setDone(false); setMode('select'); setEntries([]); setScanActive(false); }}
          style={{ padding: '10px 22px', borderRadius: 9, border: `1px solid ${C.border}`,
            background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          Back to modes
        </button>
        <a href="/pos/products" style={{ padding: '10px 22px', borderRadius: 9, border: 'none',
          background: C.green, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          View products
        </a>
      </div>
    </div>
  );

  // ── Mode select screen ──────────────────────────────────────────────────────
  if (mode === 'select') return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Manrope',system-ui,sans-serif", padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, paddingTop: 8 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: `${C.green}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>📱</div>
        <div>
          <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Aria Scanner</p>
          <p style={{ fontSize: 11, color: C.muted }}>Camera-powered · Continuous scan</p>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(Object.entries(MODES) as [string, typeof MODES[string]][]).map(([m, cfg]) => (
          <button key={m} onClick={() => { setMode(m as Mode); setScanActive(true); setEntries([]); }}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
              padding: '16px 18px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: `${cfg.color}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
              {cfg.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{cfg.label}</p>
              <p style={{ fontSize: 12, color: C.muted }}>{cfg.desc}</p>
            </div>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={C.dim} strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
        ))}
      </div>
      <a href="/pos" style={{ display: 'block', textAlign: 'center', marginTop: 24,
        fontSize: 13, color: C.muted, textDecoration: 'none' }}>← Back to POS</a>
    </div>
  );

  // ── Active scanner screen ───────────────────────────────────────────────────
  const hasCard = !!barcode;
  const margin  = product ? ((product.price - (product.cost_price ?? 0)) / product.price * 100) : null;
  const floorPct = (product?.shelf_capacity && product.stock_quantity != null)
    ? Math.round(product.stock_quantity / product.shelf_capacity * 100) : null;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Camera */}
      <Suspense fallback={null}>
        <BarcodeScanner isActive={scanActive} onScan={handleScan} onClose={() => { setScanActive(false); setMode('select'); }} />
      </Suspense>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 60, background: 'var(--bg-elevated)', border: `1px solid ${toast.type === 'warn' ? C.amber : C.green}`,
          borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: C.text,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        background: 'rgba(5,4,15,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => { setMode('select'); setEntries([]); setScanActive(false); clearScan(); }}
            style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>←</button>
          <div>
            <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{mCfg.icon} {mCfg.label}</p>
            <p style={{ fontSize: 10, color: C.muted }}>{mCfg.hint}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {entries.length > 0 && (
            <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 99,
              background: `${mCfg.color}22`, color: mCfg.color, fontWeight: 700 }}>
              {entries.length}
            </span>
          )}
          <button onClick={() => setScanActive(true)} disabled={hasCard || loading}
            style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: mCfg.color,
              color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (hasCard || loading) ? 0.4 : 1 }}>
            📷 Scan
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 32, color: C.muted }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid ${C.border}`,
              borderTopColor: mCfg.color, animation: 'spin 0.7s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13 }}>Looking up…</p>
          </div>
        )}

        {/* ── Product card ──────────────────────────────────────────────── */}
        {!loading && hasCard && (
          <div style={{ background: C.card, border: `1.5px solid ${mCfg.color}44`,
            borderRadius: 18, padding: '18px 16px', boxShadow: `0 0 0 3px ${mCfg.color}11` }}>

            {/* Not found → quick create or external suggestion */}
            {notFound && !creating && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Pill label="Not in catalogue" color={C.amber} />
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{barcode}</span>
                </div>
                {external?.name && (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: `${C.blue}11`,
                    border: `1px solid ${C.blue}33`, marginBottom: 12 }}>
                    <p style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>Found online:</p>
                    <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{external.name}</p>
                    {external.brand && <p style={{ fontSize: 11, color: C.muted }}>{external.brand}</p>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setCreating(true); if (external?.name) setNewName(external.name); }}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none',
                      background: mCfg.color, color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Create product
                  </button>
                  <button onClick={clearScan}
                    style={{ padding: '11px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
                      background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Skip
                  </button>
                </div>
              </div>
            )}

            {/* Quick create form */}
            {notFound && creating && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 2 }}>Create new product</p>
                {[
                  { label: 'Name *',          val: newName,  set: setNewName,  type: 'text',   ph: 'Product name' },
                  { label: 'Sell price ($)',   val: newPrice, set: setNewPrice, type: 'decimal', ph: '0.00' },
                  { label: 'Cost price ($)',   val: newCost,  set: setNewCost,  type: 'decimal', ph: '0.00' },
                  { label: 'Shelf capacity',   val: newShelf, set: setNewShelf, type: 'numeric', ph: 'Max facings (optional)' },
                ].map(f => (
                  <div key={f.label}>
                    <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{f.label}</p>
                    <input value={f.val} onChange={e => f.set(e.target.value)}
                      inputMode={f.type as 'text' | 'decimal' | 'numeric'} placeholder={f.ph}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: 9,
                        border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)',
                        color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={quickCreate} disabled={!newName.trim() || submitting}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                      background: mCfg.color, color: '#fff', fontSize: 14, fontWeight: 700,
                      cursor: 'pointer', fontFamily: 'inherit', opacity: (!newName.trim() || submitting) ? 0.5 : 1 }}>
                    {submitting ? 'Creating…' : 'Create & continue'}
                  </button>
                  <button onClick={() => setCreating(false)}
                    style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
                      background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Back
                  </button>
                </div>
              </div>
            )}

            {/* Found product */}
            {product && (
              <div>
                {/* Product header */}
                <div style={{ display: 'flex', align: 'start', gap: 10, marginBottom: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>{product.name}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {product.pos_categories && <Pill label={product.pos_categories.name} color={product.pos_categories.color || C.muted} />}
                      {product.barcode && <span style={{ fontSize: 10, color: C.dim, fontFamily: 'monospace' }}>{product.barcode}</span>}
                    </div>
                  </div>
                </div>

                {/* ── Price check mode — info only ───────────────────────── */}
                {mode === 'price' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    {[
                      { label: 'Sell price', val: `A$${product.price.toFixed(2)}`, color: C.text },
                      { label: 'Cost price', val: product.cost_price ? `A$${product.cost_price.toFixed(2)}` : '—', color: C.muted },
                      { label: 'Margin',     val: margin != null ? `${margin.toFixed(1)}%` : '—', color: margin != null && margin < 20 ? C.red : C.green },
                      { label: 'Stock (floor)', val: `${product.stock_quantity ?? 0}`, color: C.text },
                      { label: 'Backroom',   val: `${product.qty_backroom ?? 0}`, color: C.muted },
                    ].map(row => (
                      <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize: 12, color: C.muted }}>{row.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: row.color, fontFamily: 'monospace' }}>{row.val}</span>
                      </div>
                    ))}
                    <button onClick={clearScan}
                      style={{ marginTop: 6, padding: '12px', borderRadius: 10, border: 'none',
                        background: mCfg.color, color: '#fff', fontSize: 14, fontWeight: 700,
                        cursor: 'pointer', fontFamily: 'inherit' }}>
                      Scan next →
                    </button>
                  </div>
                )}

                {/* ── Replenish mode ──────────────────────────────────────── */}
                {mode === 'replenish' && (
                  <div>
                    {/* Floor vs backroom visual */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                      {[
                        { label: '🛒 Floor stock', val: product.stock_quantity ?? 0,
                          cap: product.shelf_capacity, color: floorPct != null && floorPct < 30 ? C.red : C.green },
                        { label: '📦 Backroom',    val: qtyBackroom, cap: null, color: C.blue },
                      ].map(box => (
                        <div key={box.label} style={{ padding: '10px 12px', borderRadius: 10,
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}` }}>
                          <p style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{box.label}</p>
                          <p style={{ fontSize: 22, fontWeight: 800, color: box.color, fontFamily: 'monospace' }}>{box.val}</p>
                          {box.cap && <p style={{ fontSize: 10, color: C.dim }}>cap: {box.cap}</p>}
                        </div>
                      ))}
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Units to move floor → backroom:</p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                      <QtyControl value={qty} onChange={setQty} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={confirm}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                          background: mCfg.color, color: '#fff', fontSize: 14, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✓ {mCfg.confirmLabel}
                      </button>
                      <button onClick={clearScan}
                        style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Expiry mode ──────────────────────────────────────────── */}
                {mode === 'expiry' && (
                  <div>
                    {product.expiry_date && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: `${C.amber}18`,
                        border: `1px solid ${C.amber}44`, marginBottom: 12 }}>
                        <p style={{ fontSize: 12, color: C.amber }}>Current expiry: <strong>{product.expiry_date}</strong></p>
                      </div>
                    )}
                    <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Set expiry date:</p>
                    <input type="date" value={expiryInput} onChange={e => setExpiryInput(e.target.value)}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 10,
                        border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.06)',
                        color: C.text, fontSize: 15, fontFamily: 'inherit', outline: 'none',
                        marginBottom: 14, boxSizing: 'border-box' }} />
                    {expiryInput && new Date(expiryInput) < new Date(Date.now() + 7 * 86400_000) && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: `${C.red}18`,
                        border: `1px solid ${C.red}44`, marginBottom: 12 }}>
                        <p style={{ fontSize: 12, color: C.red }}>⚠️ Expires within 7 days — consider marking down</p>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={confirm} disabled={!expiryInput}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                          background: mCfg.color, color: '#fff', fontSize: 14, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit', opacity: !expiryInput ? 0.4 : 1 }}>
                        ✓ {mCfg.confirmLabel}
                      </button>
                      <button onClick={clearScan}
                        style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Count / Order / Receive modes ────────────────────────── */}
                {(mode === 'count' || mode === 'order' || mode === 'receive') && (
                  <div>
                    {/* Stock summary */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                        <p style={{ fontSize: 10, color: C.muted }}>Floor</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>{product.stock_quantity ?? 0}</p>
                        {product.shelf_capacity && <p style={{ fontSize: 9, color: C.dim }}>/ {product.shelf_capacity} cap</p>}
                      </div>
                      <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                        <p style={{ fontSize: 10, color: C.muted }}>Backroom</p>
                        <p style={{ fontSize: 18, fontWeight: 800, color: C.blue, fontFamily: 'monospace' }}>{product.qty_backroom ?? 0}</p>
                      </div>
                      {product.cost_price && (
                        <div style={{ flex: 1, padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)' }}>
                          <p style={{ fontSize: 10, color: C.muted }}>Cost</p>
                          <p style={{ fontSize: 14, fontWeight: 700, color: C.text, fontFamily: 'monospace' }}>A${product.cost_price.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>
                      {mode === 'count' ? 'How many on floor?' : mode === 'order' ? 'How many to order?' : 'How many received?'}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                      <QtyControl value={qty} onChange={setQty} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={confirm}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                          background: mCfg.color, color: '#fff', fontSize: 14, fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit' }}>
                        ✓ {mCfg.confirmLabel}
                      </button>
                      <button onClick={clearScan}
                        style={{ padding: '12px 16px', borderRadius: 10, border: `1px solid ${C.border}`,
                          background: 'transparent', color: C.muted, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────────── */}
        {!loading && !hasCard && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.dim }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>
              <span style={{ opacity: scanActive ? 1 : 0.4 }}>📷</span>
            </div>
            <p style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>
              {scanActive ? 'Camera open — point at barcode' : 'Tap Scan to begin'}
            </p>
            <p style={{ fontSize: 12, color: C.dim }}>Scans automatically · Continuous mode</p>
          </div>
        )}

        {/* ── Scanned log ──────────────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>
              Scanned ({entries.length})
            </p>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {entries.map((e, i) => (
                <div key={`${e.barcode}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${mCfg.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>
                    {mCfg.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.product_name}
                    </p>
                    <p style={{ fontSize: 10, color: C.dim }}>{e.note ?? `qty: ${e.scanned_qty}`}</p>
                  </div>
                  <span style={{ fontSize: 15, fontWeight: 800, color: mCfg.color, fontFamily: 'monospace' }}>
                    {e.scanned_qty}
                  </span>
                </div>
              ))}
            </div>
            {mode === 'order' && (
              <div style={{ marginTop: 8, padding: '10px 14px', background: `${C.amber}11`,
                borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.muted }}>Order total (cost)</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.amber, fontFamily: 'monospace' }}>
                  A${(entries.reduce((s, e) => s + e.scanned_qty * e.unit_cost_cents, 0) / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit bar */}
      {entries.length > 0 && !hasCard && mode === 'order' && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={submitSession} disabled={submitting}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${mCfg.color}, #2D5240)`,
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Saving…' : `Submit order — ${entries.length} items`}
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
