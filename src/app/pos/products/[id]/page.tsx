'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Line, ComposedChart } from 'recharts';

interface Product {
  id: string; name: string; sku: string | null; barcode: string | null;
  price: number; cost_price: number; stock_quantity: number | null;
  track_stock: boolean; is_active: boolean; is_age_restricted?: boolean;
  pos_categories?: { name: string; color: string } | null;
  description?: string | null; image_url?: string | null;
}
interface SaleMonth { period: string; revenue: number; quantity: number; }

const C = { bg:'rgba(17,15,26,0.95)', card:'rgba(26,23,40,0.9)', border:'#2A2540', text:'#EDE8FF', muted:'#8B85A8', dim:'#4A4565', violet:'#8B5CF6' };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [product, setProduct]     = useState<Product | null>(null);
  const [loading, setLoading]     = useState(true);
  const [chartData, setChartData] = useState<SaleMonth[]>([]);
  const [recentSales, setRecentSales] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/products?id=${id}`).then(r => r.json()),
      fetch(`/api/pos/reports/sales?from=${new Date(Date.now()-365*86400000).toISOString().slice(0,10)}&to=${new Date().toISOString().slice(0,10)}`).then(r => r.json()),
    ]).then(([pd, sd]) => {
      const p = (pd.products ?? []).find((x: Product) => x.id === id) ?? null;
      setProduct(p);
      // Build monthly chart from sales
      const monthMap: Record<string, { revenue: number; quantity: number }> = {};
      for (const sale of (sd.sales ?? [])) {
        const month = (sale.created_at as string).slice(0, 7);
        if (!monthMap[month]) monthMap[month] = { revenue: 0, quantity: 0 };
        monthMap[month].revenue += sale.total_amount ?? 0;
      }
      const months = Object.entries(monthMap).sort(([a],[b]) => a.localeCompare(b)).slice(-13).map(([period, v]) => ({ period: period.slice(5), ...v }));
      setChartData(months);
      setRecentSales((sd.sales ?? []).slice(0, 10));
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
    ? ((product.price - product.cost_price) / product.price * 100).toFixed(1)
    : null;

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '20px 28px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/pos/products" style={{ color: C.muted, textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>← Products</Link>
          <span style={{ color: C.border }}>/</span>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{product.name}</h1>
          {product.is_active
            ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700 }}>Active</span>
            : <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(239,68,68,0.15)', color: '#EF4444', fontWeight: 700 }}>Inactive</span>
          }
        </div>
        <Link href={`/pos/products/${id}/edit`}
          style={{ padding: '9px 20px', borderRadius: 10, border: `1px solid ${C.violet}`, background: 'rgba(139,92,246,0.1)', color: C.violet, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          ✏️ Edit Product
        </Link>
      </div>

      <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>

        {/* Left: main content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* KPI strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {[
              { label: 'Price',    value: `A$${product.price.toFixed(2)}`, color: C.text },
              { label: 'Cost',     value: product.cost_price ? `A$${product.cost_price.toFixed(2)}` : '—', color: C.muted },
              { label: 'Margin',   value: margin ? `${margin}%` : '—', color: margin && parseFloat(margin) > 20 ? '#22C55E' : '#F59E0B' },
              { label: 'Stock',    value: product.track_stock ? String(product.stock_quantity ?? 0) : 'Untracked', color: (product.stock_quantity ?? 0) <= 0 && product.track_stock ? '#EF4444' : C.text },
            ].map(s => (
              <div key={s.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 18px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 6 }}>{s.label}</p>
                <p style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Sales chart */}
          {chartData.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '20px 24px' }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 16 }}>Revenue — Last 13 Months</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <XAxis dataKey="period" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: '#1A1728', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text }} />
                  <Bar dataKey="revenue" fill={C.violet} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
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
                      <td style={{ padding: '10px 16px', fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: C.violet }}>{s.sale_number ?? s.id.slice(-8)}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: C.muted, textTransform: 'capitalize' }}>{s.payment_method ?? '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: C.text }}>A${s.total_amount?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: sidebar details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Product info card */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 12 }}>Product Info</p>
            {[
              ['SKU',      product.sku ?? '—'],
              ['Barcode',  product.barcode ?? '—'],
              ['Category', (product.pos_categories as any)?.name ?? '—'],
              ['Tax',      product.is_age_restricted ? 'Age restricted' : 'Standard (GST)'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 12, color: C.dim }}>{l}</span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500, textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
              </div>
            ))}
          </div>

          {/* Description */}
          {product.description && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 8 }}>Description</p>
              <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{product.description}</p>
            </div>
          )}

          {/* Quick actions */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, marginBottom: 12 }}>Quick Actions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Link href={`/pos/products/${id}/edit`}
                style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                ✏️ Edit Product
              </Link>
              <Link href={`/pos/price-tickets/everyday`}
                style={{ padding: '9px 14px', borderRadius: 9, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.text, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' }}>
                🖨️ Print Price Ticket
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
