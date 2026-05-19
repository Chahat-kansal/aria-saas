'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { SEGMENT_COLORS, SEGMENT_ORDER } from '@/lib/customer-segments'

type Customer = {
  id: string; name: string; email: string | null; phone: string | null
  total_spent: number | null; total_spend: number | null
  visit_count: number | null; last_visit: string | null; last_visit_at: string | null
  loyalty_points: number | null; points_balance: number | null
  tags: string[] | null; marketing_consent: boolean | null
  segment: string | null; rfm_score_total: number | null
  lifetime_value_cents: number | null; days_since_visit: number | null
}
type SegmentCounts = Record<string, number> & { total?: number }

const SORT_LABELS: Record<string, string> = { spend: 'Top spenders', visit_count: 'Most visits', last_visit: 'Recent visit', name: 'Name A–Z' }

function coalesce(...vals: (number | null | undefined)[]) {
  for (const v of vals) if (v != null) return Number(v)
  return 0
}
function lv(c: Customer) { return c.last_visit_at ?? c.last_visit ?? null }

function SegmentBadge({ segment }: { segment: string | null }) {
  const s = SEGMENT_COLORS[segment ?? 'unscored'] ?? SEGMENT_COLORS.unscored
  return <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: s.bg, color: s.text }}>{s.label}</span>
}

function relDate(iso: string | null) {
  if (!iso) return '—'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d}d ago`
  if (d < 365) return `${Math.floor(d / 30)}mo ago`
  return `${Math.floor(d / 365)}y ago`
}

export default function CustomersPage() {
  const { business } = useBusinessContext()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [segCounts, setSegCounts] = useState<SegmentCounts>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('')
  const [sort, setSort] = useState('spend')
  const [page, setPage] = useState(0)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState('')

  const loadSegments = useCallback(async () => {
    if (!business?.id) return
    const r = await fetch(`/api/customers/segments?business_id=${business.id}`)
    if (r.ok) setSegCounts(await r.json())
  }, [business?.id])

  const load = useCallback(async (q: string, seg: string, s: string, p: number) => {
    if (!business?.id) return
    setLoading(true)
    const params = new URLSearchParams({ business_id: business.id, sort: s, page: String(p) })
    if (q) params.set('q', q)
    if (seg) params.set('segment', seg)
    const r = await fetch(`/api/customers?${params}`)
    if (r.ok) {
      const j = await r.json()
      setCustomers(j.customers ?? [])
    }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { loadSegments() }, [loadSegments])
  useEffect(() => {
    const t = setTimeout(() => { setPage(0); load(search, segment, sort, 0) }, 300)
    return () => clearTimeout(t)
  }, [search, segment, sort, load])

  const importSquare = async () => {
    if (!business?.id) return
    setImporting(true); setImportMsg('')
    const r = await fetch('/api/customers/import/square', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: business.id }),
    })
    const j = await r.json()
    setImportMsg(r.ok ? `Imported ${j.imported} customers from Square` : (j.error ?? 'Import failed'))
    setImporting(false)
    if (r.ok) { load(search, segment, sort, page); loadSegments() }
  }

  return (
    <div className="p-6 max-w-7xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-medium">Customers</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            {segCounts.total ? `${segCounts.total} total` : ''}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {importMsg && <span className="text-xs" style={{ color: importMsg.startsWith('Imported') ? '#7FB897' : '#ef4444' }}>{importMsg}</span>}
          <button onClick={importSquare} disabled={importing} className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
            style={{ background: 'rgba(45,82,64,0.3)', border: '1px solid rgba(45,82,64,0.5)', color: '#7FB897' }}>
            {importing ? 'Importing…' : 'Import from Square'}
          </button>
        </div>
      </header>

      {/* Segment pills */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setSegment('')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${segment === '' ? 'bg-[#2D5240] text-[#7FB897]' : 'bg-[rgba(255,255,255,0.06)] hover:bg-[rgba(255,255,255,0.1)]'}`}
          style={{ border: segment === '' ? '1px solid rgba(127,184,151,0.4)' : '1px solid transparent', color: segment === '' ? '#7FB897' : 'var(--text-secondary, #A8B5A8)' }}>
          All <span className="opacity-60">({segCounts.total ?? 0})</span>
        </button>
        {SEGMENT_ORDER.map(seg => {
          const count = segCounts[seg] ?? 0
          if (!count) return null
          const c = SEGMENT_COLORS[seg]
          return (
            <button key={seg} onClick={() => setSegment(segment === seg ? '' : seg)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors`}
              style={{ background: segment === seg ? '#2D5240' : c.bg, color: segment === seg ? '#7FB897' : c.text, border: `1px solid ${segment === seg ? 'rgba(127,184,151,0.4)' : 'transparent'}` }}>
              {c.label} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      {/* Controls */}
      <div className="flex gap-3 flex-wrap">
        <input type="text" placeholder="Search name, email, phone…" value={search} onChange={e => setSearch(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm w-64"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-primary, #E8EDE7)' }} />
        <select value={sort} onChange={e => setSort(e.target.value)} className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))', color: 'var(--text-primary, #E8EDE7)' }}>
          {Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : customers.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          <p className="text-lg mb-2">No customers found.</p>
          <p className="text-sm">Customers appear automatically when sales are recorded in Aria POS.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-elevated, #1A2620)', borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                  {['Customer', 'Phone', 'Last visit', 'Lifetime spend', 'Visits', 'Segment', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs uppercase tracking-wide font-medium" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {customers.map(c => {
                  const spend = c.lifetime_value_cents != null ? Number(c.lifetime_value_cents) / 100 : coalesce(c.total_spent, c.total_spend)
                  const visits = coalesce(c.visit_count)
                  const lastV = lv(c)
                  const initials = (c.name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <tr key={c.id} className="hover:bg-white/[0.02] transition-colors" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0 bg-[#2D5240]">{initials}</div>
                          <div>
                            <div className="font-medium">{c.name}</div>
                            <div className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.email ?? ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{c.phone ?? '—'}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{relDate(lastV)}</td>
                      <td className="px-4 py-3 font-medium">${spend.toFixed(2)}</td>
                      <td className="px-4 py-3" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{visits}</td>
                      <td className="px-4 py-3"><SegmentBadge segment={c.segment} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/customers/${c.id}`} className="text-xs hover:underline" style={{ color: '#7FB897' }}>View →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3 justify-end">
            {page > 0 && <button onClick={() => { setPage(p => p - 1); load(search, segment, sort, page - 1) }} className="px-3 py-1.5 text-xs rounded-lg" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>← Prev</button>}
            {customers.length === 50 && <button onClick={() => { setPage(p => p + 1); load(search, segment, sort, page + 1) }} className="px-3 py-1.5 text-xs rounded-lg" style={{ border: '1px solid var(--divider)', color: 'var(--text-secondary)' }}>Next →</button>}
          </div>
        </>
      )}
    </div>
  )
}
