'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface Customer { id: string; name: string; email: string | null; phone: string | null; loyalty_points: number; total_spend?: number | null; visit_count?: number | null; last_visit?: string | null; group_name?: string | null; created_at: string; }
interface Group { id: string; name: string; }

function Sparkline({ values }: { values: number[] }) {
  if (!values || values.filter(v => v > 0).length < 2) {
    return <svg width={120} height={40}><line x1="0" y1="20" x2="120" y2="20" stroke="rgba(100,100,100,0.3)" strokeWidth={1} /></svg>
  }
  const max = Math.max(...values, 1)
  const w = 120, h = 40
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ')
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke="#006AFF" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [performances, setPerformances] = useState<Record<string, number[]>>({})
  const [businessId, setBusinessId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [cRes, gRes] = await Promise.all([
      fetch('/api/pos/customers').then(r => r.json()).catch(() => ({ customers: [] })),
      fetch('/api/pos/customer-groups').then(r => r.json()).catch(() => ({ groups: [] })),
    ])
    setCustomers(cRes.customers || [])
    setGroups(gRes.groups || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    try {
      const bid = localStorage.getItem('aria_business_id') || localStorage.getItem('pos_business_id') || ''
      setBusinessId(bid)
    } catch {}
    load()
  }, [load])

  useEffect(() => {
    if (customers.length === 0 || !businessId) return
    const ids = customers.map(c => c.id)
    fetch('/api/pos/customers/performance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: businessId, customer_ids: ids }),
    }).then(r => r.json()).then(d => setPerformances(d)).catch(() => {})
  }, [customers, businessId])

  const filtered = customers.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !(c.email || '').toLowerCase().includes(search.toLowerCase()) && !(c.phone || '').includes(search)) return false
    if (selectedGroup && c.group_name !== selectedGroup) return false
    return true
  })

  // Blue header is branded — stays in both modes
  const hdr: React.CSSProperties = { padding: '11px 14px', background: '#006AFF', color: 'white', fontWeight: 700, fontSize: 13, textAlign: 'left', whiteSpace: 'nowrap' }
  const cell: React.CSSProperties = { padding: '14px', fontSize: 13, verticalAlign: 'middle' }
  const inS: React.CSSProperties = { width: '100%', padding: '10px 14px', fontSize: 14, background: 'var(--bg-input)', color: 'var(--text-primary)', border: 'none', borderRadius: 4, outline: 'none', boxSizing: 'border-box', boxShadow: 'var(--shadow-sm)', fontFamily: 'inherit' }
  const lblS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, display: 'block' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',system-ui,sans-serif", padding: '20px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Customers</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Add Customer — stays branded cyan */}
          <button onClick={() => router.push('/pos/customers/new')}
            style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: '#006AFF', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            👤 Add Customer
          </button>
          {['↑ Export', '↓ Import', '⊗ Merge'].map(label => (
            <button key={label} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: 'var(--shadow-sm)' }}>
              {label}
            </button>
          ))}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginLeft: 4 }}>{filtered.length} Results</span>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <label style={lblS}>Search</label>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Customers..." style={inS} />
      </div>

      {/* Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div>
          <label style={lblS}>Customer Group</label>
          <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
            style={{ ...inS, cursor: 'pointer' }}>
            <option value="">Select...</option>
            {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label style={lblS}>Price List</label>
          <select style={{ ...inS, cursor: 'pointer' }}>
            <option value="">Select...</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 6, overflow: 'hidden', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={hdr}>Customer</th>
              <th style={hdr}>Group</th>
              <th style={hdr}>Contact</th>
              <th style={hdr}>Spend / Loyalty</th>
              <th style={hdr}>Performance</th>
              <th style={hdr}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No customers found.{' '}
                <span onClick={() => router.push('/pos/customers/new')} style={{ color: '#006AFF', cursor: 'pointer' }}>Add one →</span>
              </td></tr>
            ) : filtered.map((c, i) => (
              <tr key={c.id}
                style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)')}>
                <td style={cell}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                  {c.phone && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.phone}</div>}
                </td>
                <td style={{ ...cell, color: 'var(--text-primary)' }}>{c.group_name || '—'}</td>
                <td style={{ ...cell, color: 'var(--text-secondary)' }}>{c.phone || c.email || '—'}</td>
                <td style={cell}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>${(Number(c.total_spend ?? 0)).toFixed(2)}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{c.visit_count ?? 0} visits</div>
                  {(c.loyalty_points ?? 0) > 0 && <div style={{ fontSize: 10, color: '#F59E0B', marginTop: 2 }}>⭐ {c.loyalty_points} pts</div>}
                </td>
                <td style={{ ...cell, padding: '8px 14px' }}>
                  <Sparkline values={performances[c.id] || []} />
                </td>
                <td style={cell}>
                  <div style={{ display: 'flex', gap: 14 }}>
                    <span onClick={() => router.push(`/pos/customers/${c.id}`)} style={{ color: '#2196f3', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>👁 View</span>
                    <span onClick={() => router.push(`/pos/customers/${c.id}/edit`)} style={{ color: '#4caf50', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>✏️ Edit</span>
                    <span onClick={async () => { if (!confirm('Delete this customer?')) return; await fetch(`/api/pos/customers?id=${c.id}`, { method: 'DELETE' }); load() }} style={{ color: '#f44336', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>🗑 Delete</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
