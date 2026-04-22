'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState({
    name: '', sku: '', price: '', category_id: '', stock_quantity: '', description: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [trackStock, setTrackStock] = useState(false);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => setCategories(d.categories || []));
  }, []);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.price) { setError('Name and price are required'); return; }
    setLoading(true); setError('');
    const r = await fetch('/api/pos/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        sku: form.sku || null,
        price: parseFloat(form.price),
        category_id: form.category_id || null,
        stock_quantity: trackStock && form.stock_quantity ? parseInt(form.stock_quantity) : null,
        description: form.description || null,
        is_active: true,
      }),
    });
    const d = await r.json();
    setLoading(false);
    if (d.error) { setError(d.error); return; }
    router.push('/pos/products');
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Add product</h1>
        <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">New item for your POS catalogue</p>
      </div>

      <form onSubmit={submit} className="rounded-2xl p-6 space-y-5" style={{ background: '#111118', border: '1px solid rgba(255,255,255,.07)' }}>
        {error && (
          <div className="rounded-lg px-4 py-3 text-xs text-red-400" style={{ background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.2)' }}>
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Product name *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[rgba(255,255,255,.2)] focus:outline-none focus:border-[#F97316]"
              placeholder="e.g. Flat White" />
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Price ($) *</label>
            <input value={form.price} onChange={e => set('price', e.target.value)} type="number" min="0" step="0.01" required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[rgba(255,255,255,.2)] focus:outline-none focus:border-[#F97316]"
              placeholder="0.00" />
          </div>

          <div>
            <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">SKU / barcode</label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[rgba(255,255,255,.2)] focus:outline-none focus:border-[#F97316]"
              placeholder="Optional" />
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Category</label>
            <select value={form.category_id} onChange={e => set('category_id', e.target.value)}
              className="w-full bg-[#1a1a25] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#F97316]">
              <option value="">No category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[rgba(255,255,255,.2)] focus:outline-none focus:border-[#F97316] resize-none"
              placeholder="Optional product description" />
          </div>

          <div className="col-span-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <div onClick={() => setTrackStock(s => !s)}
                className={`w-8 h-4.5 rounded-full transition-all flex items-center px-0.5 ${trackStock ? 'bg-[#F97316]' : 'bg-white/10'}`}
                style={{ height: '18px', width: '32px' }}>
                <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${trackStock ? 'translate-x-3.5' : 'translate-x-0'}`} style={{ width: '14px', height: '14px', transform: trackStock ? 'translateX(14px)' : 'translateX(0)' }} />
              </div>
              <span className="text-xs text-[rgba(255,255,255,.65)]">Track stock quantity</span>
            </label>
            {trackStock && (
              <div className="mt-3">
                <label className="block text-[10px] text-[rgba(255,255,255,.4)] uppercase tracking-widest mb-2">Opening stock</label>
                <input value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} type="number" min="0"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-[rgba(255,255,255,.2)] focus:outline-none focus:border-[#F97316]"
                  placeholder="0" />
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
            {loading ? 'Saving…' : 'Add product'}
          </button>
          <button type="button" onClick={() => router.push('/pos/products')}
            className="px-6 py-2.5 rounded-lg text-sm text-[rgba(255,255,255,.5)] hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}