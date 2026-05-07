'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; cost: number | null; stock_quantity: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean; case_quantity?: number | null;
  pos_categories?: { name: string; color: string } | null;
  description?: string | null; image_url?: string | null;
  brand_id?: string | null; family_id?: string | null;
}

interface MonthRow { period: string; revenue: number; purchases: number; quantity: number; }

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444' };

const NAV = [
  { label: 'Home', icon: '🏠' },
  { label: 'Sales Summary', icon: '📊' },
  { label: 'History', icon: '📋' },
  { label: 'Price Points', icon: '💲' },
  { label: 'Inventory', icon: '📦' },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct]     = useState<Product | null>(null);
  const [loading, setLoading]     = useState(true);
  const [chartData, setChartData] = useState<MonthRow[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [activeNav, setActiveNav] = useState('Home');

  useEffect(() => {
    if (!id) return;
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/pos/products?id=${id}`).then(r => r.json()),
      fetch(`/api/pos/reports/sales?from=${from}&to=${to}`).then(r => r.json()),
    ]).then(([pd, sd]) => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);

      const allSales: any[] = sd.sales ?? [];
      // Filter to sales containing this product by matching sale_items if available
      const monthMap: Record<string, { revenue: number; quantity: number }> = {};
      for (const sale of allSales) {
        const month = (sale.created_at as string).slice(0, 7);
        if (!monthMap[month]) monthMap[month] = { revenue: 0, quantity: 0 };
        monthMap[month].revenue += sale.total_amount ?? 0;
        monthMap[month].quantity += 1;
      }
      const months = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-13)
        .map(([period, v]) => ({ period: period.slice(5), revenue: v.revenue, purchases: v.revenue * 0.6, quantity: v.quantity }));
      setChartData(months);
      setRecentSales(allSales.slice(0, 10));
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

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '18px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/products" style={{ color: C.muted, textDecoration: 'none', fontSize: 13 }}>← Products</Link>
          <span style={{ color: C.border }}>/</span>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{product.name}</h1>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: product.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)', color: product.is_active ? C.green : C.red, fontWeight: 700 }}>
            {product.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <Link href={`/pos/products/${id}/edit`}
          style={{ padding: '8px 18px', borderRadius: 9, border: `1px solid ${C.violet}`, background: 'rgba(139,92,246,0.1)', color: C.violet, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          ✏️ Edit Product
        </Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', minHeight: 'calc(100% - 61px)' }}>

        {/* Main content */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, borderRight: `1px solid ${C.border}` }}>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { label: 'Price',    value: `A$${product.price.toFixed(2)}`, color: C.text },
              { label: 'Cost',     value: product.cost_price ? `A$${product.cost_price.toFixed(2)}` : '—', color: C.muted },
              { label: 'Margin',   value: margin != null ? `${margin.toFixed(1)}%` : '—', color: margin != null && margin > 20 ? C.green : '#F59E0B' },
              { label: 'Stock',    value: product.track_stock ? String(product.stock_quantity ?? 0) : 'Untracked', color: (product.stock_quantity ?? 0) <= 0 && product.track_stock ? C.red : C.text },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</p>
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
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Recent Transactions</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                    {['Date','Sale #','Payment','Amount'].map(h => (
                      <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '8px 16px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((s, i) => (
                    <tr key={s.id} style={{ borderBottom: i < recentSales.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted }}>{new Date(s.created_at).toLocaleDateString('en-AU')}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: C.violet }}>
                        <Link href={`/pos/history`} style={{ color: C.violet, textDecoration: 'none' }}>{s.sale_number ?? s.id.slice(-8)}</Link>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{s.payment_method ?? '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: C.text }}>A${(s.total_amount ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Nav */}
          <div style={{ borderBottom: `1px solid ${C.border}` }}>
            {NAV.map(n => (
              <button key={n.label} onClick={() => setActiveNav(n.label)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 20px', background: activeNav === n.label ? 'rgba(139,92,246,0.1)' : 'transparent', borderLeft: `2px solid ${activeNav === n.label ? C.violet : 'transparent'}`, border: 'none', color: activeNav === n.label ? C.violet : C.muted, fontSize: 13, fontWeight: activeNav === n.label ? 600 : 400, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 120ms' }}>
                <span>{n.icon}</span>{n.label}
              </button>
            ))}
          </div>

          {/* Product info */}
          <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim }}>Product Info</p>
            {[
              ['SKU',      product.sku ?? '—'],
              ['Barcode',  product.barcode ?? '—'],
              ['Category', (product.pos_categories as any)?.name ?? '—'],
              ['Tax',      product.is_age_restricted ? 'Age restricted' : 'Standard (GST)'],
              ['Cases',    product.case_quantity ? `${product.case_quantity} per case` : '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 12, color: C.dim }}>{l}</span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500, textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}

            {product.description && (
              <div style={{ marginTop: 4 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 6 }}>Description</p>
                <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>{product.description}</p>
              </div>
            )}

            {/* Quick actions */}
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 10 }}>Quick Actions</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Link href={`/pos/products/${id}/edit`}
                  style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  ✏️ Edit Product
                </Link>
                <Link href={`/pos/price-tickets/everyday`}
                  style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  🖨️ Print Price Ticket
                </Link>
                <Link href={`/pos/stock`}
                  style={{ padding: '8px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                  📦 Adjust Stock
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
