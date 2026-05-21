'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product { id: string; name: string; price: number; barcode?: string | null; sku?: string | null; pos_categories?: { name: string } | null; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#006AFF', green:'#00B140' };

export default function EverydayTicketsPage() {
  const [products, setProducts]   = useState<Product[]>([]);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [printing, setPrinting]   = useState(false);
  const [bizName, setBizName]     = useState('My Store');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => {
      setProducts((d.products ?? []).filter((p: Product) => p.price > 0));
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/pos/settings').then(r => r.json()).then(d => {
      if (d?.business_name) setBizName(d.business_name);
    }).catch(() => {});
  }, []);

  const cats = [...new Set(products.map(p => (p.pos_categories as any)?.name).filter(Boolean))];

  const filtered = products.filter(p => {
    const nm = p.name.toLowerCase();
    return (!search || nm.includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()))
        && (!catFilter || (p.pos_categories as any)?.name === catFilter);
  });

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  const previewProduct = products.find(p => selected.has(p.id)) ?? filtered[0] ?? null;

  function printClientSide() {
    const selectedProducts = products.filter(p => selected.has(p.id));
    if (!selectedProducts.length) { alert('Select at least one product'); return; }

    const labels = selectedProducts.map(p => `
      <div class="label">
        <div class="biz">${bizName}</div>
        <div class="name">${p.name}</div>
        <div class="price">A$${p.price.toFixed(2)}</div>
        ${p.barcode ? `<div class="barcode">${p.barcode}</div>` : p.sku ? `<div class="barcode">SKU: ${p.sku}</div>` : ''}
        ${(p.pos_categories as any)?.name ? `<div class="cat">${(p.pos_categories as any).name}</div>` : ''}
      </div>
    `).join('');

    const html = `<!DOCTYPE html><html><head><title>Price Tickets</title><style>
      @page { size: 80mm 50mm; margin: 2mm; }
      body { margin: 0; font-family: Arial, sans-serif; }
      .label { width: 76mm; height: 46mm; border: 1px solid #ccc; border-radius: 3mm; padding: 3mm; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
      .biz { font-size: 8pt; color: #666; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2mm; }
      .name { font-size: 11pt; font-weight: bold; margin-bottom: 3mm; }
      .price { font-size: 22pt; font-weight: 900; color: #6D28D9; margin-bottom: 2mm; }
      .barcode { font-size: 7pt; color: #999; font-family: monospace; margin-bottom: 1mm; }
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
        body: JSON.stringify({ product_ids: ids, template: 'everyday' }),
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
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>Everyday Price Tickets</h1>
          <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{selected.size} of {filtered.length} selected</p>
        </div>
        <button onClick={print} disabled={printing || selected.size === 0}
          style={{ padding: '10px 24px', borderRadius: 10, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: selected.size === 0 ? 0.4 : 1 }}>
          {printing ? 'Generating…' : `🖨️ Print ${selected.size > 0 ? `(${selected.size})` : ''} Tickets`}
        </button>
      </div>

      {/* Two-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', minHeight: 'calc(100vh - 75px)' }}>

        {/* LEFT: Product selector */}
        <div style={{ padding: '20px 24px', borderRight: `1px solid ${C.border}` }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
              style={{ flex: 1, minWidth: 200, background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 8, padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}>
              <option value="">All categories</option>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Product list */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: '#FAFAFA' }}>
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll}
                style={{ width: 14, height: 14, accentColor: C.violet }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim }}>Select all ({filtered.length})</span>
            </div>
            {loading ? (
              <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>Loading…</div>
            ) : !filtered.length ? (
              <div style={{ padding: 48, textAlign: 'center', color: C.dim, fontSize: 13 }}>No products found</div>
            ) : (
              filtered.map((p, i) => (
                <div key={p.id} onClick={() => setSelected(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer', background: selected.has(p.id) ? 'rgba(139,92,246,0.06)' : 'transparent', transition: 'background 100ms' }}>
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => {}} style={{ width: 14, height: 14, accentColor: C.violet, pointerEvents: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: C.dim }}>{(p.pos_categories as any)?.name ?? ''}{p.sku ? ` · ${p.sku}` : ''}</div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 800, color: selected.has(p.id) ? C.violet : C.text }}>A${p.price.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Label preview + print options */}
        <div style={{ padding: '24px 20px', background: 'rgba(10,8,20,0.5)' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Label Preview</p>

          {previewProduct ? (
            <>
              {/* Ticket preview */}
              <div style={{ width: 300, height: 180, background: '#fff', borderRadius: 8, padding: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{bizName}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111', marginBottom: 12, lineHeight: 1.3 }}>{previewProduct.name}</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#6D28D9', marginBottom: 10 }}>A${previewProduct.price.toFixed(2)}</div>
                {(previewProduct.barcode || previewProduct.sku) && (
                  <div style={{ fontSize: 9, color: '#bbb', fontFamily: 'monospace', marginBottom: 4 }}>{previewProduct.barcode || `SKU: ${previewProduct.sku}`}</div>
                )}
                {(previewProduct.pos_categories as any)?.name && (
                  <div style={{ fontSize: 9, color: '#ccc' }}>{(previewProduct.pos_categories as any).name}</div>
                )}
              </div>

              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '14px 16px', fontSize: 12, color: C.muted }}>
                <p style={{ fontWeight: 700, color: C.text, marginBottom: 8 }}>Print Info</p>
                <p>Label size: 80mm × 50mm</p>
                <p style={{ marginTop: 4 }}>Selected: {selected.size} ticket{selected.size !== 1 ? 's' : ''}</p>
                <p style={{ marginTop: 4 }}>Format: PDF-ready, print-optimised</p>
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
