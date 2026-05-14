'use client'
import { useState, useEffect, useCallback } from 'react'

interface Customer {
  id: string; name: string; phone: string | null; email: string | null
  total_spent: number; points_balance: number; stamps_count: number
  visit_count: number; last_visit_at: string | null; tags: string[]
  marketing_consent: boolean; notes: string | null; birthday: string | null; created_at: string
}

const TAG_COLORS: Record<string, string> = {
  vip: '#F59E0B', regular: '#7FB897', student: '#6B96B0', wholesale: '#8B5CF6',
}

function TagBadge({ tag }: { tag: string }) {
  const color = TAG_COLORS[tag.toLowerCase()] ?? '#94A3B8'
  return (
    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 99, background: `${color}20`, color, fontWeight: 700 }}>
      {tag}
    </span>
  )
}

function timeAgo(d: string | null): string {
  if (!d) return 'Never'
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort,      setSort]      = useState('last_visit_at')
  const [selected,  setSelected]  = useState<Customer | null>(null)
  const [page,      setPage]      = useState(0)
  const PAGE = 50

  const load = useCallback(async (q: string, tag: string, sortBy: string, pg: number) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: String(PAGE), offset: String(pg * PAGE), sort: sortBy })
    if (q) params.set('q', q)
    if (tag) params.set('tag', tag)
    const res = await fetch(`/api/pos/customers?${params}`).then(r => r.json()).catch(() => ({ customers: [] }))
    setCustomers(res.customers ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { load(search, tagFilter, sort, page) }, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, tagFilter, sort, page, load])

  const allTags = [...new Set(customers.flatMap(c => c.tags ?? []))]

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '28px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>Customers</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Search, filter, and manage your customer database.</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="🔍 Search name, phone, email…"
          style={{ flex: 1, minWidth: 200, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
        />
        <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setPage(0) }}
          style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="">All tags</option>
          {allTags.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={e => { setSort(e.target.value); setPage(0) }}
          style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
          <option value="last_visit_at">Last visit</option>
          <option value="total_spent">Top spenders</option>
          <option value="visit_count">Most visits</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ height: 200, background: 'var(--bg-surface)', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
      ) : customers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
          No customers found.
        </div>
      ) : (
        <div style={{ border: '1px solid var(--divider)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--divider)' }}>
                {['Name','Phone','Last Visit','Spent','Points','Stamps','Tags','Consent'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-tertiary)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => setSelected(selected?.id === c.id ? null : c)}
                  style={{
                    borderBottom: i < customers.length - 1 ? '1px solid var(--divider)' : 'none',
                    cursor: 'pointer',
                    background: selected?.id === c.id ? 'rgba(139,92,246,0.05)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>{c.phone ?? '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{timeAgo(c.last_visit_at)}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: '#7FB897' }}>A${(c.total_spent ?? 0).toFixed(0)}</td>
                  <td style={{ padding: '9px 12px', color: '#8B5CF6', fontWeight: 600 }}>{c.points_balance ?? 0}</td>
                  <td style={{ padding: '9px 12px', color: '#F59E0B', fontWeight: 600 }}>{c.stamps_count ?? 0}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {(c.tags ?? []).map(t => <TagBadge key={t} tag={t} />)}
                    </div>
                  </td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 10, color: c.marketing_consent ? '#7FB897' : 'var(--text-tertiary)' }}>
                      {c.marketing_consent ? '✓ Yes' : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(customers.length === PAGE || page > 0) && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: page === 0 ? 0.4 : 1 }}>
            ← Prev
          </button>
          <span style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>Page {page + 1}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={customers.length < PAGE}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: customers.length < PAGE ? 0.4 : 1 }}>
            Next →
          </button>
        </div>
      )}

      {/* Expanded detail row */}
      {selected && (
        <div style={{ marginTop: 20, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{selected.name}</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12 }}>
                {selected.phone && <span>📱 {selected.phone}</span>}
                {selected.email && <span>✉️ {selected.email}</span>}
                {selected.birthday && <span>🎂 {selected.birthday}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#7FB897' }}>A${(selected.total_spent ?? 0).toFixed(0)}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>Spent</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#8B5CF6' }}>{selected.points_balance ?? 0}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>Points</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#F59E0B' }}>{selected.stamps_count ?? 0}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>Stamps</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{selected.visit_count ?? 0}</div>
                <div style={{ color: 'var(--text-tertiary)' }}>Visits</div>
              </div>
            </div>
          </div>
          {selected.notes && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 8, margin: '0 0 12px' }}>
              📝 {selected.notes}
            </p>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(selected.tags ?? []).map(t => <TagBadge key={t} tag={t} />)}
            <a href={`/pos/customers/${selected.id}`} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'transparent', color: 'var(--text-secondary)', textDecoration: 'none', fontWeight: 600 }}>
              View profile →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}