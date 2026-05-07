'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import BarcodeScanner from '@/components/pos/BarcodeScanner';

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B' };

interface ScannedItem {
  barcode: string;
  productId?: string;
  name: string;
  price: number;
  status: 'added' | 'exists' | 'skipped' | 'saving';
  imageUrl?: string | null;
  source: string;
}

interface LookupResult {
  source: 'catalogue' | 'openfoodfacts' | 'not_found';
  barcode: string;
  product: any;
}

interface PendingProduct {
  barcode: string;
  name: string;
  price: string;
  costPrice: string;
  stockQty: string;
  trackStock: boolean;
  description: string | null;
  imageUrl: string | null;
  categoryId: string;
  source: string;
}

const iCls = { background: 'rgba(10,9,16,0.9)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' as const };
const lCls = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };

export default function ScanImportPage() {
  const [scanActive, setScanActive]       = useState(false);
  const [bid, setBid]                     = useState<string | null>(null);
  const [categories, setCategories]       = useState<Array<{ id: string; name: string }>>([]);
  const [scannedItems, setScannedItems]   = useState<ScannedItem[]>([]);
  const [pending, setPending]             = useState<PendingProduct | null>(null);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState<string | null>(null);
  const [done, setDone]                   = useState(false);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      if (d.business_id) setBid(d.business_id);
      setCategories(d.categories ?? []);
    });
  }, []);

  useEffect(() => {
    if (pending && priceRef.current) {
      setTimeout(() => priceRef.current?.focus(), 100);
    }
  }, [pending]);

  // Keyboard: Escape to close scanner/pending; Space to toggle scanner
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') { setScanActive(false); setPending(null); }
      if ((e.key === ' ' || e.key === 'Enter') && !pending) { e.preventDefault(); setScanActive(v => !v); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  const handleScan = useCallback(async (barcode: string) => {
    if (!bid) return;
    setScanActive(false); // pause camera while processing

    // Lookup barcode
    const res = await fetch(`/api/pos/import/barcode-lookup?barcode=${encodeURIComponent(barcode)}&business_id=${bid}`);
    const data: LookupResult = await res.json();

    if (data.source === 'catalogue') {
      // Already exists
      setScannedItems(prev => [{
        barcode,
        productId: data.product.id,
        name: data.product.name,
        price: data.product.price,
        status: 'exists',
        imageUrl: data.product.image_url,
        source: 'catalogue',
      }, ...prev]);
      showToast(`${data.product.name} — already in your catalogue ✓`);
      setTimeout(() => setScanActive(true), 800); // resume
      return;
    }

    // Show confirmation form
    const p = data.product;
    setPending({
      barcode,
      name: p?.name ?? '',
      price: p ? (p.price != null ? String(p.price) : '') : '',
      costPrice: '',
      stockQty: '1',
      trackStock: true,
      description: p?.description ?? null,
      imageUrl: p?.image_url ?? null,
      categoryId: '',
      source: data.source === 'openfoodfacts' ? 'openfoodfacts' : 'manual',
    });
  }, [bid]);

  async function addProduct() {
    if (!pending || !bid || !pending.name) return;
    setSaving(true);

    const payload = {
      business_id: bid,
      name: pending.name.trim(),
      barcode: pending.barcode,
      price: parseFloat(pending.price) || 0,
      cost_price: pending.costPrice ? parseFloat(pending.costPrice) : null,
      stock_quantity: pending.trackStock ? (parseInt(pending.stockQty) || 0) : null,
      track_stock: pending.trackStock,
      description: pending.description || null,
      image_url: pending.imageUrl || null,
      category_id: pending.categoryId || null,
      is_active: true,
      source: pending.source,
    };

    const res = await fetch('/api/pos/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const d = await res.json();

    if (d.product) {
      setScannedItems(prev => [{
        barcode: pending.barcode,
        productId: d.product.id,
        name: pending.name,
        price: parseFloat(pending.price) || 0,
        status: 'added',
        imageUrl: pending.imageUrl,
        source: pending.source,
      }, ...prev]);
      showToast(`${pending.name} — added ✓`);
    }

    setPending(null);
    setSaving(false);
    setScanActive(true); // resume camera
  }

  function skipProduct() {
    if (!pending) return;
    setScannedItems(prev => [{
      barcode: pending.barcode,
      name: pending.name || pending.barcode,
      price: parseFloat(pending.price) || 0,
      status: 'skipped',
      imageUrl: null,
      source: 'skipped',
    }, ...prev]);
    setPending(null);
    setScanActive(true);
  }

  const counts = {
    total: scannedItems.length,
    added: scannedItems.filter(i => i.status === 'added').length,
    exists: scannedItems.filter(i => i.status === 'exists').length,
    skipped: scannedItems.filter(i => i.status === 'skipped').length,
  };

  if (done) {
    return (
      <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 32 }}>
        <div style={{ fontSize: 56 }}>🎉</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text }}>Import Complete</h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, width: '100%', maxWidth: 400 }}>
          {[['Added', counts.added, C.green], ['Already existed', counts.exists, C.muted], ['Skipped', counts.skipped, C.dim]].map(([l, v, c]) => (
            <div key={l as string} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
              <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 28, fontWeight: 700, color: c as string }}>{v as number}</p>
              <p style={{ fontSize: 11, color: C.muted }}>{l as string}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => { setDone(false); setScannedItems([]); setScanActive(true); }}
            style={{ padding: '10px 22px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Scan more
          </button>
          <Link href="/pos/products"
            style={{ padding: '10px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            View products →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* BarcodeScanner overlay — full screen when active */}
      <BarcodeScanner isActive={scanActive} onScan={handleScan} onClose={() => setScanActive(false)} />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--bg-elevated)', border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 20px', fontSize: 13, fontWeight: 600, color: C.text, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '16px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/import" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Import</Link>
          <span style={{ color: C.border }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Scan to Import</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {counts.total > 0 && (
            <button onClick={() => setDone(true)}
              style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done ({counts.total} scanned)
            </button>
          )}
          <button onClick={() => setScanActive(true)} disabled={!!pending}
            style={{ padding: '8px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: pending ? 0.4 : 1 }}>
            📷 Scan Barcode
          </button>
        </div>
      </div>

      {/* Counter strip */}
      <div style={{ padding: '10px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 20, background: 'rgba(255,255,255,0.01)' }}>
        {[
          [`${counts.total} scanned`, C.muted],
          [`${counts.added} added`, C.green],
          [`${counts.exists} already existed`, C.dim],
          [`${counts.skipped} skipped`, C.dim],
        ].map(([l, c]) => (
          <span key={l as string} style={{ fontSize: 12, fontWeight: 600, color: c as string }}>{l as string}</span>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Pending product form */}
        {pending && (
          <div style={{ background: C.card, border: `1px solid ${C.violet}`, borderRadius: 16, padding: '20px 20px', boxShadow: '0 0 0 3px rgba(139,92,246,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 16 }}>
              {pending.imageUrl && (
                <img src={pending.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: pending.source === 'openfoodfacts' ? 'rgba(34,197,94,0.12)' : 'rgba(139,92,246,0.12)', color: pending.source === 'openfoodfacts' ? C.green : C.violet, fontWeight: 700 }}>
                    {pending.source === 'openfoodfacts' ? 'Found in database' : 'Manual entry'}
                  </span>
                  <span style={{ fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono',monospace" }}>{pending.barcode}</span>
                </div>
                <p style={{ fontSize: 12, color: C.dim }}>Review details and click Add product</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lCls}>Product Name *</label>
                <input value={pending.name} onChange={e => setPending(p => p ? { ...p, name: e.target.value } : p)}
                  style={iCls} placeholder="Enter product name" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lCls}>Sell Price (A$)</label>
                  <input ref={priceRef} type="number" step="0.01" min="0" value={pending.price}
                    onChange={e => setPending(p => p ? { ...p, price: e.target.value } : p)}
                    style={iCls} placeholder="0.00" />
                </div>
                <div>
                  <label style={lCls}>Cost Price</label>
                  <input type="number" step="0.01" min="0" value={pending.costPrice}
                    onChange={e => setPending(p => p ? { ...p, costPrice: e.target.value } : p)}
                    style={iCls} placeholder="0.00" />
                </div>
                <div>
                  <label style={lCls}>Stock Qty</label>
                  <input type="number" min="0" value={pending.stockQty}
                    onChange={e => setPending(p => p ? { ...p, stockQty: e.target.value } : p)}
                    style={iCls} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={lCls}>Category</label>
                  <select value={pending.categoryId} onChange={e => setPending(p => p ? { ...p, categoryId: e.target.value } : p)}
                    style={{ ...iCls, background: 'var(--bg-base)' }}>
                    <option value="">No category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 22 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={pending.trackStock} onChange={e => setPending(p => p ? { ...p, trackStock: e.target.checked } : p)}
                      style={{ accentColor: C.violet, width: 14, height: 14 }} />
                    <span style={{ fontSize: 13, color: C.text }}>Track inventory</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addProduct} disabled={saving || !pending.name || !pending.price}
                  style={{ flex: 1, padding: '10px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !pending.name || !pending.price ? 0.5 : 1 }}>
                  {saving ? 'Adding…' : '✓ Add product'}
                </button>
                <button onClick={skipProduct}
                  style={{ padding: '10px 20px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  ✗ Skip
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Instructions if nothing scanned yet */}
        {!pending && scannedItems.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: C.dim }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
            <p style={{ fontSize: 15, color: C.muted, fontWeight: 600, marginBottom: 8 }}>Tap "Scan Barcode" to start</p>
            <p style={{ fontSize: 13, color: C.dim, lineHeight: 1.6 }}>
              Point your camera at any product barcode.<br />
              Aria looks up details automatically and lets you set the price.
            </p>
            <p style={{ fontSize: 11, color: C.dim, marginTop: 16 }}>Press Space to toggle camera · Esc to close</p>
          </div>
        )}

        {/* Scanned items list */}
        {scannedItems.length > 0 && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 10 }}>Scanned</p>
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {scannedItems.map((item, i) => {
                const statusColor = item.status === 'added' ? C.green : item.status === 'exists' ? C.muted : C.dim;
                const statusLabel = item.status === 'added' ? 'Added ✓' : item.status === 'exists' ? 'Already exists' : 'Skipped';
                return (
                  <div key={`${item.barcode}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: i < scannedItems.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>📦</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      <p style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono',monospace" }}>{item.barcode}</p>
                    </div>
                    {item.price > 0 && <span style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'JetBrains Mono',monospace", flexShrink: 0 }}>A${item.price.toFixed(2)}</span>}
                    <span style={{ fontSize: 11, color: statusColor, fontWeight: 600, flexShrink: 0 }}>{statusLabel}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
