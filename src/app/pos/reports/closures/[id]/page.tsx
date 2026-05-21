'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#006AFF', green:'#00B140', red:'#EF4444', amber:'#F59E0B', cyan:'#006AFF' };
type Tab = 'revenue' | 'transactions' | 'customers' | 'avg_sale';

interface ClosureData {
  session: any;
  revenue: number;
  cogs: number;
  profit: number;
  tax: number;
  discounts: number;
  transaction_count: number;
  payment_totals: Record<string, number>;
  by_cashier: { name: string; revenue: number; cogs: number; profit: number; avg_sale: number; transaction_count: number }[];
  hourly: { label: string; revenue: number; transactions: number; customers: number; avg_sale: number }[];
}

export default function ClosureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ClosureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('revenue');
  const [editingReceived, setEditingReceived] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [savingReceived, setSavingReceived] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/pos/reports/closure/${id}`)
      .then(r => r.json())
      .then((d: ClosureData) => {
        setData(d);
        const s = d.session;
        const received = s?.closing_cash ?? (s?.actual_cash_cents != null ? s.actual_cash_cents / 100 : null);
        if (received !== null) setReceivedAmount(received);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ background:C.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontFamily:"'Manrope',sans-serif" }}>
      Loading closure…
    </div>
  );

  if (!data?.session) return (
    <div style={{ background:C.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:C.text, fontFamily:"'Manrope',sans-serif" }}>
      <p style={{ fontSize:48 }}>📋</p>
      <p style={{ color:C.muted }}>Closure not found</p>
      <Link href="/pos/reports/closures" style={{ color:C.violet, fontSize:13 }}>← Back</Link>
    </div>
  );

  async function saveReceived() {
    if (!id) return;
    setSavingReceived(true);
    await fetch(`/api/pos/sessions?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closing_cash: receivedAmount, actual_cash_cents: Math.round(receivedAmount * 100) }),
    });
    setEditingReceived(false);
    setSavingReceived(false);
  }

  const { session, payment_totals, by_cashier, hourly } = data;
  const revenue = data.revenue ?? 0;
  const tax = data.tax ?? 0;
  const discounts = data.discounts ?? 0;
  const transaction_count = data.transaction_count ?? 0;
  const variance = receivedAmount > 0 ? receivedAmount - revenue : null;
  const chartKey = activeTab === 'revenue' ? 'revenue' : activeTab === 'transactions' ? 'transactions' : activeTab === 'customers' ? 'customers' : 'avg_sale';

  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding:'18px 28px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/pos/reports/closures" style={{ color:C.muted, textDecoration:'none', fontSize:13 }}>← Closures</Link>
          <span style={{ color:C.border }}>/</span>
          <h1 style={{ fontSize:17, fontWeight:700, color:C.text }}>Register Closure</h1>
        </div>
        <button onClick={() => window.print()} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>🖨 Print</button>
      </div>

      <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* Session info */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {([
              ['Outlet', session.outlet_name || 'Main'],
              ['Register', session.register_name || 'Register'],
              ['Opened At', session.opened_at ? new Date(session.opened_at).toLocaleString('en-AU') : '—'],
              ['Closed At', session.closed_at ? new Date(session.closed_at).toLocaleString('en-AU') : 'Still open'],
              ['Closed By', session.closed_by || '—'],
              ['Total Transactions', String(transaction_count)],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l}>
                <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, marginBottom:3 }}>{l}</p>
                <p style={{ fontSize:14, color:C.text, fontWeight:500 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
          <div style={{ background:'rgba(29,78,216,0.2)', border:'1px solid rgba(59,130,246,0.3)', borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:'rgba(147,197,253,0.8)', marginBottom:8 }}>Money Received</p>
            {editingReceived ? (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <span style={{ color:'#93C5FD', fontSize:18, fontWeight:800 }}>A$</span>
                <input type="number" step="0.01" value={receivedAmount} onChange={e => setReceivedAmount(parseFloat(e.target.value)||0)} autoFocus
                  style={{ width:90, fontSize:18, fontWeight:700, textAlign:'right', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'4px 8px', color:'#fff', outline:'none', fontFamily:'monospace' }} />
                <button onClick={saveReceived} disabled={savingReceived} style={{ padding:'4px 10px', borderRadius:6, border:'none', background:C.green, color:'#fff', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✓</button>
                <button onClick={() => setEditingReceived(false)} style={{ padding:'4px 10px', borderRadius:6, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>✗</button>
              </div>
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#93C5FD' }}>A${(receivedAmount || revenue).toFixed(2)}</p>
                <button onClick={() => { setReceivedAmount(revenue); setEditingReceived(true); }} title="Edit received amount" style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:14, padding:0 }}>✏️</button>
              </div>
            )}
            {variance !== null && (
              <p style={{ fontSize:12, fontWeight:600, color:variance>=0?C.green:C.red, marginTop:4 }}>
                {variance>=0?'+':''}{variance.toFixed(2)} variance
              </p>
            )}
          </div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:C.dim, marginBottom:8 }}>Transactions</p>
            <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:C.text }}>{transaction_count}</p>
          </div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:C.dim, marginBottom:8 }}>GST (10%)</p>
            <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:tax === 0 ? C.dim : C.text }}>A${tax.toFixed(2)}</p>
          </div>
        </div>

        {/* Payment method breakdown */}
        {Object.keys(payment_totals).length > 0 && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}` }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Payment Methods</p>
            </div>
            <div style={{ padding:'14px 20px', display:'flex', gap:12, flexWrap:'wrap' }}>
              {Object.entries(payment_totals).map(([method, total]) => (
                <div key={method} style={{ flex:'1 1 140px', background:'#FAFAFA', borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                  <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, marginBottom:6 }}>{method}</p>
                  <p style={{ fontFamily:'monospace', fontSize:18, fontWeight:800, color:C.violet }}>A${total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Discounts */}
        {discounts > 0 && (
          <div style={{ background:'rgba(220,38,38,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:14, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Total Discounts Given</p>
            <p style={{ fontFamily:'monospace', fontSize:20, fontWeight:800, color:C.red }}>-A${discounts.toFixed(2)}</p>
          </div>
        )}

        {/* Cashier stats */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'14px 18px', borderBottom:`1px solid ${C.border}` }}>
            <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Statistics by Cashier</p>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'rgba(0,229,255,0.06)', borderBottom:`1px solid ${C.border}` }}>
                {['Cashier','Revenue','Transactions','Avg Sale'].map(h => (
                  <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'9px 14px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {by_cashier.map((c, i) => (
                <tr key={c.name} style={{ borderBottom: i < by_cashier.length-1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.text, fontWeight:600 }}>{c.name}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.violet, fontFamily:'monospace', fontWeight:700 }}>A${c.revenue.toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.muted }}>{c.transaction_count}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.muted, fontFamily:'monospace' }}>A${c.avg_sale.toFixed(2)}</td>
                </tr>
              ))}
              <tr style={{ background:'rgba(0,229,255,0.04)', borderTop:`1px solid ${C.border}` }}>
                <td style={{ padding:'10px 14px', fontSize:13, fontWeight:800, color:C.text }}>TOTAL</td>
                <td style={{ padding:'10px 14px', fontSize:14, fontWeight:800, color:C.cyan, fontFamily:'monospace' }}>A${revenue.toFixed(2)}</td>
                <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color:C.text }}>{transaction_count}</td>
                <td style={{ padding:'10px 14px', fontSize:13, color:C.muted, fontFamily:'monospace' }}>A${transaction_count > 0 ? (revenue/transaction_count).toFixed(2) : '0.00'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Hourly chart */}
        {hourly.length > 0 && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Hourly Activity</p>
              <div style={{ display:'flex', gap:4 }}>
                {(['revenue','transactions','customers','avg_sale'] as Tab[]).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)}
                    style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${activeTab===t ? C.cyan : C.border}`, background:activeTab===t ? 'rgba(0,229,255,0.1)' : 'transparent', color:activeTab===t ? C.cyan : C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>
                    {t === 'avg_sale' ? 'Avg Sale' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourly} margin={{ left:0, right:0, top:4, bottom:0 }}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.cyan} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill:C.dim, fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:C.dim, fontSize:10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => activeTab==='revenue'||activeTab==='avg_sale' ? `$${v.toFixed(0)}` : String(v)} />
                <Tooltip contentStyle={{ background:'var(--bg-elevated)', border:`1px solid ${C.border}`, borderRadius:8, color:C.text, fontSize:12 }} />
                <Area type="monotone" dataKey={chartKey} stroke={C.cyan} strokeWidth={2} fill="url(#cg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
