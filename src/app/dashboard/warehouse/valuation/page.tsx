'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface StockItem {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  stock_quantity: number;
  cost_price: number | null;
  price: number | null;
}

interface CategoryRow {
  category: string;
  skuCount: number;
  costValue: number;
  sellValue: number;
}

function fmt(cents: number): string {
  return `A$${(cents / 100).toFixed(2)}`;
}

function calcMargin(cost: number, sell: number): string {
  if (sell === 0) return '—';
  return `${Math.round(((sell - cost) / sell) * 100)}%`;
}

function buildCategoryRows(items: StockItem[]): CategoryRow[] {
  const map = new Map<string, CategoryRow>();
  for (const item of items) {
    const cat = item.category ?? 'Uncategorised';
    const costVal = (item.cost_price ?? 0) * (item.stock_quantity ?? 0) * 100;
    const sellVal = (item.price ?? 0) * (item.stock_quantity ?? 0) * 100;
    if (!map.has(cat)) {
      map.set(cat, { category: cat, skuCount: 0, costValue: 0, sellValue: 0 });
    }
    const row = map.get(cat)!;
    row.skuCount += 1;
    row.costValue += costVal;
    row.sellValue += sellVal;
  }
  return Array.from(map.values()).sort((a, b) => b.costValue - a.costValue);
}

function downloadCsv(items: StockItem[], rows: CategoryRow[], valuedAt: string) {
  const lines: string[] = [];
  lines.push('Category Breakdown');
  lines.push('Category,SKUs,Stock Value (Cost),Stock Value (Sell),Margin %');
  for (const r of rows) {
    lines.push(`"${r.category}",${r.skuCount},${(r.costValue / 100).toFixed(2)},${(r.sellValue / 100).toFixed(2)},${calcMargin(r.costValue, r.sellValue)}`);
  }
  lines.push('');
  lines.push('Item Detail');
  lines.push('SKU,Name,Category,Stock Qty,Cost Price,Sell Price,Stock Value (Cost),Stock Value (Sell)');
  for (const item of items) {
    const costVal = (item.cost_price ?? 0) * (item.stock_quantity ?? 0);
    const sellVal = (item.price ?? 0) * (item.stock_quantity ?? 0);
    lines.push(
      `"${item.sku ?? ''}","${item.name}","${item.category ?? 'Uncategorised'}",${item.stock_quantity},${(item.cost_price ?? 0).toFixed(2)},${(item.price ?? 0).toFixed(2)},${costVal.toFixed(2)},${sellVal.toFixed(2)}`
    );
  }
  lines.push('');
  lines.push(`Valued as of ${valuedAt}`);

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-valuation-${valuedAt}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ValuationPage() {
  const { business } = useBusinessContext();
  const [items, setItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [stockRes] = await Promise.all([
        fetch(`/api/warehouse/stock?business_id=${business.id}`).then(r => r.json()),
      ]);
      setItems(stockRes.products ?? stockRes.items ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalCostCents = items.reduce((s, i) => s + (i.cost_price ?? 0) * (i.stock_quantity ?? 0) * 100, 0);
  const totalSellCents = items.reduce((s, i) => s + (i.price ?? 0) * (i.stock_quantity ?? 0) * 100, 0);
  const overallMargin = totalSellCents > 0
    ? `${Math.round(((totalSellCents - totalCostCents) / totalSellCents) * 100)}%`
    : '—';

  const categoryRows = buildCategoryRows(items);
  const valuedAt = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-xl" style={{ background: 'rgba(255,255,255,0.06)' }} />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />)}
        </div>
        <div className="h-64 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-white mb-1">Stock Valuation</h1>
          <p style={{ color: '#6b7280' }}>Valued as of {valuedAt}</p>
        </div>
        <button
          onClick={() => downloadCsv(items, categoryRows, valuedAt)}
          className="shrink-0 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
        >
          Export CSV
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total value at cost</p>
          <p className="text-2xl font-semibold font-mono text-white">{fmt(totalCostCents)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{items.length} SKUs</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Total value at sell price</p>
          <p className="text-2xl font-semibold font-mono text-white">{fmt(totalSellCents)}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>{categoryRows.length} categor{categoryRows.length === 1 ? 'y' : 'ies'}</p>
        </div>
        <div className="rounded-xl p-5" style={{ background: '#13131a', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-xs mb-1" style={{ color: '#6b7280' }}>Unrealised margin</p>
          <p className="text-2xl font-semibold font-mono" style={{ color: '#1D9E75' }}>{overallMargin}</p>
          <p className="text-xs mt-1" style={{ color: '#6b7280' }}>
            {fmt(totalSellCents - totalCostCents)} potential GP
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      <h2 className="text-sm font-semibold text-white mb-3">Category Breakdown</h2>
      <div className="rounded-xl overflow-hidden mb-8" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#13131a', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {['Category', 'SKUs', 'Stock Value (Cost)', 'Stock Value (Sell)', 'Margin %'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium" style={{ color: '#6b7280' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody style={{ background: '#0d0d14' }}>
            {categoryRows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: '#4b5563' }}>No stock data available.</td></tr>
            ) : categoryRows.map(row => (
              <tr key={row.category} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 text-white">{row.category}</td>
                <td className="px-4 py-3" style={{ color: '#9ca3af' }}>{row.skuCount}</td>
                <td className="px-4 py-3 font-mono text-white">{fmt(row.costValue)}</td>
                <td className="px-4 py-3 font-mono text-white">{fmt(row.sellValue)}</td>
                <td className="px-4 py-3 font-mono font-medium" style={{ color: '#1D9E75' }}>
                  {calcMargin(row.costValue, row.sellValue)}
                </td>
              </tr>
            ))}
            {categoryRows.length > 0 && (
              <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <td className="px-4 py-3 text-white font-semibold">Total</td>
                <td className="px-4 py-3 font-semibold" style={{ color: '#9ca3af' }}>
                  {categoryRows.reduce((s, r) => s + r.skuCount, 0)}
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-white">{fmt(totalCostCents)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-white">{fmt(totalSellCents)}</td>
                <td className="px-4 py-3 font-mono font-semibold" style={{ color: '#1D9E75' }}>{overallMargin}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-center" style={{ color: '#4b5563' }}>
        Valued as of {valuedAt} · Values are indicative and based on current stock quantities and prices
      </p>
    </div>
  );
}
