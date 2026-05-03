'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface Product {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  frozen?: boolean;
}

interface CountRecord {
  product_id: string;
  system_qty: number;
  counted_qty: number;
}

export default function FullStocktakePage() {
  const { business } = useBusinessContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<1 | 2>(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const fetchProducts = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/full-stocktake?business_id=${business.id}`);
      const data = await res.json();
      setProducts(data.products ?? []);
      const hasFrozen = (data.products ?? []).some((p: Product) => p.frozen);
      if (hasFrozen) setPhase(2);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const frozenProducts = products.filter(p => p.frozen);
  const unfrozenProducts = products.filter(p => !p.frozen);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === unfrozenProducts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(unfrozenProducts.map(p => p.id)));
    }
  }

  async function handleFreeze() {
    if (!business?.id || selected.size === 0) return;
    setSubmitting(true);
    try {
      await fetch('/api/warehouse/full-stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          action: 'freeze',
          product_ids: Array.from(selected),
        }),
      });
      setSelected(new Set());
      setPhase(2);
      fetchProducts();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!business?.id) return;
    setSubmitting(true);
    try {
      const countsArray: CountRecord[] = frozenProducts.map(p => ({
        product_id: p.id,
        system_qty: p.stock_quantity,
        counted_qty: counts[p.id] !== undefined && counts[p.id] !== ''
          ? parseInt(counts[p.id])
          : p.stock_quantity,
      }));
      await fetch('/api/warehouse/full-stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.id,
          action: 'confirm',
          counts: countsArray,
        }),
      });
      setCounts({});
      setPhase(1);
      fetchProducts();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnfreeze() {
    if (!business?.id) return;
    setSubmitting(true);
    try {
      await fetch('/api/warehouse/full-stocktake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, action: 'unfreeze' }),
      });
      setCounts({});
      setPhase(1);
      fetchProducts();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="h-16 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
        <div className="h-64 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white mb-1">Full Stocktake</h1>
        <p style={{ color: '#6b7280' }}>Freeze products, count physical stock, and confirm variances</p>
      </div>

      {/* Warning banner */}
      <div className="rounded-xl p-4 mb-6 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
        <p className="text-sm" style={{ color: '#fbbf24' }}>
          During stocktake, frozen items cannot be sold until confirmed.
          {frozenProducts.length > 0 && (
            <span className="ml-1 font-semibold">Frozen: {frozenProducts.length} product{frozenProducts.length !== 1 ? 's' : ''}.</span>
          )}
        </p>
      </div>

      {/* PHASE 1 — Select & Freeze */}
      {phase === 1 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-white font-medium">
              Phase 1 — Select products to freeze for counting
            </p>
            <button
              onClick={handleFreeze}
              disabled={submitting || selected.size === 0}
              className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
              style={{ background: '#1D9E75' }}
            >
              {submitting ? 'Freezing…' : `Freeze selected (${selected.size})`}
            </button>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === unfrozenProducts.length && unfrozenProducts.length > 0}
                      onChange={toggleAll}
                      className="accent-[#1D9E75]"
                    />
                  </th>
                  {['Product', 'SKU', 'System Qty'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: '#0d0d14' }}>
                {unfrozenProducts.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No products found.</td></tr>
                ) : unfrozenProducts.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: selected.has(p.id) ? 'rgba(29,158,117,0.05)' : undefined }}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        onClick={e => e.stopPropagation()}
                        className="accent-[#1D9E75]"
                      />
                    </td>
                    <td className="px-4 py-3 text-white">{p.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#9ca3af' }}>{p.sku ?? '—'}</td>
                    <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{p.stock_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* PHASE 2 — Count frozen products */}
      {phase === 2 && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-white font-medium">
              Phase 2 — Enter counted quantities for {frozenProducts.length} frozen product{frozenProducts.length !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleUnfreeze}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-40"
                style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}
              >
                Unfreeze all
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-40"
                style={{ background: '#1D9E75' }}
              >
                {submitting ? 'Confirming…' : 'Confirm stocktake'}
              </button>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                  {['Product', 'SKU', 'System Qty', 'Counted Qty', 'Variance'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody style={{ background: '#0d0d14' }}>
                {frozenProducts.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No frozen products.</td></tr>
                ) : frozenProducts.map(p => {
                  const rawVal = counts[p.id] ?? '';
                  const countedNum = rawVal !== '' ? parseInt(rawVal) : null;
                  const variance = countedNum !== null ? countedNum - p.stock_quantity : null;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="px-4 py-3 text-white">{p.name}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#9ca3af' }}>{p.sku ?? '—'}</td>
                      <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{p.stock_quantity}</td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          value={rawVal}
                          onChange={e => setCounts(prev => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder={String(p.stock_quantity)}
                          className="w-24 px-3 py-1.5 rounded-xl text-sm text-white outline-none text-center"
                          style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)' }}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">
                        {variance === null ? (
                          <span style={{ color: '#4b5563' }}>—</span>
                        ) : variance === 0 ? (
                          <span style={{ color: '#1D9E75' }}>✓ 0</span>
                        ) : (
                          <span style={{ color: variance > 0 ? '#1D9E75' : '#ef4444' }}>
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
