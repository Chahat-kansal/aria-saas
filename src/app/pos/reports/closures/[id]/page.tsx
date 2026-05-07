'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const C = { bg:'var(--bg-base)', card:'var(--bg-surface)', border:'transparent', text:'var(--text-primary)', muted:'var(--text-secondary)', dim:'var(--text-tertiary)', violet:'#8B5CF6', green:'#22C55E', red:'#EF4444', amber:'#F59E0B', cyan:'#00E5FF' };
type Tab = 'revenue' | 'customers' | 'transactions' | 'avg';

export default function ClosureDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<any>(null);
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('revenue');
  const [editingReceived, setEditingReceived] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState(0);
  const [savingReceived, setSavingReceived] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pos/sessions?id=${id}`).then(r => r.json()),
      fetch(`/api/pos/sales?session_id=${id}&limit=500`).then(r => r.json()),
    ]).then(([sd, salesData]) => {
      setSession(sd.session ?? null);
      setSales(salesData.sales ?? []);
      const received = sd.session?.closing_cash ?? sd.session?.actual_cash_cents ? (sd.session.actual_cash_cents / 100) : null;
      if (received !== null) setReceivedAmount(received);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ background:C.bg, minHeight:'100%', display:'flex', alignItems:'center', justifyContent:'center', color:C.muted, fontFamily:"'Manrope',sans-serif" }}>
      Loading closure…
    </div>
  );

  if (!session) return (
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

  // Calculations
  const totalRevenue = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
  const variance = receivedAmount > 0 ? receivedAmount - totalRevenue : null;
  const totalDiscount = sales.reduce((s, r) => s + (r.discount_amount || 0), 0);
  const totalTax = totalRevenue * 10 / 110;
  const txCount = sales.length;

  // By cashier
  const byCashier: Record<string, { revenue: number; count: number }> = {};
  for (const s of sales) {
    const k = s.served_by || 'Unknown';
    if (!byCashier[k]) byCashier[k] = { revenue: 0, count: 0 };
    byCashier[k].revenue += s.total_amount || 0;
    byCashier[k].count += 1;
  }

  // Hourly
  const hourMap: Record<string, { revenue: number; count: number; customers: number }> = {};
  for (const s of sales) {
    const h = new Date(s.created_at).getHours();
    const key = `${String(h).padStart(2,'0')}:00`;
    if (!hourMap[key]) hourMap[key] = { revenue: 0, count: 0, customers: 0 };
    hourMap[key].revenue += s.total_amount || 0;
    hourMap[key].count += 1;
    if (s.customer_id) hourMap[key].customers += 1;
  }
  const hourlyData = Object.entries(hourMap).sort(([a],[b]) => a.localeCompare(b)).map(([hour, v]) => ({
    hour,
    revenue: v.revenue,
    transactions: v.count,
    customers: v.customers,
    avg: v.count > 0 ? v.revenue / v.count : 0,
  }));

  const chartKey = activeTab === 'revenue' ? 'revenue' : activeTab === 'transactions' ? 'transactions' : activeTab === 'customers' ? 'customers' : 'avg';

  return (
    <div style={{ minHeight:'100%', background:C.bg, color:C.text, fontFamily:"'Manrope',sans-serif" }}>
      {/* Header */}
      <div style={{ padding:'18px 28px', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <Link href="/pos/reports/closures" style={{ color:C.muted, textDecoration:'none', fontSize:13 }}>← Closures</Link>
          <span style={{ color:C.border }}>/</span>
          <h1 style={{ fontSize:17, fontWeight:700, color:C.text }}>Register Closure</h1>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => window.print()} style={{ padding:'7px 14px', borderRadius:8, border:`1px solid ${C.border}`, background:'transparent', color:C.muted, fontSize:12, cursor:'pointer', fontFamily:'inherit' }}>🖨 Print</button>
        </div>
      </div>

      <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* Info table */}
        <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {([
              ['Outlet', session.outlet_name || 'Main'],
              ['Register', session.register_name || 'Register'],
              ['Opened At', session.opened_at ? new Date(session.opened_at).toLocaleString('en-AU') : '—'],
              ['Closed At', session.closed_at ? new Date(session.closed_at).toLocaleString('en-AU') : 'Still open'],
              ['Closed By', session.closed_by || '—'],
              ['Total Transactions', String(txCount)],
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
                <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:'#93C5FD' }}>A${(receivedAmount||totalRevenue).toFixed(2)}</p>
                <button onClick={() => { setReceivedAmount(totalRevenue); setEditingReceived(true); }} title="Edit received amount" style={{ background:'none', border:'none', color:'rgba(255,255,255,0.4)', cursor:'pointer', fontSize:14, padding:0 }}>✏️</button>
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
            <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:C.text }}>{txCount}</p>
          </div>
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
            <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:C.dim, marginBottom:8 }}>GST (10%)</p>
            <p style={{ fontFamily:'monospace', fontSize:22, fontWeight:800, color:C.amber }}>A${totalTax.toFixed(2)}</p>
          </div>
        </div>

        {/* Discounts */}
        {totalDiscount > 0 && (
          <div style={{ background:'rgba(220,38,38,0.1)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:14, padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Total Discounts Given</p>
            <p style={{ fontFamily:'monospace', fontSize:20, fontWeight:800, color:C.red }}>-A${totalDiscount.toFixed(2)}</p>
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
              {Object.entries(byCashier).map(([name, v], i) => (
                <tr key={name} style={{ borderBottom: i < Object.keys(byCashier).length-1 ? `1px solid ${C.border}` : 'none' }}>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.text, fontWeight:600 }}>{name}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.violet, fontFamily:'monospace', fontWeight:700 }}>A${v.revenue.toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.muted }}>{v.count}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:C.muted, fontFamily:'monospace' }}>A${(v.revenue/v.count).toFixed(2)}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ background:'rgba(0,229,255,0.04)', borderTop:`1px solid ${C.border}` }}>
                <td style={{ padding:'10px 14px', fontSize:13, fontWeight:800, color:C.text }}>TOTAL</td>
                <td style={{ padding:'10px 14px', fontSize:14, fontWeight:800, color:C.cyan, fontFamily:'monospace' }}>A${totalRevenue.toFixed(2)}</td>
                <td style={{ padding:'10px 14px', fontSize:13, fontWeight:700, color:C.text }}>{txCount}</td>
                <td style={{ padding:'10px 14px', fontSize:13, color:C.muted, fontFamily:'monospace' }}>A${txCount > 0 ? (totalRevenue/txCount).toFixed(2) : '0.00'}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Hourly chart */}
        {hourlyData.length > 0 && (
          <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 20px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <p style={{ fontSize:13, fontWeight:700, color:C.text }}>Hourly Activity</p>
              <div style={{ display:'flex', gap:4 }}>
                {(['revenue','transactions','customers','avg'] as Tab[]).map(t => (
                  <button key={t} onClick={() => setActiveTab(t)}
                    style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${activeTab===t ? C.cyan : C.border}`, background:activeTab===t ? 'rgba(0,229,255,0.1)' : 'transparent', color:activeTab===t ? C.cyan : C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>
                    {t === 'avg' ? 'Avg Sale' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={hourlyData} margin={{ left:0, right:0, top:4, bottom:0 }}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.cyan} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill:C.dim, fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill:C.dim, fontSize:10 }} axisLine={false} tickLine={false}
                  tickFormatter={(v: number) => activeTab==='revenue'||activeTab==='avg' ? `$${v.toFixed(0)}` : String(v)} />
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
