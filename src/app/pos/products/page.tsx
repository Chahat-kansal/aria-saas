'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Category { id: string; name: string; color: string; }
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  description: string | null; price: number; cost_price: number | null;
  cost: number | null; tax_rate: number | null; stock_quantity: number | null;
  low_stock_threshold: number | null; track_stock: boolean; case_quantity: number | null;
  is_active: boolean; show_online: boolean; image_url: string | null;
  category_id: string | null; supplier_id: string | null; brand_id: string | null; family_id: string | null;
  pos_categories?: { name: string; color: string } | null;
}

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444' };

const EMPTY_FORM = {
  name: '', sku: '', barcode: '', description: '',
  price: '', cost_price: '', tax_rate: '10',
  stock_quantity: '', low_stock_threshold: '', track_stock: false,
  is_active: true, show_online: false, image_url: '',
  category_id: '', supplier_id: '',
};

interface CSVRow { name: string; sku: string; barcode: string; price: string; cost_price: string; category: string; stock: string; active: string; }

export default function ProductsPage() {
  const [products, setProducts]   = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [modal, setModal]         = useState<{ open: boolean; mode: 'add' | 'edit'; product?: Product }>({ open: false, mode: 'add' });
  const [form, setForm]           = useState({ ...EMPTY_FORM });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState('');
  const [csvModal, setCsvModal]   = useState(false);
  const [csvRows, setCsvRows]     = useState<CSVRow[]>([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => {
        setProducts(d.products || []);
        setCategories(d.categories || []);
        setLoading(false);
      }).catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => {
    if (filterStatus === 'active' && !p.is_active) return false;
    if (filterStatus === 'inactive' && p.is_active) return false;
    if (filterCat && p.category_id !== filterCat) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q)
        || (p.sku ?? '').toLowerCase().includes(q)
        || (p.barcode ?? '').toLowerCase().includes(q);
    }
    return true;
  });

  function openAdd() { setForm({ ...EMPTY_FORM }); setSaveError(''); setModal({ open: true, mode: 'add' }); }

  function openEdit(p: Product) {
    setForm({
      name: p.name, sku: p.sku ?? '', barcode: p.barcode ?? '',
      description: p.description ?? '', price: String(p.price),
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      tax_rate: p.tax_rate != null ? String(p.tax_rate) : '10',
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : '',
      low_stock_threshold: p.low_stock_threshold != null ? String(p.low_stock_threshold) : '',
      track_stock: p.track_stock, is_active: p.is_active, show_online: p.show_online,
      image_url: p.image_url ?? '', category_id: p.category_id ?? '', supplier_id: p.supplier_id ?? '',
    });
    setSaveError('');
    setModal({ open: true, mode: 'edit', product: p });
  }

  async function saveProduct() {
    if (!form.name.trim() || !form.price) return;
    setSaving(true); setSaveError('');
    const payload = {
      name: form.name.trim(), sku: form.sku || null, barcode: form.barcode || null,
      description: form.description || null, price: parseFloat(form.price),
      cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
      tax_rate: form.tax_rate ? parseFloat(form.tax_rate) : 10,
      stock_quantity: form.track_stock && form.stock_quantity !== '' ? parseInt(form.stock_quantity) : null,
      low_stock_threshold: form.low_stock_threshold ? parseInt(form.low_stock_threshold) : null,
      track_stock: form.track_stock, is_active: form.is_active, show_online: form.show_online,
      image_url: form.image_url || null,
      category_id: form.category_id || null, supplier_id: form.supplier_id || null,
    };
    if (modal.mode === 'add') {
      const res = await fetch('/api/pos/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.product) { setProducts(ps => [d.product, ...ps]); setModal({ open: false, mode: 'add' }); }
      else { setSaveError(d.error || 'Failed to save'); setSaving(false); return; }
    } else if (modal.product) {
      const res = await fetch(`/api/pos/products?id=${modal.product.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.ok === false) { setSaveError(d.error || 'Failed to update'); setSaving(false); return; }
      setProducts(ps => ps.map(p => p.id === modal.product!.id ? { ...p, ...payload, pos_categories: categories.find(c => c.id === payload.category_id) ?? null } : p));
      setModal({ open: false, mode: 'add' });
    }
    setSaving(false);
  }

  async function deleteProduct(id: string) {
    setDeleting(id);
    await fetch(`/api/pos/products?id=${id}`, { method: 'DELETE' });
    setProducts(ps => ps.filter(p => p.id !== id));
    setDeleting(null);
    if (modal.open) setModal({ open: false, mode: 'add' });
  }

  const allSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id));
  function toggleAll() { allSelected ? setSelected(new Set()) : setSelected(new Set(filtered.map(p => p.id))); }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    const ids = [...selected];
    if (bulkAction === 'delete') {
      if (!confirm(`Delete ${ids.length} product(s)?`)) return;
      await Promise.all(ids.map(id => fetch(`/api/pos/products?id=${id}`, { method: 'DELETE' })));
      setProducts(ps => ps.filter(p => !ids.includes(p.id)));
    } else {
      const patch = bulkAction === 'activate' ? { is_active: true } : { is_active: false };
      await Promise.all(ids.map(id => fetch(`/api/pos/products?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })));
      setProducts(ps => ps.map(p => ids.includes(p.id) ? { ...p, ...patch } : p));
    }
    setSelected(new Set()); setBulkAction('');
  }

  function exportCSV() {
    const rows = [
      ['Name','SKU','Barcode','Price','Cost','Tax%','Stock','Track Stock','Active','Category'],
      ...products.map(p => [p.name, p.sku ?? '', p.barcode ?? '', p.price, p.cost_price ?? '', p.tax_rate ?? 10, p.stock_quantity ?? '', p.track_stock ? 'Yes' : 'No', p.is_active ? 'Yes' : 'No', p.pos_categories?.name ?? '']),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'products.csv'; a.click();
  }

  function handleCSVFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = (ev.target?.result as string).split('\n').slice(1).filter(Boolean);
      const rows: CSVRow[] = lines.map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
        return { name: cols[0] ?? '', sku: cols[1] ?? '', barcode: cols[2] ?? '', price: cols[3] ?? '', cost_price: cols[4] ?? '', category: cols[9] ?? '', stock: cols[6] ?? '', active: cols[8] ?? 'Yes' };
      }).filter(r => r.name && r.price);
      setCsvRows(rows); setCsvModal(true);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function importCSV() {
    setImporting(true);
    for (const row of csvRows) {
      const res = await fetch('/api/pos/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.name, sku: row.sku || null, barcode: row.barcode || null, price: parseFloat(row.price) || 0, cost_price: row.cost_price ? parseFloat(row.cost_price) : null, is_active: row.active !== 'No', stock_quantity: row.stock ? parseInt(row.stock) : null }),
      });
      const d = await res.json();
      if (d.product) setProducts(ps => [d.product, ...ps]);
    }
    setCsvModal(false); setCsvRows([]); setImporting(false);
  }

  const iCls = { background: 'rgba(10,9,16,0.8)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: "'Manrope',sans-serif", width: '100%', boxSizing: 'border-box' as const };
  const lCls = { display: 'block', fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' };
  const fld = (k: keyof typeof form) => ({ value: form[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value })) });

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVFile} />
      <div style={{ padding: '20px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 2 }}>Products</h1>
            <p style={{ fontSize: 12, color: C.muted }}>{products.length} total · {products.filter(p => p.is_active).length} active</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => fileRef.current?.click()}
              style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Import CSV
            </button>
            <button onClick={exportCSV}
              style={{ padding: '8px 16px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Export CSV
            </button>
            <button onClick={openAdd}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              + Add Product
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, SKU, barcode…"
            style={{ ...iCls, width: 240, flex: 'none' }} />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ ...iCls, width: 'auto', flex: 'none', background: C.card }}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['all', 'active', 'inactive'] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)}
                style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${filterStatus === s ? C.violet : C.border}`, background: filterStatus === s ? 'rgba(139,92,246,0.15)' : 'transparent', color: filterStatus === s ? C.violet : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                {s}
              </button>
            ))}
          </div>
          {selected.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
              <span style={{ fontSize: 12, color: C.muted }}>{selected.size} selected</span>
              <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
                style={{ ...iCls, width: 'auto', flex: 'none', background: C.card }}>
                <option value="">Bulk action…</option>
                <option value="activate">Set Active</option>
                <option value="deactivate">Set Inactive</option>
                <option value="delete">Delete</option>
              </select>
              <button onClick={applyBulk} disabled={!bulkAction}
                style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: C.violet, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: bulkAction ? 1 : 0.4 }}>
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                <th style={{ width: 40, padding: '10px 14px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ accentColor: C.violet, width: 14, height: 14 }} />
                </th>
                {['Status','Product','Category','Cost','Inventory','Price','Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} style={{ padding: '12px' }}>
                        <div style={{ height: 12, borderRadius: 4, background: 'rgba(255,255,255,0.05)', width: j === 1 ? 140 : 60 }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 24px', textAlign: 'center', color: C.dim, fontSize: 13 }}>
                    {!products.length ? 'No products yet — add your first product above' : 'No products match your filters'}
                  </td>
                </tr>
              ) : filtered.map((p, i) => {
                const lowStock = p.track_stock && p.stock_quantity != null && p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold;
                const margin = p.cost_price && p.price > 0 ? ((p.price - p.cost_price) / p.price * 100) : null;
                return (
                  <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', background: selected.has(p.id) ? 'rgba(139,92,246,0.05)' : 'transparent', transition: 'background 100ms' }}>
                    <td style={{ padding: '10px 14px' }}>
                      <input type="checkbox" checked={selected.has(p.id)}
                        onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })}
                        style={{ accentColor: C.violet, width: 14, height: 14 }} />
                    </td>
                    {/* Status dot */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.is_active ? C.green : C.dim, flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: p.is_active ? C.green : C.dim }}>{p.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </td>
                    {/* Product */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {p.image_url
                          ? <img src={p.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(139,92,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12, fontWeight: 700, color: C.violet }}>{p.name[0].toUpperCase()}</div>}
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 1 }}>{p.name}</p>
                          <p style={{ fontSize: 10, color: C.dim, fontFamily: "'JetBrains Mono',monospace" }}>{p.sku ? `SKU: ${p.sku}` : p.barcode ? p.barcode : '—'}</p>
                        </div>
                      </div>
                    </td>
                    {/* Category */}
                    <td style={{ padding: '10px 12px' }}>
                      {p.pos_categories
                        ? <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 99, background: `${p.pos_categories.color}20`, color: p.pos_categories.color, border: `1px solid ${p.pos_categories.color}40`, fontWeight: 700 }}>{p.pos_categories.name}</span>
                        : <span style={{ fontSize: 11, color: C.dim }}>—</span>}
                    </td>
                    {/* Cost + margin */}
                    <td style={{ padding: '10px 12px' }}>
                      <p style={{ fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>
                        {p.cost_price != null ? `A$${Number(p.cost_price).toFixed(2)}` : '—'}
                      </p>
                      {margin != null && <p style={{ fontSize: 10, color: margin > 20 ? C.green : '#F59E0B' }}>{margin.toFixed(1)}%</p>}
                    </td>
                    {/* Inventory */}
                    <td style={{ padding: '10px 12px' }}>
                      {!p.track_stock
                        ? <span style={{ fontSize: 11, color: C.dim }}>Untracked</span>
                        : <span style={{ fontSize: 13, fontWeight: 600, color: lowStock ? C.red : C.text, fontFamily: "'JetBrains Mono',monospace" }}>
                            {p.stock_quantity ?? 0}
                            {p.case_quantity && p.case_quantity > 1 ? <span style={{ fontSize: 10, color: C.dim, fontWeight: 400 }}> items</span> : null}
                            {lowStock && <span style={{ marginLeft: 6, fontSize: 9, padding: '2px 6px', borderRadius: 99, background: 'rgba(239,68,68,0.12)', color: C.red, fontWeight: 700 }}>LOW</span>}
                          </span>}
                    </td>
                    {/* Price */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontFamily: "'JetBrains Mono',monospace" }}>A${Number(p.price).toFixed(2)}</span>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Link href={`/pos/products/${p.id}`}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                          View
                        </Link>
                        <Link href={`/pos/products/${p.id}/edit`}
                          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid rgba(139,92,246,0.3)`, background: 'rgba(139,92,246,0.08)', color: C.violet, fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'inline-block' }}>
                          Edit
                        </Link>
                        <button onClick={() => { if (confirm(`Delete "${p.name}"?`)) deleteProduct(p.id); }}
                          disabled={deleting === p.id}
                          style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: deleting === p.id ? 0.5 : 1 }}>
                          {deleting === p.id ? '…' : 'Del'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modal.open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{modal.mode === 'add' ? 'Add Product' : 'Edit Product'}</h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={lCls}>Product Name *</label>
                <input {...fld('name')} placeholder="e.g. Coffee Blend 250g" style={iCls} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lCls}>SKU</label><input {...fld('sku')} placeholder="SKU-001" style={iCls} /></div>
                <div><label style={lCls}>Barcode</label><input {...fld('barcode')} placeholder="9312345678901" style={iCls} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={lCls}>Price (A$) *</label><input {...fld('price')} type="number" step="0.01" min="0" placeholder="0.00" style={iCls} /></div>
                <div><label style={lCls}>Cost Price</label><input {...fld('cost_price')} type="number" step="0.01" min="0" placeholder="0.00" style={iCls} /></div>
                <div><label style={lCls}>Tax Rate %</label><input {...fld('tax_rate')} type="number" step="0.5" min="0" max="100" style={iCls} /></div>
              </div>
              <div>
                <label style={lCls}>Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} style={{ ...iCls, background: 'var(--bg-base)' }}>
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={form.track_stock} onChange={e => setForm(f => ({ ...f, track_stock: e.target.checked }))} style={{ accentColor: C.violet, width: 14, height: 14 }} />
                  <span style={{ fontSize: 13, color: C.text }}>Track stock quantity</span>
                </label>
                {form.track_stock && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div><label style={lCls}>Stock Quantity</label><input {...fld('stock_quantity')} type="number" min="0" placeholder="0" style={iCls} /></div>
                    <div><label style={lCls}>Low Stock Alert</label><input {...fld('low_stock_threshold')} type="number" min="0" placeholder="5" style={iCls} /></div>
                  </div>
                )}
              </div>
              <div>
                <label style={lCls}>Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Optional description…" style={{ ...iCls, resize: 'vertical' as const }} />
              </div>
              <div>
                <label style={lCls}>Image URL</label>
                <input {...fld('image_url')} placeholder="https://…" style={iCls} />
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                {([['is_active', 'Active'], ['show_online', 'Show Online']] as const).map(([k, label]) => (
                  <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))} style={{ accentColor: C.violet, width: 14, height: 14 }} />
                    <span style={{ fontSize: 13, color: C.text }}>{label}</span>
                  </label>
                ))}
              </div>
              {saveError && <p style={{ fontSize: 12, color: C.red }}>{saveError}</p>}
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {modal.mode === 'edit' && (
                  <button onClick={() => modal.product && deleteProduct(modal.product.id)} disabled={deleting === modal.product?.id}
                    style={{ fontSize: 12, color: C.red, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                    {deleting === modal.product?.id ? 'Deleting…' : 'Delete product'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setModal({ open: false, mode: 'add' })}
                  style={{ padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving || !form.name.trim() || !form.price}
                  style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving || !form.name.trim() || !form.price ? 0.5 : 1 }}>
                  {saving ? 'Saving…' : modal.mode === 'add' ? 'Add Product' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Preview Modal */}
      {csvModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,0.6)' }}>
          <div style={{ background: '#0F0D1C', border: `1px solid ${C.border}`, borderRadius: 18, width: '100%', maxWidth: 720, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text }}>CSV Import Preview</h2>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{csvRows.length} products found</p>
              </div>
              <button onClick={() => { setCsvModal(false); setCsvRows([]); }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>&times;</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: `1px solid ${C.border}` }}>
                    {['Name','SKU','Barcode','Price','Cost','Stock','Active'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '8px 12px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvRows.slice(0, 20).map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: C.text }}>{r.name}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{r.sku || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{r.barcode || '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 12, color: C.text, fontFamily: 'monospace' }}>A${parseFloat(r.price).toFixed(2)}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: C.muted, fontFamily: 'monospace' }}>{r.cost_price ? `A$${parseFloat(r.cost_price).toFixed(2)}` : '—'}</td>
                      <td style={{ padding: '8px 12px', fontSize: 11, color: C.muted }}>{r.stock || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 99, background: r.active !== 'No' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', color: r.active !== 'No' ? C.green : C.red }}>{r.active !== 'No' ? 'Yes' : 'No'}</span>
                      </td>
                    </tr>
                  ))}
                  {csvRows.length > 20 && (
                    <tr><td colSpan={7} style={{ padding: '10px 12px', textAlign: 'center', fontSize: 12, color: C.dim }}>…and {csvRows.length - 20} more</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { setCsvModal(false); setCsvRows([]); }}
                style={{ padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={importCSV} disabled={importing}
                style={{ padding: '8px 22px', borderRadius: 9, border: 'none', background: C.violet, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: importing ? 0.6 : 1 }}>
                {importing ? 'Importing…' : `Import ${csvRows.length} Products`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
