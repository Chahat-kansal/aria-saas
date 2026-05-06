'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product { id: string; name: string; price: number; barcode?: string | null; sku?: string | null; pos_categories?: { name: string } | null; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6', red:'#EF4444' };

export default function PromotionalTicketsPage() {
  const [products, setProducts]     = useState<Product[]>([]);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [printing, setPrinting]     = useState(false);
  const [promoPrice, setPromoPrice] = useState('');
  const [bizName, setBizName]       = useState('My Store');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts((d.products ?? []).filter((p: Product) => p.price > 0));
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      if (d?.business_name) setBizName(d.business_name);
    }).catch(() => {});
  }, []);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const previewProduct = products.find(p => selected.has(p.id)) ?? filtered[0] ?? null;
  const salePrice = parseFloat(promoPrice) || 0;

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  function printClientSide() {
    const selectedProducts = products.filter(p => selected.has(p.id));
    if (!selectedProducts.length) { alert('Select at least one product'); return; }

    const labels = selectedProducts.map(p => {
      const sale = salePrice > 0 ? salePrice : p.price * 0.9;
      return `
        <div class="label">
          <div class="biz">${bizName}</div>
          <div class="badge">SALE</div>
          <div class="name">${p.name}</div>
          <div class="prices">
            <span class="orig">A$${p.price.toFixed(2)}</span>
            <span class="sale">A$${sale.toFixed(2)}</span>
          </div>
          ${p.barcode ? `<div class="barcode">${p.barcode}</div>` : p.sku ? `<div class="barcode">SKU: ${p.sku}</div>` : ''}
          ${(p.pos_categories as any)?.name ? `<div class="cat">${(p.pos_categories as any).name}</div>` : ''}
        </div>
      `;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Promotional Tickets</title><style>
      @page { size: 80mm 50mm; margin: 2mm; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .label { width: 76mm; height: 46mm; border: 2px solid #EF4444; border-radius: 3mm; padding: 3mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
      .biz { font-size: 7pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 1mm; }
      .badge { background: #EF4444; color: white; font-size: 8pt; font-weight: 900; padding: 1mm 4mm; border-radius: 2mm; margin-bottom: 2mm; letter-spacing: 0.1em; }
      .name { font-size: 10pt; font-weight: bold; margin-bottom: 3mm; }
      .prices { display: flex; gap: 4mm; align-items: baseline; margin-bottom: 2mm; }
      .orig { font-size: 12pt; color: #999; text-decoration: line-through; }
      .sale { font-size: 20pt; font-weight: 900; color: #EF4444; }
      .barcode { font-size: 7pt; color: #bbb; font-family: monospace; }
      .cat { font-size: 7pt; color: #aaa; }
      @media print { body { -webkit-print-color-adjust: exact; } }
    </style></head><body>${labels}<script>window.onload=()=>{window.print();}<\/script></body></html>`;

    const w = window.open('', '_blank', 'width=800,height=600');
    if (w) { w.document.write(html); w.document.close(); w.focus(); }
  }

  async function print() {
    const ids = Array.from(selected);
    if (!ids.length) { alert('Select at least one product'); return; }
    setPrinting(true);
    try {
      const r = await fetch('/api/pos/price-tickets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: ids, template: 'promotional', promotional_price: promoPrice }),
      });
      if (r.ok) {
        const html = await r.text();
        const w = window.open('', '_blank', 'width=800,height=600');
        if (w) { w.document.write(html); w.document.close(); w.focus(); }
      } else {
        printClientSide();
      }
    } catch {
      printClientSide();
    }
    setPrinting(false);
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
            <Link href="/pos/price-tickets" style={{ color: C.muted, fontSize: 12, textDecoration: 'none' }}>← Price Tickets</Link>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Promotional Tickets</h1>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Tickets show original price crossed out + promo price in red</p>
        </div>
        <button onClick={print} disabled={printing || selected.size === 0}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 ? 0.4 : 1 }}>
          {printing ? 'Generating…' : `🖨️ Print (${selected.size})`}
        </button>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 'calc(100vh - 75px)' }}>

        {/* LEFT: Product selector */}
        <div style={{ padding: '20px 24px', borderRight: `1px solid ${C.border}` }}>
          {/* Promo price override */}
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: C.text }}>Promotional price for all selected:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.red }}>A$</span>
              <input type="number" value={promoPrice} onChange={e => setPromoPrice(e.target.value)} min="0" step="0.01" placeholder="0.00"
                style={{ width: 100, background: C.card, border: `1px solid rgba(239,68,68,0.3)`, color: C.text, borderRadius: 8, padding: '8px 10px', fontSize: 16, fontWeight: 700, outline: 'none', fontFamily: "'JetBrains Mono',monospace" }} />
            </div>
            <span style={{ fontSize: 11, color: C.muted }}>Leave blank to use each product's price</span>
          </div>

          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
            style={{ width: '100%', marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />

          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
                style={{ width: 14, height: 14, accentColor: C.red }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim }}>Select all ({filtered.length})</span>
            </div>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
            ) : (
              filtered.map((p, i) => (
                <div key={p.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selected.has(p.id) ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}} style={{ width: 14, height: 14, accentColor: C.red, pointerEvents: 'none' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: C.dim }}>
                      RRP: <span style={{ textDecoration: 'line-through' }}>A${p.price.toFixed(2)}</span>
                      {salePrice > 0 ? ` → A$${salePrice.toFixed(2)}` : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Label preview */}
        <div style={{ padding: '24px 20px', background: 'rgba(10,8,20,0.5)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Label Preview</p>

          {previewProduct ? (
            <>
              {/* Ticket preview */}
              <div style={{ width: 300, height: 180, background: '#fff', border: '2px solid #EF4444', borderRadius: 8, padding: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{bizName}</div>
                <div style={{ background: '#EF4444', color: 'white', fontSize: 9, fontWeight: 900, padding: '2px 10px', borderRadius: 4, marginBottom: 8, letterSpacing: '0.1em' }}>SALE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111', marginBottom: 8, lineHeight: 1.3 }}>{previewProduct.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 14, color: '#999', textDecoration: 'line-through' }}>A${previewProduct.price.toFixed(2)}</span>
                  <span style={{ fontSize: 28, fontWeight: 900, color: '#EF4444' }}>A${salePrice > 0 ? salePrice.toFixed(2) : (previewProduct.price * 0.9).toFixed(2)}</span>
                </div>
                {(previewProduct.barcode || previewProduct.sku) && (
                  <div style={{ fontSize: 8, color: '#bbb', fontFamily: 'monospace' }}>{previewProduct.barcode || `SKU: ${previewProduct.sku}`}</div>
                )}
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', fontSize: 12, color: C.muted }}>
                <p style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>Print Info</p>
                <p>Label size: 80mm × 50mm</p>
                <p style={{ marginTop: 4 }}>Selected: {selected.size} ticket{selected.size !== 1 ? 's' : ''}</p>
                <p style={{ marginTop: 4 }}>Promo price: {salePrice > 0 ? `A$${salePrice.toFixed(2)}` : 'Per product (×0.9 default)'}</p>
              </div>
            </>
          ) : (
            <div style={{ color: C.dim, fontSize: 13, textAlign: 'center', paddingTop: 48 }}>
              Select a product to preview label
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
