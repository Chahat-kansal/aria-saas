'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product {
  id: string; name: string; sku: string; price: number;
  stock_quantity: number | null; is_active: boolean;
  pos_categories?: { name: string; color: string } | null;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/pos/products')
      .then(r => r.json())
      .then(d => { setProducts(d.products || []); setLoading(false); });
  }, []);

  const filtered = products.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActive = async (id: string, current: boolean) => {
    await fetch(`/api/pos/products?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    setProducts(ps => ps.map(p => p.id === id ? { ...p, is_active: !current } : p));
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Products</h1>
          <p className="text-xs text-[rgba(255,255,255,.4)] mt-0.5">{products.length} total · {products.filter(p => p.is_active).length} active</p>
        </div>
        <Link href="/pos/products/new"
          className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#F97316,#ea6c0e)' }}>
          + Add product
        </Link>
      </div>

      <div className="mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name or SKU…"
          className="w-full max-w-xs bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-[rgba(255,255,255,.25)] focus:outline-none focus:border-[#F97316]" />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,.07)' }}>
        <table className="w-full">
          <thead>
            <tr style={{ background: '#111118', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              {['Product', 'SKU', 'Category', 'Price', 'Stock', 'Status', ''].map(h => (
                <th key={h} className="text-left text-[10px] text-[rgba(255,255,255,.35)] uppercase tracking-widest px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-12 text-xs text-[rgba(255,255,255,.25)]">Loading…</td></tr>
            ) : !filtered.length ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <p className="text-xs text-[rgba(255,255,255,.25)] mb-3">
                    {!products.length ? 'No products yet' : 'No products match your search'}
                  </p>
                  {!products.length && (
                    <Link href="/pos/products/new" className="text-xs text-[#F97316] hover:underline">Add your first product</Link>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[.02] transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium text-[rgba(255,255,255,.85)]">{p.name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[10px] text-[rgba(255,255,255,.35)] font-mono">{p.sku || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.pos_categories ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{ background: `${p.pos_categories.color}22`, color: p.pos_categories.color, border: `1px solid ${p.pos_categories.color}44` }}>
                        {p.pos_categories.name}
                      </span>
                    ) : <span className="text-[10px] text-[rgba(255,255,255,.25)]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-medium text-[#F97316]">${Number(p.price).toFixed(2)}</span>
                  </td>
                  <td className="px-4 py-3">
                    {p.stock_quantity === null
                      ? <span className="text-[10px] text-[rgba(255,255,255,.25)]">Unlimited</span>
                      : <span className={`text-xs ${p.stock_quantity <= 5 ? 'text-red-400' : 'text-[rgba(255,255,255,.6)]'}`}>{p.stock_quantity}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(p.id, p.is_active)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${p.is_active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-[rgba(255,255,255,.3)] border-white/10'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/pos/products/${p.id}`} className="text-[10px] text-[rgba(255,255,255,.3)] hover:text-[#F97316] transition-colors">Edit</Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}