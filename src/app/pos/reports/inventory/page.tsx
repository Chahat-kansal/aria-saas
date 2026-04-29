'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Product { id: string; name: string; sku: string | null; stock_quantity: number | null; low_stock_threshold: number | null; cost_price: number | null; track_stock: boolean; pos_categories?: { name: string } | null; }

export default function InventoryReportsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { setProducts(d.products ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const tracked = products.filter(p => p.track_stock);
  const stockValue = tracked.reduce((s, p) => s + (p.stock_quantity ?? 0) * (p.cost_price ?? 0), 0);
  const lowStock = tracked.filter(p => (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 0) && (p.stock_quantity ?? 0) > 0);
  const outOfStock = tracked.filter(p => (p.stock_quantity ?? 0) <= 0);

  function exportCSV() {
    const rows = [['Name', 'SKU', 'Category', 'Stock', 'Reorder Point', 'Unit Cost', 'Stock Value'].join(',')];
    for (const p of tracked) {
      const val = ((p.stock_quantity ?? 0) * (p.cost_price ?? 0)).toFixed(2);
      rows.push([p.name, p.sku ?? '', (p.pos_categories as any)?.name ?? '', p.stock_quantity ?? 0, p.low_stock_threshold ?? 0, `A$${(p.cost_price ?? 0).toFixed(2)}`, `A$${val}`].join(','));
    }
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `inventory-${new Date().toISOString().split('T')[0]}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Inventory Reports</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Stock levels, valuation, and reorder alerts</p>
        </div>
        <button onClick={exportCSV} className="px-4 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.12)] text-[rgba(26,26,22,.6)] hover:border-[rgba(0,0,0,.2)]">Export CSV</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Tracked SKUs', value: tracked.length },
          { label: 'Stock value', value: `A$${stockValue.toFixed(2)}` },
          { label: 'Low stock', value: lowStock.length, warn: lowStock.length > 0 },
          { label: 'Out of stock', value: outOfStock.length, warn: outOfStock.length > 0 },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-[rgba(0,0,0,.06)] p-4 shadow-sm">
            <p className="text-xs text-[rgba(26,26,22,.4)] mb-1">{s.label}</p>
            <p className="text-2xl font-semibold" style={{ color: (s as any).warn ? '#dc2626' : '#1a1a16' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="mb-5 bg-amber-50 rounded-2xl border border-amber-100 p-4">
          <p className="text-sm font-semibold text-amber-700 mb-2">{lowStock.length} items need reordering</p>
          <div className="space-y-1">
            {lowStock.map(p => (
              <div key={p.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-amber-100">
                <p className="text-sm text-[#1a1a16]">{p.name}</p>
                <span className="text-xs text-amber-700">{p.stock_quantity} left (reorder at {p.low_stock_threshold})</span>
              </div>
            ))}
          </div>
          <Link href="/pos/orders" className="text-xs text-amber-700 underline mt-2 inline-block">Create purchase order →</Link>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[rgba(0,0,0,.06)]">{['Product', 'SKU', 'Stock', 'Reorder', 'Unit Cost', 'Value', 'Status'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[rgba(26,26,22,.4)]">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</td></tr>
            : tracked.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[rgba(26,26,22,.35)]">No tracked products. Enable stock tracking on products to see inventory here.</td></tr>
            : tracked.map(p => {
              const qty = p.stock_quantity ?? 0;
              const isOut = qty <= 0;
              const isLow = !isOut && qty <= (p.low_stock_threshold ?? 0);
              return (
                <tr key={p.id} className="border-b border-[rgba(0,0,0,.04)] hover:bg-[rgba(0,0,0,.01)]">
                  <td className="px-4 py-3 font-medium text-[#1a1a16]">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-[rgba(26,26,22,.4)]">{p.sku ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold" style={{ color: isOut ? '#dc2626' : isLow ? '#d97706' : '#1a1a16' }}>{qty}</td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.4)]">{p.low_stock_threshold ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.5)]">{p.cost_price ? `A$${p.cost_price.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-[rgba(26,26,22,.5)]">A${(qty * (p.cost_price ?? 0)).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${isOut ? 'bg-red-100 text-red-700' : isLow ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                      {isOut ? 'Out of stock' : isLow ? 'Low stock' : 'OK'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
