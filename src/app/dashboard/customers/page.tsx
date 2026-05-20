'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { SEGMENT_COLORS, SEGMENT_ORDER } from '@/lib/customer-segments'

const C = { bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)', text: 'var(--text-primary)', muted: 'var(--text-secondary)', green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider)', red: '#ef4444', amber: '#f59e0b' }
const INP: React.CSSProperties = { background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 14, width: '100%', outline: 'none' }

interface Customer {
  id: string; name: string; email: string | null; phone: string | null
  birthday: string | null; tags: string[] | null; marketing_consent: boolean | null
  segment: string | null; rfm_score_total: number | null; notes: string | null
  total_spent: number | null; total_spend: number | null
  visit_count: number | null; last_visit: string | null; last_visit_at: string | null
  lifetime_value_cents: number | null; days_since_visit: number | null
  points_balance: number | null; stamps_count: number | null
  created_at: string
}

const SORT_OPTIONS = [
  { value: 'spend', label: 'Top spenders' },
  { value: 'visit_count', label: 'Most visits' },
  { value: 'last_visit', label: 'Recent visit' },
  { value: 'created_at', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
]

function lv(c: Customer) { return c.last_visit_at ?? c.last_visit ?? null }
function tv(c: Customer) { return c.total_spend ?? c.total_spent ?? 0 }

function SegmentBadge({ segment }: { segment: string | null }) {
  const s = SEGMENT_COLORS[segment ?? 'unscored'] ?? SEGMENT_COLORS.unscored
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.label}</span>
}

export default function CustomersPage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [segment, setSegment] = useState('')
  const [sort, setSort] = useState('spend')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [activity, setActivity] = useState<Array<{ id: string; type: string; content: string | null; amount_cents: number | null; created_at: string }>>([])
  const [tagInput, setTagInput] = useState('')
  const [exporting, setExporting] = useState(false)
  const [bulkAction, setBulkAction] = useState('')

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    const params = new URLSearchParams({ business_id: bid, sort, limit: '200' })
    if (search) params.set('q', search)
    if (segment) params.set('segment', segment)
    const r = await fetch(`/api/pos/customers?${params}`)
    const d = await r.json()
    setCustomers(d.customers ?? [])
    setLoading(false)
  }, [bid, search, segment, sort])

  useEffect(() => { load() }, [load])

  const loadActivity = async (customerId: string) => {
    const r = await fetch(`/api/pos/customers/${customerId}/activity`)
    const d = await r.json()
    setActivity(d.activity ?? [])
  }

  const openCustomer = (c: Customer) => {
    setSelectedCustomer(c)
    setNoteText('')
    loadActivity(c.id)
  }

  const saveNote = async () => {
    if (!noteText.trim() || !selectedCustomer || !bid) return
    setSavingNote(true)
    await fetch(`/api/pos/customers/${selectedCustomer.id}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid, type: 'note', content: noteText }),
    })
    setNoteText('')
    loadActivity(selectedCustomer.id)
    setSavingNote(false)
  }

  const addTag = async (tag: string) => {
    if (!selectedCustomer || !tag.trim()) return
    const newTags = [...(selectedCustomer.tags ?? []), tag.trim()]
    await fetch(`/api/pos/customers/${selectedCustomer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    setSelectedCustomer(c => c ? { ...c, tags: newTags } : c)
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, tags: newTags } : c))
    setTagInput('')
  }

  const removeTag = async (tag: string) => {
    if (!selectedCustomer) return
    const newTags = (selectedCustomer.tags ?? []).filter(t => t !== tag)
    await fetch(`/api/pos/customers/${selectedCustomer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: newTags }),
    })
    setSelectedCustomer(c => c ? { ...c, tags: newTags } : c)
    setCustomers(prev => prev.map(c => c.id === selectedCustomer.id ? { ...c, tags: newTags } : c))
  }

  const exportCSV = () => {
    setExporting(true)
    const rows = [
      ['Name','Email','Phone','Segment','Total Spent','Visits','Last Visit','Points','Marketing Consent','Tags','Birthday','Notes'].join(','),
      ...customers.map(c => [
        `"${c.name}"`,
        c.email ?? '',
        c.phone ?? '',
        c.segment ?? '',
        (tv(c) || 0).toFixed(2),
        c.visit_count ?? 0,
        lv(c) ? new Date(lv(c)!).toLocaleDateString('en-AU') : '',
        c.points_balance ?? 0,
        c.marketing_consent ? 'Yes' : 'No',
        `"${(c.tags ?? []).join('; ')}"`,
        c.birthday ?? '',
        `"${c.notes ?? ''}"`,
      ].join(','))
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `customers-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const selectAll = () => setSelected(new Set(customers.map(c => c.id)))
  const clearSelect = () => setSelected(new Set())

  const handleBulkAction = async () => {
    if (!bulkAction || selected.size === 0) return
    const ids = Array.from(selected)
    if (bulkAction === 'consent_on') {
      await Promise.all(ids.map(id => fetch(`/api/pos/customers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketing_consent: true }) })))
    } else if (bulkAction === 'consent_off') {
      await Promise.all(ids.map(id => fetch(`/api/pos/customers/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketing_consent: false }) })))
    } else if (bulkAction === 'export_selected') {
      const sel = customers.filter(c => selected.has(c.id))
      const rows = [['Name','Email','Phone','Segment'].join(','), ...sel.map(c => [c.name, c.email ?? '', c.phone ?? '', c.segment ?? ''].join(','))].join('\n')
      const blob = new Blob([rows], { type: 'text/csv' })
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'selected-customers.csv'; a.click()
    }
    clearSelect(); setBulkAction(''); load()
  }

  const total = customers.length
  const withConsent = customers.filter(c => c.marketing_consent).length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', display: 'flex' }}>
      {/* Main list */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', maxWidth: selectedCustomer ? 600 : '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>Customers</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{total} total · {withConsent} marketing consent</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportCSV} disabled={exporting} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: 'transparent', color: C.green, border: `1px solid ${C.green}44`, cursor: 'pointer' }}>
              {exporting ? 'Exporting…' : '↓ Export CSV'}
            </button>
            <Link href="/dashboard/customers/new" style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: C.darkGreen, color: C.green, textDecoration: 'none', fontWeight: 600 }}>
              + Add customer
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
            style={{ ...INP, width: 220, flex: '0 0 auto' }} />
          <select value={segment} onChange={e => setSegment(e.target.value)} style={{ ...INP, width: 160, flex: '0 0 auto' }}>
            <option value="">All segments</option>
            {SEGMENT_ORDER.map(s => <option key={s} value={s} style={{ background: '#1a2420' }}>{SEGMENT_COLORS[s]?.label ?? s}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...INP, width: 150, flex: '0 0 auto' }}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value} style={{ background: '#1a2420' }}>{o.label}</option>)}
          </select>
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', padding: '10px 14px', background: 'rgba(127,184,151,0.08)', borderRadius: 10, border: `1px solid ${C.green}33` }}>
            <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>{selected.size} selected</span>
            <select value={bulkAction} onChange={e => setBulkAction(e.target.value)} style={{ ...INP, width: 'auto', flex: 'none' }}>
              <option value="">Bulk action…</option>
              <option value="consent_on" style={{ background: '#1a2420' }}>Enable marketing consent</option>
              <option value="consent_off" style={{ background: '#1a2420' }}>Disable marketing consent</option>
              <option value="export_selected" style={{ background: '#1a2420' }}>Export selected</option>
            </select>
            <button onClick={handleBulkAction} disabled={!bulkAction} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer' }}>Apply</button>
            <button onClick={clearSelect} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Clear</button>
          </div>
        )}

        {/* Select all row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, fontSize: 12, color: C.muted }}>
          <input type="checkbox" checked={selected.size === customers.length && customers.length > 0} onChange={selected.size === customers.length ? clearSelect : selectAll} />
          <span>Select all</span>
        </div>

        {/* Customer list */}
        {loading ? (
          <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>
        ) : customers.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No customers found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customers.map(c => (
              <div key={c.id} onClick={() => openCustomer(c)}
                style={{ background: selectedCustomer?.id === c.id ? 'rgba(127,184,151,0.08)' : C.card, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', border: `1px solid ${selectedCustomer?.id === c.id ? C.green + '44' : C.border}`, display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 12, alignItems: 'center' }}>
                <input type="checkbox" checked={selected.has(c.id)} onClick={e => e.stopPropagation()} onChange={() => toggleSelect(c.id)} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    <SegmentBadge segment={c.segment} />
                    {c.marketing_consent && <span style={{ fontSize: 10, color: C.green }}>✓ SMS</span>}
                    {(c.tags ?? []).slice(0,2).map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(127,184,151,0.1)', color: C.green }}>{t}</span>)}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {c.email ?? c.phone ?? '—'} · {c.visit_count ?? 0} visits · last {lv(c) ? new Date(lv(c)!).toLocaleDateString('en-AU') : 'never'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green }}>${(tv(c) || 0).toFixed(0)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{c.points_balance ?? 0} pts</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Customer detail panel */}
      {selectedCustomer && (
        <div style={{ width: 380, borderLeft: `1px solid ${C.border}`, padding: 24, overflowY: 'auto', background: C.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{selectedCustomer.name}</h2>
              <SegmentBadge segment={selectedCustomer.segment} />
            </div>
            <button onClick={() => setSelectedCustomer(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Total spent', value: `$${(tv(selectedCustomer) || 0).toFixed(0)}` },
              { label: 'Visits', value: String(selectedCustomer.visit_count ?? 0) },
              { label: 'Points', value: String(selectedCustomer.points_balance ?? 0) },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.elevated, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{value}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Contact info */}
          <div style={{ marginBottom: 16, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selectedCustomer.email && <div><span style={{ color: C.muted }}>Email: </span>{selectedCustomer.email}</div>}
            {selectedCustomer.phone && <div><span style={{ color: C.muted }}>Phone: </span>{selectedCustomer.phone}</div>}
            {selectedCustomer.birthday && <div><span style={{ color: C.muted }}>Birthday: </span>{selectedCustomer.birthday}</div>}
            <div><span style={{ color: C.muted }}>Marketing: </span><span style={{ color: selectedCustomer.marketing_consent ? C.green : C.muted }}>{selectedCustomer.marketing_consent ? '✓ Consented' : 'Not consented'}</span></div>
            <div><span style={{ color: C.muted }}>Customer since: </span>{new Date(selectedCustomer.created_at).toLocaleDateString('en-AU')}</div>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Tags</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {(selectedCustomer.tags ?? []).map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(127,184,151,0.12)', color: C.green, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {t}
                  <button onClick={() => removeTag(t)} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1 }}>×</button>
                </span>
              ))}
              {(selectedCustomer.tags ?? []).length === 0 && <span style={{ fontSize: 12, color: C.muted }}>No tags</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag(tagInput)} placeholder="Add tag…" style={{ ...INP, flex: 1 }} />
              <button onClick={() => addTag(tagInput)} style={{ padding: '7px 12px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontSize: 12 }}>Add</button>
            </div>
          </div>

          {/* Notes + activity */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Notes & activity</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <input value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveNote()} placeholder="Add a note…" style={{ ...INP, flex: 1 }} />
              <button onClick={saveNote} disabled={savingNote || !noteText.trim()} style={{ padding: '7px 12px', borderRadius: 8, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', fontSize: 12, opacity: !noteText.trim() ? 0.5 : 1 }}>Save</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activity.slice(0, 10).map(a => (
                <div key={a.id} style={{ fontSize: 12, padding: '8px 10px', background: C.elevated, borderRadius: 8, borderLeft: `3px solid ${a.type === 'note' ? C.green : a.type === 'sale' ? '#60a5fa' : C.muted}` }}>
                  <span style={{ color: C.muted, fontSize: 10, float: 'right' }}>{new Date(a.created_at).toLocaleDateString('en-AU')}</span>
                  <span style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', marginRight: 6 }}>{a.type}</span>
                  {a.content}
                  {a.amount_cents != null && <span style={{ color: C.green }}> ${(a.amount_cents / 100).toFixed(2)}</span>}
                </div>
              ))}
              {activity.length === 0 && <p style={{ fontSize: 12, color: C.muted }}>No activity yet.</p>}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href={`/dashboard/customers/${selectedCustomer.id}`} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: C.darkGreen, color: C.green, textDecoration: 'none', fontWeight: 600 }}>Full profile →</Link>
            <button onClick={() => { navigator.clipboard.writeText(selectedCustomer.phone ?? selectedCustomer.email ?? '') }} style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, background: 'transparent', color: C.muted, border: `1px solid ${C.border}`, cursor: 'pointer' }}>Copy contact</button>
          </div>
        </div>
      )}
    </div>
  )
}
