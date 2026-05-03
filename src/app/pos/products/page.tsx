'use client';
import { useState, useEffect, useRef } from 'react';
import { POSAriaInsight } from '@/components/pos/POSAriaInsight';

interface Category { id: string; name: string; color: string; }
interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  description: string | null; price: number; cost_price: number | null;
  tax_rate: number | null; stock_quantity: number | null;
  low_stock_threshold: number | null; track_stock: boolean;
  is_active: boolean; show_online: boolean; image_url: string | null;
  category_id: string | null; supplier_id: string | null;
  pos_categories?: { name: string; color: string } | null;
}

const EMPTY_FORM = {
  name: '', sku: '', barcode: '', description: '',
  price: '', cost_price: '', tax_rate: '10',
  stock_quantity: '', low_stock_threshold: '', track_stock: false,
  is_active: true, show_online: false, image_url: '',
  category_id: '', supplier_id: '',
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ open: boolean; mode: 'add' | 'edit'; product?: Product }>({ open: false, mode: 'add' });
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [bulkAction, setBulkAction] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => {
        setProducts(d.products || []);
        setCategories(d.categories || []);
        setLoading(false);
      });
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

  function openAdd() {
    setForm({ ...EMPTY_FORM });
    setModal({ open: true, mode: 'add' });
  }

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
    setModal({ open: true, mode: 'edit', product: p });
  }

  async function saveProduct() {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    setSaveError('');
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
      const res = await fetch('/api/pos/products', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.product) {
        setProducts(ps => [...ps, d.product]);
        setModal({ open: false, mode: 'add' });
      } else {
        console.error('Product save failed:', d.error);
        setSaveError(d.error || 'Failed to save product. Please try again.');
        setSaving(false);
        return;
      }
    } else if (modal.product) {
      const res = await fetch(`/api/pos/products?id=${modal.product.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (d.ok !== undefined && !d.ok) {
        console.error('Product update failed:', d.error);
        setSaveError(d.error || 'Failed to update product. Please try again.');
        setSaving(false);
        return;
      }
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
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(p => p.id)));
  }

  async function applyBulk() {
    if (!bulkAction || selected.size === 0) return;
    const ids = [...selected];
    if (bulkAction === 'delete') {
      await Promise.all(ids.map(id => fetch(`/api/pos/products?id=${id}`, { method: 'DELETE' })));
      setProducts(ps => ps.filter(p => !ids.includes(p.id)));
    } else {
      const patch = bulkAction === 'activate' ? { is_active: true } : { is_active: false };
      await Promise.all(ids.map(id => fetch(`/api/pos/products?id=${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })));
      setProducts(ps => ps.map(p => ids.includes(p.id) ? { ...p, ...patch } : p));
    }
    setSelected(new Set());
    setBulkAction('');
  }

  function exportCSV() {
    const rows = [
      ['Name', 'SKU', 'Barcode', 'Price', 'Cost', 'Tax%', 'Stock', 'Track Stock', 'Active', 'Category'],
      ...products.map(p => [
        p.name, p.sku ?? '', p.barcode ?? '', p.price, p.cost_price ?? '', p.tax_rate ?? 10,
        p.stock_quantity ?? '', p.track_stock ? 'Yes' : 'No', p.is_active ? 'Yes' : 'No',
        p.pos_categories?.name ?? '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'products.csv';
    a.click();
  }

  function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const lines = (ev.target?.result as string).split('\n').slice(1).filter(Boolean);
      for (const line of lines) {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
        const [name, sku, barcode, price, cost_price, tax_rate, stock_quantity, track_stock, is_active] = cols;
        if (!name || !price) continue;
        const res = await fetch('/api/pos/products', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name, sku: sku || null, barcode: barcode || null,
            price: parseFloat(price) || 0,
            cost_price: cost_price ? parseFloat(cost_price) : null,
            tax_rate: tax_rate ? parseFloat(tax_rate) : 10,
            stock_quantity: stock_quantity ? parseInt(stock_quantity) : null,
            track_stock: track_stock === 'Yes',
            is_active: is_active !== 'No',
          }),
        });
        const d = await res.json();
        if (d.product) setProducts(ps => [...ps, d.product]);
      }
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  const fld = (k: keyof typeof form) => ({
    value: form[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value })),
  });

  return (
    <div className="min-h-full bg-gray-50">
      <POSAriaInsight page="pos/products" />
      <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Products</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">
            {products.length} total · {products.filter(p => p.is_active).length} active
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVImport} />
          <button onClick={() => fileRef.current?.click()}
            className="px-3 py-2 rounded-lg text-xs font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
            Import CSV
          </button>
          <button onClick={exportCSV}
            className="px-3 py-2 rounded-lg text-xs font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
            Export CSV
          </button>
          <button onClick={openAdd}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
            + Add Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, SKU, barcode…"
          className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] w-64" />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2 text-xs text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {(['all', 'active', 'inactive'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filterStatus === s ? 'bg-[#2563eb] text-white' : 'bg-white border border-[rgba(0,0,0,.1)] text-[rgba(26,26,22,.6)] hover:bg-[rgba(0,0,0,.04)]'}`}>
            {s}
          </button>
        ))}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-[rgba(26,26,22,.5)]">{selected.size} selected</span>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)}
              className="bg-white border border-[rgba(0,0,0,.1)] rounded-lg px-2 py-1.5 text-xs text-[#1a1a16] focus:outline-none">
              <option value="">Bulk action…</option>
              <option value="activate">Set Active</option>
              <option value="deactivate">Set Inactive</option>
              <option value="delete">Delete</option>
            </select>
            <button onClick={applyBulk} disabled={!bulkAction}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1a1a16] text-white disabled:opacity-40 hover:opacity-90 transition-opacity">
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(0,0,0,.06)]" style={{ background: '#fafaf8' }}>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allSelected} onChange={toggleAll}
                  className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
              </th>
              {['Product', 'SKU', 'Category', 'Price', 'Cost', 'Stock', 'Status', ''].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(26,26,22,.4)] uppercase tracking-wider px-3 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-[rgba(0,0,0,.04)]">
                  {[...Array(8)].map((_, j) => (
                    <td key={j} className="px-3 py-3"><div className="h-3 rounded bg-[rgba(0,0,0,.06)] animate-pulse w-20" /></td>
                  ))}
                </tr>
              ))
            ) : !filtered.length ? (
              <tr>
                <td colSpan={9} className="text-center py-16">
                  <p className="text-sm text-[rgba(26,26,22,.35)]">
                    {!products.length ? 'No products yet — add your first product above' : 'No products match your filters'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(p => {
                const lowStock = p.track_stock && p.stock_quantity != null && p.low_stock_threshold != null && p.stock_quantity <= p.low_stock_threshold;
                return (
                  <tr key={p.id} className={`border-b border-[rgba(0,0,0,.04)] last:border-0 hover:bg-[rgba(37,99,235,.02)] transition-colors ${selected.has(p.id) ? 'bg-[rgba(37,99,235,.04)]' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)}
                        onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })}
                        className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {p.image_url
                          ? <img src={p.image_url} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                          : <div className="w-8 h-8 rounded-lg bg-[rgba(37,99,235,.1)] flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-[#2563eb]">{p.name[0].toUpperCase()}</div>}
                        <div>
                          <p className="text-[13px] font-medium text-[#1a1a16] leading-tight">{p.name}</p>
                          {p.barcode && <p className="text-[10px] text-[rgba(26,26,22,.35)] font-mono">{p.barcode}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] text-[rgba(26,26,22,.45)] font-mono">{p.sku || '—'}</span>
                    </td>
                    <td className="px-3 py-3">
                      {p.pos_categories
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                            style={{ background: `${p.pos_categories.color}20`, color: p.pos_categories.color, border: `1px solid ${p.pos_categories.color}40` }}>
                            {p.pos_categories.name}
                          </span>
                        : <span className="text-[10px] text-[rgba(26,26,22,.25)]">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-sm font-semibold text-[#1a1a16]">${Number(p.price).toFixed(2)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-[11px] text-[rgba(26,26,22,.45)]">
                        {p.cost_price != null ? `$${Number(p.cost_price).toFixed(2)}` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {!p.track_stock
                        ? <span className="text-[10px] text-[rgba(26,26,22,.35)]">∞</span>
                        : <span className={`text-xs font-medium ${lowStock ? 'text-amber-600' : 'text-[rgba(26,26,22,.7)]'}`}>
                            {p.stock_quantity ?? 0}
                            {lowStock && <span className="ml-1 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Low</span>}
                          </span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${p.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-[rgba(0,0,0,.05)] text-[rgba(26,26,22,.4)] border border-[rgba(0,0,0,.08)]'}`}>
                        {p.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => openEdit(p)}
                        className="text-[10px] text-[rgba(26,26,22,.4)] hover:text-[#2563eb] transition-colors font-medium">
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.45)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-[rgba(0,0,0,.08)] flex items-center justify-between">
              <h2 className="text-base font-semibold text-[#1a1a16]">
                {modal.mode === 'add' ? 'Add Product' : 'Edit Product'}
              </h2>
              <button onClick={() => setModal({ open: false, mode: 'add' })}
                className="text-[rgba(26,26,22,.4)] hover:text-[#1a1a16] transition-colors text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Product Name *</label>
                <input {...fld('name')} placeholder="e.g. Coffee Blend 250g"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
              </div>
              {/* SKU + Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">SKU</label>
                  <input {...fld('sku')} placeholder="SKU-001"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Barcode</label>
                  <input {...fld('barcode')} placeholder="9312345678901"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
                </div>
              </div>
              {/* Price + Cost + Tax */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Price (incl. tax) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(26,26,22,.4)]">$</span>
                    <input {...fld('price')} type="number" step="0.01" min="0" placeholder="0.00"
                      className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg pl-6 pr-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Cost Price</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[rgba(26,26,22,.4)]">$</span>
                    <input {...fld('cost_price')} type="number" step="0.01" min="0" placeholder="0.00"
                      className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg pl-6 pr-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Tax Rate %</label>
                  <input {...fld('tax_rate')} type="number" step="0.5" min="0" max="100"
                    className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                </div>
              </div>
              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]">
                  <option value="">No category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {/* Stock */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" id="track_stock" checked={form.track_stock}
                    onChange={e => setForm(f => ({ ...f, track_stock: e.target.checked }))}
                    className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
                  <label htmlFor="track_stock" className="text-xs font-medium text-[rgba(26,26,22,.7)]">Track stock quantity</label>
                </div>
                {form.track_stock && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Stock Quantity</label>
                      <input {...fld('stock_quantity')} type="number" min="0" placeholder="0"
                        className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Low Stock Alert</label>
                      <input {...fld('low_stock_threshold')} type="number" min="0" placeholder="5"
                        className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] focus:outline-none focus:border-[#2563eb]" />
                    </div>
                  </div>
                )}
              </div>
              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2} placeholder="Optional product description…"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb] resize-none" />
              </div>
              {/* Image URL */}
              <div>
                <label className="block text-xs font-medium text-[rgba(26,26,22,.6)] mb-1.5">Image URL</label>
                <input {...fld('image_url')} placeholder="https://…"
                  className="w-full bg-[#fafaf8] border border-[rgba(0,0,0,.1)] rounded-lg px-3 py-2.5 text-sm text-[#1a1a16] placeholder-[rgba(26,26,22,.3)] focus:outline-none focus:border-[#2563eb]" />
              </div>
              {/* Toggles */}
              <div className="flex items-center gap-6">
                {[['is_active', 'Active'], ['show_online', 'Show Online']] .map(([k, label]) => (
                  <label key={k} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form[k as 'is_active' | 'show_online']}
                      onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
                      className="rounded border-[rgba(0,0,0,.2)] accent-[#2563eb]" />
                    <span className="text-xs font-medium text-[rgba(26,26,22,.7)]">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgba(0,0,0,.08)] flex items-center justify-between gap-3">
              <div>
                {modal.mode === 'edit' && (
                  <button onClick={() => modal.product && deleteProduct(modal.product.id)}
                    disabled={deleting === modal.product?.id}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors disabled:opacity-50">
                    {deleting === modal.product?.id ? 'Deleting…' : 'Delete product'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModal({ open: false, mode: 'add' })}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-[rgba(26,26,22,.6)] border border-[rgba(0,0,0,.1)] hover:bg-[rgba(0,0,0,.04)] transition-colors">
                  Cancel
                </button>
                <button onClick={saveProduct} disabled={saving || !form.name.trim() || !form.price}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)' }}>
                  {saving ? 'Saving…' : modal.mode === 'add' ? 'Add Product' : 'Save Changes'}
                </button>
              </div>
              {saveError && (
                <p className="text-xs mt-2 text-right" style={{ color: '#ef4444' }}>{saveError}</p>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}