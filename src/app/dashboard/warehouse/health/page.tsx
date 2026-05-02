'use client';
import { useState, useEffect, useCallback } from 'react';
import { useBusinessContext } from '@/components/providers/BusinessProvider';

interface HealthMetric {
  label: string;
  score: number;
  max: number;
  status: 'good' | 'warn' | 'critical';
  detail: string;
}

interface HealthResult {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  metrics: HealthMetric[];
  narrative: string | null;
  generated_at: string;
}

const GRADE_COLOR = { A: '#1D9E75', B: '#22c55e', C: '#f59e0b', D: '#ef4444' };
const STATUS_COLOR = { good: '#1D9E75', warn: '#fbbf24', critical: '#ef4444' };

export default function WarehouseHealthPage() {
  const { business } = useBusinessContext();
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runHealthCheck = useCallback(async () => {
    if (!business?.id) return;
    setLoading(true);
    setError(null);
    try {
      // Build health from local data
      const [productsRes, expRes, orderRes, grnsRes] = await Promise.all([
        fetch(`/api/warehouse/stock?business_id=${business.id}&limit=500`).then(r => r.json()).catch(() => ({ items: [] })),
        fetch(`/api/warehouse/expiry?business_id=${business.id}`).then(r => r.json()).catch(() => ({ lots: [] })),
        fetch(`/api/warehouse/purchase-orders?business_id=${business.id}&status=draft`).then(r => r.json()).catch(() => ({ orders: [] })),
        fetch(`/api/warehouse/grns?business_id=${business.id}&days=30`).then(r => r.json()).catch(() => ({ grns: [] })),
      ]);

      const items = productsRes.items ?? [];
      const lots = expRes.lots ?? [];
      const orders = orderRes.orders ?? [];
      const grns = grnsRes.grns ?? [];

      const now = new Date();
      const in7d = new Date(now.getTime() + 7 * 86400000);
      const in30d = new Date(now.getTime() + 30 * 86400000);

      const totalItems = items.length || 1;
      const outOfStock = items.filter((i: any) => (i.stock_quantity ?? 0) <= 0 && i.track_stock).length;
      const outOfStockPct = outOfStock / totalItems;

      const criticalExpiry = lots.filter((l: any) => l.expiry_date && new Date(l.expiry_date) <= in7d && new Date(l.expiry_date) > now).length;
      const upcomingExpiry = lots.filter((l: any) => l.expiry_date && new Date(l.expiry_date) <= in30d && new Date(l.expiry_date) > now).length;

      const pendingOrders = orders.length;
      const recentGRNs = grns.length;

      // 6 metrics, 0-20 points each = 120 total, normalised to 100
      const rawMetrics: HealthMetric[] = [
        {
          label: 'Stock availability',
          score: Math.max(0, 20 - outOfStock * 3),
          max: 20,
          status: outOfStockPct > 0.1 ? 'critical' : outOfStockPct > 0.05 ? 'warn' : 'good',
          detail: outOfStock > 0 ? `${outOfStock} SKUs out of stock` : 'All tracked items in stock',
        },
        {
          label: 'Expiry management',
          score: Math.max(0, 20 - criticalExpiry * 8 - upcomingExpiry),
          max: 20,
          status: criticalExpiry > 0 ? 'critical' : upcomingExpiry > 3 ? 'warn' : 'good',
          detail: criticalExpiry > 0
            ? `${criticalExpiry} lots expiring within 7 days`
            : upcomingExpiry > 0 ? `${upcomingExpiry} lots expiring within 30 days` : 'No near-term expiry',
        },
        {
          label: 'Reorder coverage',
          score: Math.max(0, 20 - pendingOrders * 4),
          max: 20,
          status: pendingOrders > 3 ? 'critical' : pendingOrders > 1 ? 'warn' : 'good',
          detail: pendingOrders > 0 ? `${pendingOrders} draft purchase orders not sent` : 'All POs actioned',
        },
        {
          label: 'Goods receipting',
          score: Math.min(20, recentGRNs * 5),
          max: 20,
          status: recentGRNs === 0 ? 'warn' : 'good',
          detail: recentGRNs > 0 ? `${recentGRNs} GRNs received in last 30 days` : 'No GRNs recorded this month',
        },
        {
          label: 'Low stock alerts',
          score: (() => {
            const lowCount = items.filter((i: any) => i.track_stock && (i.stock_quantity ?? 0) > 0 && (i.stock_quantity ?? 0) <= (i.low_stock_threshold ?? 0)).length;
            return Math.max(0, 20 - lowCount * 2);
          })(),
          max: 20,
          status: (() => {
            const lowCount = items.filter((i: any) => i.track_stock && (i.stock_quantity ?? 0) > 0 && (i.stock_quantity ?? 0) <= (i.low_stock_threshold ?? 0)).length;
            return lowCount > 5 ? 'critical' : lowCount > 2 ? 'warn' : 'good';
          })(),
          detail: (() => {
            const lowCount = items.filter((i: any) => i.track_stock && (i.stock_quantity ?? 0) > 0 && (i.stock_quantity ?? 0) <= (i.low_stock_threshold ?? 0)).length;
            return lowCount > 0 ? `${lowCount} products below reorder threshold` : 'All items above reorder points';
          })(),
        },
        {
          label: 'Data completeness',
          score: (() => {
            const withCost = items.filter((i: any) => (i.cost_price ?? 0) > 0).length;
            return Math.round((withCost / totalItems) * 20);
          })(),
          max: 20,
          status: (() => {
            const withCost = items.filter((i: any) => (i.cost_price ?? 0) > 0).length;
            const pct = withCost / totalItems;
            return pct < 0.5 ? 'critical' : pct < 0.8 ? 'warn' : 'good';
          })(),
          detail: (() => {
            const withCost = items.filter((i: any) => (i.cost_price ?? 0) > 0).length;
            return `${withCost}/${totalItems} products have cost prices`;
          })(),
        },
      ];

      const rawTotal = rawMetrics.reduce((s, m) => s + m.score, 0);
      const score = Math.round((rawTotal / 120) * 100);
      const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

      const narrative = `Warehouse health score: ${score}/100 (Grade ${grade}). ${
        rawMetrics.filter(m => m.status === 'critical').map(m => m.label).join(', ') || 'No critical issues detected.'
      }${score < 70 ? ' Priority: address expiry and out-of-stock items first.' : ' Operations look healthy.'}`;

      setResult({ score, grade, metrics: rawMetrics, narrative, generated_at: new Date().toISOString() });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [business?.id]);

  useEffect(() => { runHealthCheck(); }, [runHealthCheck]);

  const gradeColor = result ? GRADE_COLOR[result.grade] : '#6b7280';

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ background: '#0d0d14' }}>
      <div className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#13131a' }}>
        <div>
          <h1 className="font-semibold text-white text-lg">Warehouse Health</h1>
          <p className="text-xs mt-0.5" style={{ color: '#6b7280' }}>6-factor health score for your stock operations</p>
        </div>
        <button onClick={runHealthCheck} disabled={loading}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
          style={{ background: 'rgba(29,158,117,0.15)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      <div className="p-6 space-y-5 max-w-4xl mx-auto w-full">
        {loading && !result ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 border-[#1D9E75] border-t-transparent animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12" style={{ color: '#ef4444' }}>
            <p>{error}</p>
          </div>
        ) : result ? (
          <>
            {/* Score card */}
            <div className="rounded-2xl p-6 border flex items-center gap-6"
              style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="flex-shrink-0 w-20 h-20 rounded-full flex items-center justify-center border-4"
                style={{ borderColor: gradeColor, background: `${gradeColor}15` }}>
                <div className="text-center">
                  <p className="text-2xl font-bold leading-none" style={{ color: gradeColor }}>{result.score}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/ 100</p>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-2xl font-bold" style={{ color: gradeColor }}>Grade {result.grade}</span>
                </div>
                <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-2 mb-3">
                  <div className="h-2 rounded-full transition-all"
                    style={{ width: `${result.score}%`, background: gradeColor }} />
                </div>
                {result.narrative && (
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    {result.narrative}
                  </p>
                )}
              </div>
            </div>

            {/* 6 metrics */}
            <div className="space-y-3">
              {result.metrics.map(metric => {
                const pct = (metric.score / metric.max) * 100;
                const color = STATUS_COLOR[metric.status];
                return (
                  <div key={metric.label} className="rounded-xl p-4 border"
                    style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                        <p className="text-sm font-medium text-white">{metric.label}</p>
                      </div>
                      <p className="text-sm font-bold" style={{ color }}>{metric.score}/{metric.max}</p>
                    </div>
                    <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5 mb-2">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{metric.detail}</p>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
