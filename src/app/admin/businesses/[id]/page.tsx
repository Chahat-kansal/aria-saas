'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', border: 'rgba(0,229,255,0.08)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', cyan: '#00E5FF', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };
const TABS = ['Overview','Sales','Products','Customers','Staff','Usage','Settings','Notes'] as const;
const PLAN_COLORS: Record<string,string> = { free: C.muted, pro: '#3B82F6', enterprise: C.amber, trial: C.amber, disabled: C.red };

export default function BusinessDeepDive() {
  const { id } = useParams<{ id: string }>();
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<typeof TABS[number]>('Overview');
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/businesses/${id}`).then(r => r.json()).then(d => {
      setData(d); setNoteText(d.business?.internal_notes || ''); setLoading(false);
    }).catch(() => setLoading(false));
  }, [id]);

  async function setPlan(plan: string) {
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    setData((d: any) => ({ ...d, business: { ...d.business, plan } }));
  }

  async function toggleActive(active: boolean) {
    if (!active && !confirm(`Disable ${data.business.name}? This will lock them out.`)) return;
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active }) });
    setData((d: any) => ({ ...d, business: { ...d.business, is_active: active } }));
  }

  async function saveNote() {
    setNoteSaving(true);
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ internal_notes: noteText }) });
    setNoteSaving(false);
  }

  if (loading) return <p style={{ color: C.muted }}>Loading…</p>;
  if (!data?.business) return <p style={{ color: C.red }}>Business not found</p>;

  const biz = data.business;
  const iS  = { background: 'var(--bg-surface)', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '8px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const };

  // Daily revenue chart
  const dayMap: Record<string, number> = {};
  for (const s of (data.sales || [])) {
    const day = s.created_at?.slice(0, 10);
    if (day) dayMap[day] = (dayMap[day] || 0) + (s.total_amount || 0);
  }
  const salesChart = Object.entries(dayMap).sort(([a],[b]) => a.localeCompare(b)).slice(-30).map(([date, rev]) => ({ date: date.slice(5), rev }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Link href="/admin/businesses" style={{ fontSize: 12, color: C.cyan, textDecoration: 'none', display: 'block', marginBottom: 6 }}>← All businesses</Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{biz.name}</h1>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: 'rgba(130,160,200,0.1)', color: C.muted, textTransform: 'capitalize' }}>{biz.industry}</span>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: `${PLAN_COLORS[biz.plan||'free']}15`, color: PLAN_COLORS[biz.plan||'free'], fontWeight: 700 }}>{(biz.plan||'free').toUpperCase()}</span>
            <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: biz.is_active !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: biz.is_active !== false ? C.green : C.red }}>{biz.is_active !== false ? 'Active' : 'Disabled'}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={biz.plan || 'free'} onChange={e => setPlan(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid rgba(0,229,255,0.2)`, background: 'var(--bg-surface)', color: C.cyan, fontSize: 12, cursor: 'pointer' }}>
            {['free','pro','enterprise','trial','disabled'].map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {biz.is_active !== false
            ? <button onClick={() => toggleActive(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>🚫 Disable</button>
            : <button onClick={() => toggleActive(true)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'transparent', color: C.green, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>✅ Enable</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${C.border}`, marginBottom: 24, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '10px 18px', background: 'none', border: 'none', borderBottom: `2px solid ${tab === t ? C.cyan : 'transparent'}`, color: tab === t ? C.cyan : C.muted, fontSize: 13, fontWeight: tab === t ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, letterSpacing: '0.06em', marginBottom: 12 }}>Business Info</p>
            {[['Name', biz.name], ['Industry', biz.industry], ['City', biz.city], ['Joined', biz.created_at ? new Date(biz.created_at).toLocaleDateString('en-AU') : '—'], ['Stripe ID', biz.stripe_customer_id || 'Not set']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.dim }}>{l}</span>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{v || '—'}</span>
              </div>
            ))}
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: C.dim, letterSpacing: '0.06em', marginBottom: 12 }}>Quick Stats</p>
            {[
              ['Total Revenue', `A$${(data.stats?.total_revenue||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2})}`],
              ['Sales', data.stats?.sale_count || 0],
              ['Products', data.stats?.product_count || 0],
              ['Customers', data.stats?.customer_count || 0],
              ['Staff', (data.staff||[]).length],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: C.dim }}>{l}</span>
                <span style={{ fontSize: 13, color: C.text, fontWeight: 700, fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'Sales' && (
        <div>
          {salesChart.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: '18px 20px', marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Revenue — last 30 days</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={salesChart} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 12 }} />
                  <Bar dataKey="rev" fill={C.cyan} radius={[3,3,0,0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                {['Date','Amount','Payment','Status'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>)}
              </tr></thead>
              <tbody>{(data.sales||[]).slice(0,50).map((s: any, i: number) => (
                <tr key={s.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding:'8px 12px', color:C.muted }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-AU') : '—'}</td>
                  <td style={{ padding:'8px 12px', color:C.text, fontFamily:'monospace', fontWeight:700 }}>A${(s.total_amount||0).toFixed(2)}</td>
                  <td style={{ padding:'8px 12px', color:C.muted, textTransform:'capitalize' }}>{s.payment_method || '—'}</td>
                  <td style={{ padding:'8px 12px' }}><span style={{ fontSize:10, padding:'2px 6px', borderRadius:99, background:'rgba(34,197,94,0.1)', color:C.green }}>✓ Complete</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'Products' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
              {['Name','Category','Price','Cost','Stock','Active'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{(data.products||[]).map((p: any, i: number) => (
              <tr key={p.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'8px 12px', color:C.text, fontWeight:500 }}>{p.name}</td>
                <td style={{ padding:'8px 12px', color:C.muted }}>{(p.pos_categories as any)?.name || '—'}</td>
                <td style={{ padding:'8px 12px', color:C.text, fontFamily:'monospace' }}>A${(p.price||0).toFixed(2)}</td>
                <td style={{ padding:'8px 12px', color:C.muted, fontFamily:'monospace' }}>{p.cost_price ? `A$${p.cost_price.toFixed(2)}` : '—'}</td>
                <td style={{ padding:'8px 12px', color:p.track_stock ? C.text : C.dim }}>{p.track_stock ? p.stock_quantity ?? 0 : '∞'}</td>
                <td style={{ padding:'8px 12px' }}><span style={{ fontSize:10, color: p.is_active ? C.green : C.dim }}>{p.is_active ? '✓' : '✗'}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'Customers' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
              {['Name','Email','Phone','Loyalty Pts','Last Visit'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{(data.customers||[]).slice(0,50).map((c: any) => (
              <tr key={c.id} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'8px 12px', color:C.text }}>{c.name || '—'}</td>
                <td style={{ padding:'8px 12px', color:C.muted }}>{c.email || '—'}</td>
                <td style={{ padding:'8px 12px', color:C.muted }}>{c.phone || '—'}</td>
                <td style={{ padding:'8px 12px', color:C.text, fontFamily:'monospace' }}>{c.loyalty_points ?? '—'}</td>
                <td style={{ padding:'8px 12px', color:C.dim }}>{c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-AU') : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'Staff' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
              {['Name','Role','Visa Type','Visa Expiry','Status'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{(data.staff||[]).map((s: any) => {
              const daysLeft = s.visa_expiry_date ? Math.ceil((new Date(s.visa_expiry_date).getTime() - Date.now()) / 86400000) : null;
              return (
                <tr key={s.id} style={{ borderBottom:`1px solid ${C.border}`, background: daysLeft !== null && daysLeft < 30 ? 'rgba(239,68,68,0.04)' : 'transparent' }}>
                  <td style={{ padding:'8px 12px', color:C.text }}>{s.first_name} {s.last_name}</td>
                  <td style={{ padding:'8px 12px', color:C.muted, textTransform:'capitalize' }}>{s.role || '—'}</td>
                  <td style={{ padding:'8px 12px', color:C.muted }}>{s.visa_type || '—'}</td>
                  <td style={{ padding:'8px 12px', color: daysLeft !== null && daysLeft < 30 ? C.red : C.muted }}>
                    {s.visa_expiry_date ? `${new Date(s.visa_expiry_date).toLocaleDateString('en-AU')}${daysLeft !== null && daysLeft < 30 ? ` (${daysLeft}d!)` : ''}` : '—'}
                  </td>
                  <td style={{ padding:'8px 12px' }}><span style={{ fontSize:10, color: s.status === 'active' ? C.green : C.dim }}>{s.status}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      {tab === 'Usage' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead><tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:`1px solid ${C.border}` }}>
              {['Event','Time','Details'].map(h => <th key={h} style={{ textAlign:'left', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:C.dim, padding:'8px 12px' }}>{h}</th>)}
            </tr></thead>
            <tbody>{(data.usage||[]).slice(0,50).map((u: any, i: number) => (
              <tr key={i} style={{ borderBottom:`1px solid ${C.border}` }}>
                <td style={{ padding:'8px 12px', color:C.cyan, fontFamily:'monospace' }}>{u.event_type}</td>
                <td style={{ padding:'8px 12px', color:C.dim }}>{u.created_at ? new Date(u.created_at).toLocaleString('en-AU') : '—'}</td>
                <td style={{ padding:'8px 12px', color:C.muted, fontFamily:'monospace', fontSize:10 }}>{JSON.stringify(u.metadata).slice(0, 80)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab === 'Settings' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding:'18px 20px' }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:C.dim, marginBottom:12 }}>POS Settings (read-only)</p>
          <pre style={{ fontSize:12, color:C.muted, fontFamily:'monospace', whiteSpace:'pre-wrap', wordBreak:'break-all' }}>{JSON.stringify(data.settings, null, 2)}</pre>
        </div>
      )}

      {tab === 'Notes' && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding:'18px 20px' }}>
          <p style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', color:C.dim, marginBottom:12 }}>Internal Notes (admin only)</p>
          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={8} style={{ ...iS, resize:'vertical' as const }} placeholder="Internal notes about this business…" />
          <button onClick={saveNote} disabled={noteSaving} style={{ marginTop:12, padding:'9px 22px', borderRadius:9, border:'none', background:C.cyan, color:'#000', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:noteSaving?0.6:1 }}>
            {noteSaving ? 'Saving…' : 'Save Notes'}
          </button>
          <div style={{ marginTop:24, padding:'16px 18px', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, background:'rgba(239,68,68,0.04)' }}>
            <p style={{ fontSize:13, fontWeight:700, color:C.red, marginBottom:10 }}>⚠️ Danger Zone</p>
            <button onClick={() => { if(confirm(`Disable ${biz.name}?`)) toggleActive(false); }} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid rgba(239,68,68,0.3)', background:'transparent', color:C.red, fontSize:12, cursor:'pointer', fontFamily:'inherit', marginRight:8 }}>Disable account</button>
          </div>
        </div>
      )}
    </div>
  );
}
