'use client';
import { useState, useEffect } from 'react';

interface Product { id: string; name: string; sku: string | null; price: number; barcode: string | null; pos_categories?: { name: string } | null; }

export default function BarcodesPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [labelSize, setLabelSize] = useState<'small' | 'standard' | 'large'>('standard');

  useEffect(() => {
    fetch('/api/pos/products').then(r => r.json()).then(d => { setProducts(d.products ?? []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku ?? '').toLowerCase().includes(search.toLowerCase()));
  const selectedProducts = products.filter(p => selected.has(p.id));

  const labelDims = { small: 'w-32 h-16 text-xs', standard: 'w-48 h-24 text-sm', large: 'w-64 h-32 text-base' };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1a1a16]">Barcode Templates</h1>
          <p className="text-xs text-[rgba(26,26,22,.45)] mt-0.5">Print barcodes and labels for your products</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={labelSize} onChange={e => setLabelSize(e.target.value as 'small' | 'standard' | 'large')} className="px-3 py-2 rounded-xl text-sm border border-[rgba(0,0,0,.1)] outline-none bg-white text-[#1a1a16]">
            <option value="small">Small label</option>
            <option value="standard">Standard label</option>
            <option value="large">Large label</option>
          </select>
          <button onClick={() => window.print()} disabled={selected.size === 0} className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40" style={{ background: 'var(--violet)' }}>
            Print {selected.size > 0 ? `(${selected.size})` : ''} labels
          </button>
        </div>
      </div>

      {/* Print preview — hidden on screen, shown when printing */}
      {selectedProducts.length > 0 && (
        <style>{`@media print { body > * { display: none !important; } #print-labels { display: flex !important; flex-wrap: wrap; gap: 8px; padding: 8px; } }`}</style>
      )}
      <div id="print-labels" className="hidden">
        {selectedProducts.map(p => (
          <div key={p.id} className={`border-2 border-black p-2 flex flex-col justify-between ${labelDims[labelSize]}`}>
            <p className="font-bold truncate">{p.name}</p>
            <p className="font-mono font-bold text-center text-lg tracking-widest">{p.sku ?? p.barcode ?? p.id.slice(0, 8).toUpperCase()}</p>
            <p className="font-bold text-right">A${p.price.toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Product list */}
        <div>
          <div className="mb-3">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…" className="w-full px-4 py-2.5 rounded-xl text-sm border border-[rgba(0,0,0,.1)] outline-none bg-white" />
          </div>
          <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] overflow-hidden shadow-sm max-h-[480px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-sm text-[rgba(26,26,22,.35)]">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-[rgba(26,26,22,.35)]">No products found</div>
            ) : filtered.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-[rgba(0,0,0,.04)] cursor-pointer hover:bg-[rgba(0,0,0,.015)]">
                <input type="checkbox" checked={selected.has(p.id)} onChange={e => setSelected(s => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} className="w-4 h-4 accent-[var(--violet)]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1a1a16] truncate">{p.name}</p>
                  <p className="text-xs text-[rgba(26,26,22,.4)]">{p.sku ?? 'No SKU'} · A${p.price.toFixed(2)}</p>
                </div>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2">
            <button onClick={() => setSelected(new Set(filtered.map(p => p.id)))} className="text-xs text-[var(--violet)]">Select all</button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-[rgba(26,26,22,.4)]">Clear</button>
          </div>
        </div>

        {/* Preview */}
        <div>
          <p className="text-sm font-medium text-[#1a1a16] mb-3">Label preview</p>
          {selected.size === 0 ? (
            <div className="bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-8 text-center shadow-sm">
              <p className="text-sm text-[rgba(26,26,22,.35)]">Select products to preview labels</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 bg-white rounded-2xl border border-[rgba(0,0,0,.08)] p-4 shadow-sm">
              {selectedProducts.slice(0, 6).map(p => (
                <div key={p.id} className={`border-2 border-[#1a1a16] p-2 flex flex-col justify-between ${labelDims[labelSize]}`} style={{ fontFamily: 'monospace' }}>
                  <p className="font-bold truncate text-[#1a1a16]" style={{ fontSize: labelSize === 'small' ? '9px' : labelSize === 'standard' ? '11px' : '13px' }}>{p.name}</p>
                  <p className="font-mono font-bold text-center tracking-widest text-[#1a1a16]" style={{ fontSize: labelSize === 'small' ? '11px' : labelSize === 'standard' ? '14px' : '18px' }}>{p.sku ?? p.id.slice(0, 8).toUpperCase()}</p>
                  <p className="font-bold text-right text-[#1a1a16]" style={{ fontSize: labelSize === 'small' ? '10px' : labelSize === 'standard' ? '12px' : '14px' }}>A${p.price.toFixed(2)}</p>
                </div>
              ))}
              {selected.size > 6 && <p className="text-xs text-[rgba(26,26,22,.35)] w-full text-center">+ {selected.size - 6} more labels</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
