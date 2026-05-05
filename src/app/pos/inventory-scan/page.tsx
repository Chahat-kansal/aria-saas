'use client';
import { useState, useEffect, useCallback, Suspense, lazy } from 'react';

const BarcodeScanner = lazy(() => import('@/components/pos/BarcodeScanner'));

const C = { bg: 'rgba(5,4,15,1)', card: 'rgba(15,13,25,0.95)', border: '#1E1A2E', text: '#EDE8FF', muted: '#8B85A8', dim: '#3A3555', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

type Mode = 'select' | 'count' | 'order' | 'receive';

interface ScannedEntry { barcode: string; product_id: string | null; product_name: string; current_stock: number; scanned_qty: number; unit_cost_cents: number; scanned_at: string; action: string; }
interface Product { id: string; name: string; price: number; cost_price: number | null; stock_quantity: number | null; barcode: string | null; sku: string | null; is_active: boolean; pos_categories?: { name: string; color: string } | null; }

function Spinner() { return <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.3)', borderTopColor: '#8B5CF6', animation: 'spin 0.7s linear infinite' }} />; }

function QtyControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
      <button onClick={() => onChange(Math.max(0, value - 1)) } style={{ width: 50, height: 50, background: C.card, border: 'none', color: C.text, fontSize: 24, cursor: 'pointer', fontFamily: 'inherit' }}>−</button>
      <div style={{ width: 70, height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.08)', fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: C.text }}>{value}</div>
      <button onClick={() => onChange(value + 1)} style={{ width: 50, height: 50, background: C.card, border: 'none', color: C.text, fontSize: 24, cursor: 'pointer', fontFamily: 'inherit' }}>+</button>
    </div>
  );
}

export default function InventoryScanPage() {
  const [mode, setMode]             = useState<Mode>('select');
  const [bid, setBid]               = useState<string | null>(null);
  const [scanActive, setScanActive] = useState(false);
  const [entries, setEntries]       = useState<ScannedEntry[]>([]);
  const [current, setCurrent]       = useState<{ product: Product | null; barcode: string; qty: number; notFound: boolean } | null>(null);
  const [sessionId, setSessionId]   = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]             = useState(false);
  const [toast, setToast]           = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { if (d.business_id) setBid(d.business_id); });
  }, []);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 2000); return () => clearTimeout(t); }
  }, [toast]);

  async function startMode(m: Mode) {
    if (!bid) return;
    setMode(m);
    setScanActive(true);
    const res = await fetch('/api/pos/mobile-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, session_type: m }) });
    const d = await res.json();
    if (d.session) setSessionId(d.session.id);
  }

  const handleScan = useCallback(async (barcode: string) => {
    if (!bid) return;
    setScanActive(false);
    const res = await fetch(`/api/pos/products/scan?barcode=${encodeURIComponent(barcode)}&business_id=${bid}`);
    const d = await res.json();
    setCurrent({ product: d.product, barcode, qty: 1, notFound: !d.product });
  }, [bid]);

  function confirm() {
    if (!current) return;
    const entry: ScannedEntry = {
      barcode: current.barcode,
      product_id: current.product?.id ?? null,
      product_name: current.notFound ? `Unknown (${current.barcode})` : current.product!.name,
      current_stock: current.product?.stock_quantity ?? 0,
      scanned_qty: current.qty,
      unit_cost_cents: Math.round((current.product?.cost_price ?? 0) * 100),
      scanned_at: new Date().toISOString(),
      action: mode,
    };
    setEntries(prev => [entry, ...prev]);
    if (sessionId) {
      fetch(`/api/pos/mobile-session?id=${sessionId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanned_items: [entry, ...entries] }),
      });
    }
    setToast(`${entry.product_name} — ${mode === 'count' ? `set to ${current.qty}` : `${current.qty} added`}`);
    setCurrent(null);
    setScanActive(true);
  }

  async function submit() {
    if (!bid || !sessionId) return;
    setSubmitting(true);
    await fetch(`/api/pos/mobile-session/${sessionId}/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }),
    });
    setDone(true); setSubmitting(false);
  }

  const MODE_INFO: Record<string, { title: string; hint: string; confirmLabel: string; icon: string }> = {
    count:   { title: 'Count Inventory',   hint: 'Scan product → set count → confirm',  confirmLabel: 'Update stock',    icon: '📦' },
    order:   { title: 'Build Order',        hint: 'Scan products to add to order',        confirmLabel: 'Add to order',    icon: '📋' },
    receive: { title: 'Receive Stock',      hint: 'Scan items as they arrive',            confirmLabel: 'Receive',         icon: '📥' },
  };
  const mInfo = MODE_INFO[mode] ?? MODE_INFO.count;

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 20 }}>
        <div style={{ fontSize: 56 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>{mode === 'count' ? 'Stock updated!' : mode === 'order' ? 'Order saved!' : 'Stock received!'}</h1>
        <p style={{ fontSize: 14, color: C.muted, textAlign: 'center' }}>{entries.length} products processed</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => { setDone(false); setMode('select'); setEntries([]); setSessionId(null); }}
            style={{ padding: '10px 22px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Back to modes
          </button>
          <a href="/pos/products" style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>View products</a>
        </div>
      </div>
    );
  }

  if (mode === 'select') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📱</div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.text }}>AriaPOS Mobile</span>
        </div>
        <p style={{ fontSize: 14, color: C.muted, marginBottom: 16 }}>Select mode to begin</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
          {([
            ['count',   '📦', 'Count inventory',   'Scan products to update stock levels'],
            ['order',   '📋', 'Build order',        'Scan what you need to order, set quantities'],
            ['receive', '📥', 'Receive stock',      'Scan items as they arrive from supplier'],
          ] as const).map(([m, icon, label, desc]) => (
            <button key={m} onClick={() => startMode(m)}
              style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 20px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 150ms' }}>
              <span style={{ fontSize: 28, flexShrink: 0 }}>{icon}</span>
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 3 }}>{label}</p>
                <p style={{ fontSize: 12, color: C.muted }}>{desc}</p>
              </div>
            </button>
          ))}
        </div>
        <a href="/pos" style={{ marginTop: 8, fontSize: 13, color: C.muted, textDecoration: 'none' }}>← Back to POS</a>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Camera */}
      <Suspense fallback={null}>
        <BarcodeScanner isActive={scanActive} onScan={handleScan} onClose={() => setScanActive(false)} />
      </Suspense>

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: '#1A1728', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 18px', fontSize: 13, fontWeight: 600, color: C.text, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setMode('select')} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>←</button>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{mInfo.icon} {mInfo.title}</p>
            <p style={{ fontSize: 11, color: C.muted }}>{mInfo.hint}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {entries.length > 0 && (
            <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 99, background: 'rgba(139,92,246,0.15)', color: C.violet, fontWeight: 700 }}>{entries.length} items</span>
          )}
          <button onClick={() => setScanActive(true)} disabled={!!current}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: current ? 0.4 : 1 }}>
            📷 Scan
          </button>
        </div>
      </div>

      {/* Current scan form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {current ? (
          <div style={{ background: C.card, border: `1px solid ${C.violet}`, borderRadius: 16, padding: '20px 16px', boxShadow: '0 0 0 3px rgba(139,92,246,0.1)' }}>
            {current.notFound ? (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 4 }}>⚠️ Not in catalogue</p>
                <p style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace' }}>{current.barcode}</p>
                <a href={`/pos/import/scan`} style={{ fontSize: 12, color: C.violet, display: 'block', marginTop: 6 }}>Add to catalogue via Scan Import →</a>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>{current.product!.name}</p>
                <div style={{ display: 'flex', gap: 16 }}>
                  <p style={{ fontSize: 12, color: C.muted }}>Current stock: <span style={{ fontWeight: 600, color: C.text }}>{current.product!.stock_quantity ?? 0}</span></p>
                  {current.product!.cost_price && <p style={{ fontSize: 12, color: C.muted }}>Cost: <span style={{ fontWeight: 600, color: C.text }}>A${current.product!.cost_price.toFixed(2)}</span></p>}
                </div>
              </div>
            )}
            <p style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>
              {mode === 'count' ? 'How many do you have?' : mode === 'order' ? 'How many to order?' : 'How many received?'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <QtyControl value={current.qty} onChange={qty => setCurrent(c => c ? { ...c, qty } : c)} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={confirm} disabled={current.notFound}
                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: current.notFound ? 0.4 : 1 }}>
                ✓ {mInfo.confirmLabel}
              </button>
              <button onClick={() => { setCurrent(null); setScanActive(true); }}
                style={{ padding: '12px 18px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Skip
              </button>
            </div>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: C.dim }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📷</div>
            <p style={{ fontSize: 14, color: C.muted }}>Tap Scan to begin</p>
            <p style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>Point camera at any product barcode</p>
          </div>
        ) : null}

        {/* Scanned log */}
        {entries.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Scanned</p>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
              {entries.map((e, i) => (
                <div key={`${e.barcode}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: i < entries.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.product_name}</p>
                    <p style={{ fontSize: 10, color: C.dim }}>
                      {mode === 'count' ? `Set to ${e.scanned_qty}` : mode === 'order' ? `Order: ${e.scanned_qty}` : `Received: ${e.scanned_qty}`}
                    </p>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800, color: C.violet, fontFamily: 'monospace' }}>{e.scanned_qty}</span>
                </div>
              ))}
            </div>
            {/* Order total for order mode */}
            {mode === 'order' && (
              <div style={{ marginTop: 10, padding: '12px 14px', background: 'rgba(139,92,246,0.08)', borderRadius: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, color: C.muted }}>Order total</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.violet, fontFamily: 'monospace' }}>
                  A${(entries.reduce((s, e) => s + e.scanned_qty * e.unit_cost_cents, 0) / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Submit */}
      {entries.length > 0 && !current && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <button onClick={submit} disabled={submitting}
            style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: `linear-gradient(135deg, ${C.violet}, #6D28D9)`, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}>
            {submitting ? 'Submitting…' : `✓ ${mode === 'count' ? 'Update all stock' : mode === 'order' ? `Submit order (${entries.length} items)` : 'Confirm all received'}`}
          </button>
        </div>
      )}
    </div>
  );
}
