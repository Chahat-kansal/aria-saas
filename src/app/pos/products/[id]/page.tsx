'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import AriaInsightCard from '@/components/reports/AriaInsightCard';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; cost: number | null; stock_quantity: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean; case_quantity?: number | null;
  pos_categories?: { name: string; color: string } | null;
  description?: string | null; image_url?: string | null;
  brand_id?: string | null; family_id?: string | null;
}

interface MonthRow { period: string; revenue: number; purchases: number; quantity: number; }
interface OutletCost { id: string; outlet_name: string; avg_cost: number; last_cost: number; margin_pct: number; retail: number; }
interface PricePoint { id: string; price_set_name: string; price: number; cost: number; margin_pct: number; effective_from: string; }
interface Revision { id: string; created_at: string; changed_by: string; field_name: string; old_value: string; new_value: string; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B' };
const TABS = ['Overview','Sell & Cost','Outlets','History'];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct]     = useState<Product | null>(null);
  const [loading, setLoading]     = useState(true);
  const [chartData, setChartData] = useState<MonthRow[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('Overview');
  const [outletCosts, setOutletCosts] = useState<OutletCost[]>([]);
  const [pricePoints, setPricePoints] = useState<PricePoint[]>([]);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [insight, setInsight] = useState<string[] | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setInsightLoading(true);
    fetch(`/api/pos/products?id=${id}`).then(r => r.json()).then(pd => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);

      // Load product-specific sale items for accurate chart
      fetch(`/api/pos/reports/sales?product_id=${id}`).then(r => r.json()).then(sd => {
        const items: any[] = sd.items ?? sd.sales ?? [];
        const monthMap: Record<string, { revenue: number; quantity: number }> = {};
        for (const si of items) {
          const month = (si.created_at as string).slice(0, 7);
          if (!monthMap[month]) monthMap[month] = { revenue: 0, quantity: 0 };
          monthMap[month].revenue += si.line_total ?? si.total_amount ?? 0;
          monthMap[month].quantity += si.quantity ?? 1;
        }
        const months = Object.entries(monthMap)
          .sort(([a], [b]) => a.localeCompare(b)).slice(-13)
          .map(([period, v]) => ({ period: period.slice(5), revenue: v.revenue, purchases: v.revenue * (p?.cost_price ?? 0) > 0 ? v.quantity * (p?.cost_price ?? 0) : v.revenue * 0.6, quantity: v.quantity }));
        setChartData(months);
        setRecentSales(items.slice(0, 10));
      }).catch(() => {});

      // Aria product insight
      if (p) {
        fetch('/api/aria/product-insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ product_id: id, business_id: '' }) })
          .then(r => r.json()).then(d => { setInsight(d.bullets ?? d.insights ?? null); setInsightLoading(false); })
          .catch(() => setInsightLoading(false));
      } else { setInsightLoading(false); }

      // Outlet costs and price points (best effort)
      fetch(`/api/pos/outlet-costs?product_id=${id}`).then(r => r.json()).then(d => setOutletCosts(d.costs ?? [])).catch(() => {});
      fetch(`/api/pos/price-points?product_id=${id}`).then(r => r.json()).then(d => setPricePoints(d.price_points ?? [])).catch(() => {});
      fetch(`/api/pos/product-revisions?product_id=${id}`).then(r => r.json()).then(d => setRevisions(d.revisions ?? [])).catch(() => {});

      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', border: `2px solid rgba(139,92,246,0.3)`, borderTopColor: C.violet, animation: 'spin 0.7s linear infinite' }} />
    </div>
  );

  if (!product) return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', background: C.bg, color: C.text, gap: 12 }}>
      <div style={{ fontSize: 48 }}>📦</div>
      <p style={{ fontSize: 16, color: C.muted }}>Product not found</p>
      <Link href="/pos/products" style={{ color: C.violet, fontSize: 13 }}>← Back to products</Link>
    </div>
  );

  const margin = product.cost_price > 0 && product.price > 0
    ? ((product.price - product.cost_price) / product.price * 100)
    : null;

  const totalRevenue = chartData.reduce((s, r) => s + r.revenue, 0);
  const totalQty = chartData.reduce((s, r) => s + r.quantity, 0);
  const avgDaily = totalQty > 0 ? (totalQty / 365) : 0;
  const daysOfCover = avgDaily > 0 && product.stock_quantity ? (product.stock_quantity / avgDaily) : null;

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/pos/products" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Products</Link>
          <span style={{ color: C.dim }}>/</span>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.text, margin: 0 }}>{product.name}</h1>
          {product.sku && <span style={{ fontSize: 11, color: C.dim, fontFamily: "'JetBrains Mono',monospace" }}>SKU:{product.sku}</span>}
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: product.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', color: product.is_active ? C.green : C.red, fontWeight: 700 }}>
            {product.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`/pos/products/${id}/edit`} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.violet}`, background: 'rgba(139,92,246,0.1)', color: C.violet, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>✏️ Edit</Link>
          <Link href={`/pos/shelf-tickets`} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--bg-elevated)', color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>🖨️ Shelf Ticket</Link>
          <Link href={`/pos/reports/sales?product_id=${id}`} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'var(--bg-elevated)', color: C.muted, fontSize: 12, fontWeight: 600, textDecoration: 'none' }}>📊 Sales</Link>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--divider)', background: 'var(--bg-surface)', paddingLeft: 24, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 18px', border: 'none', borderBottom: `2px solid ${activeTab === tab ? C.violet : 'transparent'}`, background: 'transparent', color: activeTab === tab ? C.violet : C.muted, fontSize: 13, fontWeight: activeTab === tab ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {tab}
          </button>
        ))}
      </div>

      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>

        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'Overview' && (<>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
            {[
              { label: 'Revenue (12mo)', value: `A$${totalRevenue.toFixed(0)}`, color: C.violet },
              { label: 'Units Sold',    value: String(totalQty), color: C.text },
              { label: 'Margin',        value: margin != null ? `${margin.toFixed(1)}%` : '—', color: margin != null && margin > 20 ? C.green : C.amber },
              { label: 'Velocity',      value: avgDaily > 0 ? `${avgDaily.toFixed(2)}/day` : '—', color: C.text },
              { label: 'Stock',         value: product.track_stock ? String(product.stock_quantity ?? 0) : 'Untracked', color: (product.stock_quantity ?? 0) <= 0 && product.track_stock ? C.red : C.text },
              { label: 'Days Cover',    value: daysOfCover != null ? `${Math.round(daysOfCover)}d` : '—', color: daysOfCover != null && daysOfCover < 7 ? C.red : daysOfCover != null && daysOfCover < 14 ? C.amber : C.green },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, borderRadius: 12, padding: '13px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 5 }}>{s.label}</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Area Chart */}
          {chartData.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Revenue — Last 13 Months</p>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: C.dim }}>Total Revenue</p>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: C.violet }}>A${totalRevenue.toFixed(0)}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 10, color: C.dim }}>Transactions</p>
                    <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: C.text }}>{totalQty}</p>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.violet} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={C.violet} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C.green} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={C.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                  <Area type="monotone" dataKey="revenue" stroke={C.violet} strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                  <Area type="monotone" dataKey="purchases" stroke={C.green} strokeWidth={2} fill="url(#costGrad)" name="Purchases" />
                </AreaChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 3, borderRadius: 2, background: C.violet }} /><span style={{ fontSize: 10, color: C.muted }}>Revenue</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 3, borderRadius: 2, background: C.green }} /><span style={{ fontSize: 10, color: C.muted }}>Purchases</span></div>
              </div>
            </div>
          )}

          {/* Last 12 Months Table */}
          {chartData.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Monthly Summary</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                    {['Period','Transactions','Sales','Purchases','Margin'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '8px 14px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...chartData].reverse().map((row, i) => {
                    const m = row.revenue > 0 ? ((row.revenue - row.purchases) / row.revenue * 100) : 0;
                    return (
                      <tr key={row.period} style={{ borderBottom: i < chartData.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>{row.period}</td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: C.text }}>{row.quantity}</td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: C.violet, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600 }}>A${row.revenue.toFixed(2)}</td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: C.muted, fontFamily: "'JetBrains Mono',monospace" }}>A${row.purchases.toFixed(2)}</td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: m > 20 ? C.green : '#F59E0B', fontWeight: 600 }}>{m.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent sales */}
          {recentSales.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--divider)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Transactions</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {['Date','Sale #','Payment','Amount'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '7px 14px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentSales.slice(0, 8).map((s, i) => (
                    <tr key={s.id ?? i}>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: C.muted }}>{new Date(s.created_at).toLocaleDateString('en-AU')}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: C.violet }}>{s.sale_number ?? s.id?.slice(-8) ?? '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{s.payment_method ?? '—'}</td>
                      <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: C.text }}>A${(s.line_total ?? s.total_amount ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <AriaInsightCard bullets={insight ?? undefined} loading={insightLoading} />
        </>)}

        {/* ── SELL & COST TAB ── */}
        {activeTab === 'Sell & Cost' && (<>
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--divider)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Outlet Costs</span>
            </div>
            {outletCosts.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>No outlet cost data yet. Run a stocktake to populate.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Outlet','Avg Cost','Last Cost','Margin%','Retail'].map(h => <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, textAlign: 'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>{outletCosts.map((oc, i) => (
                  <tr key={oc.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{oc.outlet_name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${oc.avg_cost.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${oc.last_cost.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: oc.margin_pct > 20 ? C.green : C.amber, fontWeight: 700 }}>{oc.margin_pct.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${oc.retail.toFixed(2)}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>

          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--divider)' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Price Points</span>
            </div>
            {pricePoints.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>No price points configured.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {['Price Set','Price','Cost','Margin%','Effective'].map(h => <th key={h} style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, textAlign: 'left' }}>{h}</th>)}
                </tr></thead>
                <tbody>{pricePoints.map((pp, i) => (
                  <tr key={pp.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13 }}>{pp.price_set_name}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${pp.price.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, fontFamily: "'JetBrains Mono',monospace" }}>A${pp.cost.toFixed(2)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: pp.margin_pct > 20 ? C.green : C.amber, fontWeight: 700 }}>{pp.margin_pct.toFixed(1)}%</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: C.muted }}>{new Date(pp.effective_from).toLocaleDateString('en-AU')}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </>)}

        {/* ── OUTLETS TAB ── */}
        {activeTab === 'Outlets' && (
          <div style={{ background: C.card, borderRadius: 14, padding: 24, textAlign: 'center', color: C.dim }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏪</div>
            <p>Per-outlet stock data requires outlet inventory to be configured.</p>
            <Link href="/pos/settings/outlets" style={{ color: C.violet, fontSize: 13 }}>Configure outlets →</Link>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'History' && (
          <div style={{ background: C.card, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--divider)' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Audit Log</span>
            </div>
            {revisions.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.dim, fontSize: 13 }}>No revision history for this product yet.</div>
            ) : (
              <div style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {revisions.map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', paddingBottom: 12, borderBottom: '1px solid var(--divider)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--violet-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>📝</div>
                    <div>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{r.field_name} changed</div>
                      <div style={{ fontSize: 12, color: C.muted }}>{r.old_value} → <span style={{ color: C.violet }}>{r.new_value}</span></div>
                      <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{r.changed_by} · {new Date(r.created_at).toLocaleDateString('en-AU')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
