'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const C = { bg: '#080C10', card: '#0A0E1A', border: 'rgba(0,229,255,0.08)', text: '#E8F4F8', muted: 'rgba(130,160,200,0.7)', dim: 'rgba(130,160,200,0.35)', cyan: '#00E5FF', violet: '#8B5CF6', green: '#22C55E', red: '#EF4444', amber: '#F59E0B' };

const PLAN_COLORS: Record<string, string> = { free: C.muted, pro: '#3B82F6', enterprise: C.amber, trial: '#F59E0B', disabled: C.red };

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  return `${Math.floor(days/30)}mo ago`;
}

function lastActiveColor(iso: string | null): string {
  if (!iso) return C.dim;
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days < 7 ? C.green : days < 30 ? C.amber : C.red;
}

export default function BusinessesPage() {
  const [businesses, setBusinesses] = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [filterPlan, setFilterPlan] = useState('');
  const [sort, setSort]             = useState('newest');
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [actionBiz, setActionBiz]   = useState<any>(null);
  const [noteText, setNoteText]     = useState('');

  useEffect(() => {
    fetch('/api/admin/businesses').then(r => r.json()).then(d => {
      setBusinesses(d.businesses || []); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const industries = [...new Set(businesses.map(b => b.industry).filter(Boolean))];
  const plans      = [...new Set(businesses.map(b => b.plan || 'free'))];

  const filtered = businesses.filter(b => {
    if (filterIndustry && b.industry !== filterIndustry) return false;
    if (filterPlan     && (b.plan || 'free') !== filterPlan) return false;
    if (search) {
      const q = search.toLowerCase();
      return b.name?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    if (sort === 'newest')   return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === 'revenue')  return (b.total_revenue || 0) - (a.total_revenue || 0);
    if (sort === 'alpha')    return (a.name || '').localeCompare(b.name || '');
    if (sort === 'active')   return (b.sale_count || 0) - (a.sale_count || 0);
    return 0;
  });

  async function setPlan(id: string, plan: string) {
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan }) });
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, plan } : b));
  }

  async function toggleActive(id: string, active: boolean) {
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: active }) });
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, is_active: active } : b));
  }

  async function saveNote(id: string) {
    await fetch(`/api/admin/businesses?id=${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ internal_notes: noteText }) });
    setBusinesses(prev => prev.map(b => b.id === id ? { ...b, internal_notes: noteText } : b));
    setActionBiz(null);
  }

  async function impersonate(biz: any) {
    const db_res = await fetch('/api/admin/businesses').then(r => r.json());
    // find user email via impersonate API
    const res = await fetch('/api/admin/impersonate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: biz.user_id || 'unknown', user_email: biz.owner_email || '' }),
    });
    const d = await res.json();
    if (d.magic_link) window.open(d.magic_link, '_blank');
    else alert(d.error || 'Could not generate impersonation link');
  }

  const iS = { background: '#0A0E1A', border: `1px solid rgba(0,229,255,0.12)`, borderRadius: 8, padding: '7px 12px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 2 }}>Businesses</h1>
          <p style={{ fontSize: 13, color: C.muted }}>{filtered.length} of {businesses.length} businesses</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or city…" style={{ ...iS, minWidth: 220 }} />
        <select value={filterIndustry} onChange={e => setFilterIndustry(e.target.value)} style={iS}>
          <option value="">All industries</option>
          {industries.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={iS}>
          <option value="">All plans</option>
          {plans.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={iS}>
          <option value="newest">Newest first</option>
          <option value="revenue">Most revenue</option>
          <option value="active">Most active</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>

      {loading ? <p style={{ color: C.muted }}>Loading…</p> : (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ width: 36, padding: '10px 12px' }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(filtered.map(b => b.id)) : new Set())}
                      style={{ accentColor: C.cyan }} />
                  </th>
                  {['Business','Industry','City','Plan','Products','Sales','Revenue','Joined','Last Active','Status','Actions'].map(h => (
                    <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.dim, padding: '10px 10px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => (
                  <tr key={b.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none', background: selected.has(b.id) ? 'rgba(0,229,255,0.03)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <input type="checkbox" checked={selected.has(b.id)}
                        onChange={e => setSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(b.id) : n.delete(b.id); return n; })}
                        style={{ accentColor: C.cyan }} />
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <Link href={`/admin/businesses/${b.id}`} style={{ fontSize: 13, fontWeight: 600, color: C.text, textDecoration: 'none' }}>{b.name}</Link>
                    </td>
                    <td style={{ padding: '9px 10px', color: C.muted, textTransform: 'capitalize' }}>{b.industry || '—'}</td>
                    <td style={{ padding: '9px 10px', color: C.muted }}>{b.city || '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${PLAN_COLORS[b.plan||'free']}15`, color: PLAN_COLORS[b.plan||'free'], fontWeight: 700, border: `1px solid ${PLAN_COLORS[b.plan||'free']}30` }}>
                        {(b.plan || 'free').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px', color: C.muted, fontFamily: 'monospace' }}>{b.product_count || 0}</td>
                    <td style={{ padding: '9px 10px', color: C.muted, fontFamily: 'monospace' }}>{b.sale_count || 0}</td>
                    <td style={{ padding: '9px 10px', color: C.text, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {b.total_revenue ? `A$${b.total_revenue.toLocaleString('en-AU',{minimumFractionDigits:0,maximumFractionDigits:0})}` : '—'}
                    </td>
                    <td style={{ padding: '9px 10px', color: C.dim, whiteSpace: 'nowrap' }}>{b.created_at ? new Date(b.created_at).toLocaleDateString('en-AU',{day:'numeric',month:'short'}) : '—'}</td>
                    <td style={{ padding: '9px 10px', color: lastActiveColor(b.last_sale_at), whiteSpace: 'nowrap' }}>{timeAgo(b.last_sale_at)}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: b.is_active !== false ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: b.is_active !== false ? C.green : C.red, fontWeight: 700 }}>
                        {b.is_active !== false ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 10px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <Link href={`/admin/businesses/${b.id}`} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, color: C.muted, textDecoration: 'none' }}>👁 View</Link>
                        <select value={b.plan || 'free'} onChange={e => setPlan(b.id, e.target.value)}
                          style={{ fontSize: 10, padding: '3px 4px', borderRadius: 6, border: `1px solid rgba(0,229,255,0.15)`, background: '#0A0E1A', color: C.cyan, cursor: 'pointer' }}>
                          {['free','pro','enterprise','trial','disabled'].map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        {b.is_active !== false
                          ? <button onClick={() => { if (confirm(`Disable ${b.name}?`)) toggleActive(b.id, false); }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: C.red, cursor: 'pointer', fontFamily: 'inherit' }}>🚫</button>
                          : <button onClick={() => toggleActive(b.id, true)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'transparent', color: C.green, cursor: 'pointer', fontFamily: 'inherit' }}>✅</button>}
                        <button onClick={() => { setActionBiz(b); setNoteText(b.internal_notes || ''); }}
                          style={{ fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit' }}>📝</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note modal */}
      {actionBiz && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, width: '100%', maxWidth: 460 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 12 }}>Internal note — {actionBiz.name}</h3>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={5}
              style={{ ...iS, width: '100%', resize: 'vertical', boxSizing: 'border-box' as const }} placeholder="Internal notes visible only to admins…" />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setActionBiz(null)} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.muted, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}>Cancel</button>
              <button onClick={() => saveNote(actionBiz.id)} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.cyan, color: '#000', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700 }}>Save note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
