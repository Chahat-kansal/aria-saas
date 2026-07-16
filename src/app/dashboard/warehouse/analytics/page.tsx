'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';
import Link from 'next/link';

interface StockStats {
  total_value_cents: number;
  total_skus: number;
  out_of_stock: number;
  low_stock: number;
  expiring_30d: number;
  expiry_value_cents: number;
  dead_stock_count: number;
  dead_stock_value_cents: number;
}

interface TrendDay {
  date: string;
  inbound_value: number;
  outbound_value: number;
}

export default function WarehouseAnalyticsPage() {
  const { business } = useBusinessContext();
  const [stats, setStats] = useState<StockStats | null>(null);
  const [trend, setTrend] = useState<TrendDay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    try {
      const [productsRes, expRes, movementsRes] = await Promise.all([
        fetch(`/api/warehouse/stock?business_id=${business.id}&limit=500`).then(r => r.json()).catch(() => ({ items: [] })),
        fetch(`/api/warehouse/expiry?business_id=${business.id}`).then(r => r.json()).catch(() => ({ lots: [] })),
        fetch(`/api/warehouse/movements?business_id=${business.id}&days=30`).then(r => r.json()).catch(() => ({ movements: [] })),
      ]);

      const items = productsRes.items ?? [];
      const lots = expRes.lots ?? [];
      const movements = movementsRes.movements ?? [];

      const now = new Date();
      const in30d = new Date(now.getTime() + 30 * 86400000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 86400000);

      // INTEL-COMPUTE-2 — this page previously read stock_quantity/cost_price/track_stock, none of
      // which /api/warehouse/stock has ever returned (confirmed by reading the route: it returns
      // stock/cost/reorder_point/needs_reorder) — every value computed from the old names silently
      // resolved via `?? 0`, so "Stock value", "Out of stock", and "Dead stock" have shown $0/100%
      // wrong since this page's creation. Renamed to match the route's real response shape;
      // reorder_point/needs_reorder (which the route DOES return) replace the unavailable
      // low_stock_threshold/track_stock check.
      const totalValue = items.reduce((s: number, i: any) => s + (i.stock ?? 0) * (i.cost ?? 0) * 100, 0);
      const outOfStock = items.filter((i: any) => (i.stock ?? 0) <= 0).length;
      const lowStock = items.filter((i: any) => i.needs_reorder && (i.stock ?? 0) > 0).length;

      const expiringLots = lots.filter((l: any) => l.expiry_date && new Date(l.expiry_date) <= in30d && new Date(l.expiry_date) > now);
      const expiryValue = expiringLots.reduce((s: number, l: any) => s + (l.quantity_remaining ?? 0) * (l.unit_cost_cents ?? 0), 0);

      // Dead stock: in stock for 60+ days, no movements
      const soldIds = new Set(movements.filter((m: any) => m.movement_type === 'sale').map((m: any) => m.product_id));
      const deadStock = items.filter((i: any) => (i.stock ?? 0) > 0 && !soldIds.has(i.id));
      const deadValue = deadStock.reduce((s: number, i: any) => s + (i.stock ?? 0) * (i.cost ?? 0) * 100, 0);

      setStats({
        total_value_cents: Math.round(totalValue),
        total_skus: items.length,
        out_of_stock: outOfStock,
        low_stock: lowStock,
        expiring_30d: expiringLots.length,
        expiry_value_cents: expiryValue,
        dead_stock_count: deadStock.length,
        dead_stock_value_cents: Math.round(deadValue),
      });

      // Build 14-day inbound/outbound trend from movements
      const byDay: Record<string, { in: number; out: number }> = {};
      for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() - i * 86400000).toISOString().split('T')[0];
        byDay[d] = { in: 0, out: 0 };
      }
      for (const m of movements) {
        const d = new Date((m as any).created_at).toISOString().split('T')[0];
        if (!byDay[d]) continue;
        const val = Math.abs((m as any).quantity ?? 0) * ((m as any).unit_cost_cents ?? 0);
        if ((m as any).movement_type === 'receipt' || (m as any).movement_type === 'grn') {
          byDay[d].in += val;
        } else if ((m as any).movement_type === 'sale' || (m as any).movement_type === 'dispatch') {
          byDay[d].out += val;
        }
      }
      const trendData: TrendDay[] = Object.entries(byDay)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, v]) => ({
          date,
          inbound_value: Math.round(v.in / 100),
          outbound_value: Math.round(v.out / 100),
        }));
      setTrend(trendData);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const maxTrendVal = Math.max(...trend.map(d => Math.max(d.inbound_value, d.outbound_value)), 1);

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg">Warehouse Analytics</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>Stock value, movement trends and exposure</p>
        </div>
        <Link href="/dashboard/warehouse/abc"
          className="text-xs px-3 py-1.5 rounded-lg"
          style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
          ABC Analysis →
        </Link>
      </div>

      <div className="p-6 space-y-5 max-w-5xl mx-auto w-full">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {stats && [
                { label: 'Stock value', value: `A$${(stats.total_value_cents / 100).toLocaleString('en-AU', { maximumFractionDigits: 0 })}`, sub: `${stats.total_skus} SKUs`, color: '#fff' },
                { label: 'Out of stock', value: stats.out_of_stock.toString(), sub: `${stats.low_stock} low stock`, color: stats.out_of_stock > 0 ? '#ef4444' : '#1D9E75' },
                { label: 'Expiring 30d', value: stats.expiring_30d.toString(), sub: `A$${(stats.expiry_value_cents / 100).toFixed(0)} at risk`, color: stats.expiring_30d > 0 ? '#fbbf24' : '#1D9E75' },
                { label: 'Dead stock', value: stats.dead_stock_count.toString(), sub: `A$${(stats.dead_stock_value_cents / 100).toFixed(0)} locked`, color: stats.dead_stock_count > 5 ? '#f97316' : 'rgba(255,255,255,0.7)' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-xl p-4 border"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>{kpi.label}</p>
                  <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{kpi.sub}</p>
                </div>
              ))}
            </div>

            {/* Inbound/outbound trend */}
            {trend.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-white">14-day stock flow</p>
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#1D9E75]" />Inbound</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-[#ef4444]" />Outbound</span>
                  </div>
                </div>
                <div className="flex items-end gap-1 h-28">
                  {trend.map((d, i) => (
                    <div key={d.date} className="flex-1 flex items-end gap-px">
                      <div className="flex-1 rounded-t-sm"
                        style={{ height: `${Math.max((d.inbound_value / maxTrendVal) * 100, 2)}%`, background: '#1D9E75', opacity: 0.8 }} />
                      <div className="flex-1 rounded-t-sm"
                        style={{ height: `${Math.max((d.outbound_value / maxTrendVal) * 100, 2)}%`, background: '#ef4444', opacity: 0.8 }} />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between mt-1 text-[9px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  <span>{trend[0]?.date?.slice(5)}</span>
                  <span>{trend[trend.length - 1]?.date?.slice(5)}</span>
                </div>
              </div>
            )}

            {/* Quick nav */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Stock overview', href: '/dashboard/warehouse/stock', desc: 'Browse all stock levels' },
                { label: 'Lots & expiry', href: '/dashboard/warehouse/lots', desc: 'Track batch expiry dates' },
                { label: 'Cycle count', href: '/dashboard/warehouse/cycle-count', desc: 'Verify physical counts' },
                { label: 'Purchase orders', href: '/dashboard/warehouse/purchase-orders', desc: 'Manage supplier POs' },
                { label: 'ABC analysis', href: '/dashboard/warehouse/abc', desc: 'Classify by revenue impact' },
                { label: 'Smart reorder', href: '/dashboard/reorder', desc: 'AI-powered reorder forecast' },
              ].map(link => (
                <Link key={link.href} href={link.href}
                  className="p-4 rounded-xl border transition-colors"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  <p className="text-sm font-medium text-white mb-0.5">{link.label}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{link.desc}</p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
