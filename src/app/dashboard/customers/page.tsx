'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { SEGMENT_COLORS } from '@/lib/customer-segments'
import { calcRFM, TIER_COLOR, type RfmTier } from '@/lib/rfm'
import { AriaSays } from '@/components/dashboard/AriaSays'

const RFM_LABEL: Record<RfmTier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }

function RfmBadge({ tier, total }: { tier: RfmTier; total: number }) {
  const color = TIER_COLOR[tier]
  return (
    <span title={`RFM ${total}/15 (${tier})`} style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: color + '22', color, border: `1px solid ${color}55`, fontWeight: 700 }}>
      RFM · {RFM_LABEL[tier]}
    </span>
  )
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)',
  green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider)',
}
const INP: React.CSSProperties = {
  background: C.elevated, border: '1px solid ' + C.border, borderRadius: 8,
  padding: '8px 12px', color: C.text, fontSize: 14, width: '100%', outline: 'none',
}
const BTN = (v: 'primary' | 'ghost' | 'danger'): React.CSSProperties => ({
  fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
  background: v === 'primary' ? C.darkGreen : v === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
  color: v === 'primary' ? C.green : v === 'danger' ? '#ef4444' : C.muted,
  border: v === 'ghost' ? '1px solid ' + C.border : v === 'danger' ? '1px solid rgba(239,68,68,0.3)' : 'none',
})

interface Customer {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; address: string | null; city: string | null; postcode: string | null
  tags: string[] | null; notes: string | null; source: string | null
  customer_segment: string | null; churn_risk: string | null; loyalty_points: number | null
  visit_count: number | null; total_spent: number | null; total_spend: number | null
  last_visit: string | null; ai_summary: string | null; ai_summary_at: string | null
  archived: boolean; created_at: string
}
interface AiIntel {
  summary?: string; favourite_product?: string; visit_frequency?: string
  purchases?: Array<{ date: string; amount: number; items: string }>
}

const SEG_TABS = [
  { key: 'all', label: 'All' }, { key: 'champions', label: 'Champions' },
  { key: 'loyal', label: 'Loyal' }, { key: 'at_risk', label: 'At Risk' },
  { key: 'lost', label: 'Lost' }, { key: 'new', label: 'New' },
]
const FORM_FIELDS = ['name', 'email', 'phone', 'company', 'address', 'city', 'postcode', 'notes'] as const
const CSV_FIELDS = ['name', 'email', 'phone', 'company', 'address', 'city', 'postcode', 'notes', 'tags', 'ignore'] as const

function SegBadge({ seg }: { seg: string | null }) {
  const s = SEGMENT_COLORS[seg ?? 'unscored'] ?? SEGMENT_COLORS.unscored
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, fontWeight: 600 }}>{s.label}</span>
}
function tv(c: Customer) { return Number(c.total_spent ?? c.total_spend ?? 0) }
function daysSince(d: string | null) { return d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999 }
function matchSegTab(c: Customer, tab: string): boolean {
  if (tab === 'all') return true
  const seg = c.customer_segment; const d = daysSince(c.last_visit)
  const isNew = daysSince(c.created_at) < 30
  if (tab === 'champions') return seg === 'champions'
  if (tab === 'loyal') return seg === 'loyal' || seg === 'regular'
  if (tab === 'at_risk') return seg === 'at_risk' || seg === 'needs_attention' || (!seg && d >= 45 && d < 90)
  if (tab === 'lost') return seg === 'never_returned' || seg === 'hibernating' || (!seg && d >= 90)
  if (tab === 'new') return seg === 'new' || (!seg && isNew)
  return false
}
function buildCohortData(customers: Customer[]) {
  const m: Record<string, { total: number; d30: number; d60: number; d90: number }> = {}
  customers.forEach(c => {
    const k = c.created_at.slice(0, 7)
    if (!m[k]) m[k] = { total: 0, d30: 0, d60: 0, d90: 0 }
    m[k].total++
    const d = daysSince(c.last_visit)
    if (d <= 30) m[k].d30++; if (d <= 60) m[k].d60++; if (d <= 90) m[k].d90++
  })
  return Object.entries(m).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([k, v]) => ({
    month: k.slice(2),
    '30d': v.total ? Math.round(v.d30 / v.total * 100) : 0,
    '60d': v.total ? Math.round(v.d60 / v.total * 100) : 0,
    '90d': v.total ? Math.round(v.d90 / v.total * 100) : 0,
  }))
}

export default function CustomersPage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [activeSegment, setActiveSegment] = useState('all')
  const [sortByRfm, setSortByRfm] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [aiIntel, setAiIntel] = useState<AiIntel | null>(null)
  const [aiIntelLoading, setAiIntelLoading] = useState(false)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [formSaving, setFormSaving] = useState(false)
  const [importStep, setImportStep] = useState<0 | 1 | 2 | 3>(0)
  const [importJobId, setImportJobId] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    const p = new URLSearchParams({ business_id: bid, archived: String(showArchived) })
    if (search) p.set('q', search)
    const r = await fetch('/api/customers?' + p)
    const d = await r.json()
    setCustomers(d.customers ?? []); setLoading(false)
  }, [bid, search, showArchived])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!selected) { setAiIntel(null); return }
    setAiIntelLoading(true)
    fetch('/api/aria/customer-intel?customer_id=' + selected.id)
      .then(r => r.ok ? r.json() : null).then(d => setAiIntel(d))
      .catch(() => setAiIntel(null)).finally(() => setAiIntelLoading(false))
  }, [selected?.id])

  const openForm = (mode: 'add' | 'edit') => {
    setForm(mode === 'edit' && selected ? {
      name: selected.name ?? '', email: selected.email ?? '', phone: selected.phone ?? '',
      company: selected.company ?? '', address: selected.address ?? '', city: selected.city ?? '',
      postcode: selected.postcode ?? '', notes: selected.notes ?? '',
    } : {})
    setFormMode(mode)
  }
  const saveForm = async () => {
    if (!bid || !form.name?.trim()) return
    setFormSaving(true)
    if (formMode === 'add') {
      await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ...form }) })
    } else if (selected) {
      const res = await fetch('/api/customers/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (res.ok) { const d = await res.json(); setSelected(d.customer) }
    }
    setFormMode(null); setFormSaving(false); load()
  }
  const archiveCustomer = async (id: string) => {
    await fetch('/api/customers/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ archived: true }) })
    setSelected(null); load()
  }
  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const headers = res.meta.fields ?? []
        setCsvHeaders(headers); setCsvRows(res.data); setImportLoading(true)
        const r = await fetch('/api/customers/import-map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: bid, fileName: file.name, headers, sampleRows: res.data.slice(0, 20) }) })
        const d = await r.json()
        setImportJobId(d.jobId ?? ''); setMapping(d.mapping ?? {}); setImportLoading(false); setImportStep(2)
      },
    })
    setImportStep(1)
  }
  const runImport = async () => {
    setImportLoading(true)
    const r = await fetch('/api/customers/import-run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: importJobId, businessId: bid, mapping, rows: csvRows }) })
    const d = await r.json()
    setImportResult(d); setImportLoading(false); setImportStep(3); load()
  }
  const summarise = async () => {
    if (!selected || !bid) return
    setSummaryLoading(true)
    const r = await fetch('/api/customers/' + selected.id + '/summarise', { method: 'POST' })
    const d = await r.json()
    if (d.summary) setSelected(s => s ? { ...s, ai_summary: d.summary } : s)
    setSummaryLoading(false)
  }
  const toggleCheck = (id: string) => setCheckedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const exportCSV = () => {
    const rows = customers.filter(c => checkedIds.has(c.id))
    const csv = ['Name,Email,Phone,LTV,Visits,Segment', ...rows.map(c => `"${c.name}","${c.email ?? ''}","${c.phone ?? ''}","${tv(c)}","${c.visit_count ?? 0}","${c.customer_segment ?? ''}"`)].join('\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'customers.csv'; a.click()
  }
  const markLapsed = async () => {
    await Promise.all([...checkedIds].map(id => fetch('/api/customers/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_segment: 'hibernating' }) })))
    setCheckedIds(new Set()); load()
  }

  const filteredBase = customers.filter(c => matchSegTab(c, activeSegment))
  const filtered = sortByRfm
    ? [...filteredBase].sort((a, b) => calcRFM(tv(b), b.visit_count ?? 0, b.last_visit).total - calcRFM(tv(a), a.visit_count ?? 0, a.last_visit).total)
    : filteredBase
  const segCounts: Record<string, number> = Object.fromEntries(SEG_TABS.map(t => [t.key, t.key === 'all' ? customers.length : customers.filter(c => matchSegTab(c, t.key)).length]))
  const cohortData = buildCohortData(customers)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '16px 24px 0' }}>
        <AriaSays businessId={business?.id ?? null} page="customers" />
      </div>
      {importStep > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Import customers</h3>
              <button onClick={() => { setImportStep(0); setImportResult(null) }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            {importStep === 1 && <div style={{ textAlign: 'center', color: C.muted, padding: '20px 0' }}><p style={{ fontSize: 14 }}>Analysing columns with Aria…</p></div>}
            {importStep === 2 && (
              <>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Review column mapping — correct any mismatches before importing.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {csvHeaders.map(h => (
                    <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                      <select value={mapping[h] ?? 'ignore'} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))} style={{ ...INP, padding: '6px 10px' }}>
                        {CSV_FIELDS.map(f => <option key={f} value={f} style={{ background: '#1a2420' }}>{f}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{csvRows.length} rows to import</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={runImport} disabled={importLoading} style={BTN('primary')}>{importLoading ? 'Importing…' : `Import ${csvRows.length} rows`}</button>
                  <button onClick={() => setImportStep(0)} style={BTN('ghost')}>Cancel</button>
                </div>
              </>
            )}
            {importStep === 3 && importResult && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 32, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green, marginBottom: 8 }}>{importResult.imported}</div>
                <p style={{ fontSize: 14 }}>customers imported</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{importResult.skipped} skipped</p>
                <button onClick={() => { setImportStep(0); setImportResult(null) }} style={{ ...BTN('primary'), marginTop: 16 }}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {formMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{formMode === 'add' ? 'Add customer' : 'Edit customer'}</h3>
              <button onClick={() => setFormMode(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FORM_FIELDS.map(f => (
                <div key={f}>
                  <label style={{ fontSize: 11, color: C.muted, textTransform: 'capitalize', display: 'block', marginBottom: 4 }}>{f}{f === 'name' ? ' *' : ''}</label>
                  {f === 'notes' ? <textarea value={form[f] ?? ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} rows={3} style={{ ...INP, resize: 'vertical' }} /> : <input value={form[f] ?? ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} style={INP} />}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={saveForm} disabled={formSaving || !form.name?.trim()} style={{ ...BTN('primary'), opacity: !form.name?.trim() ? 0.5 : 1 }}>{formSaving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setFormMode(null)} style={BTN('ghost')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: 24, overflowY: 'auto', paddingRight: selected ? 408 : 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Customers</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{filtered.length} {showArchived ? 'archived' : 'active'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="file" ref={fileRef} accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            <button onClick={() => fileRef.current?.click()} style={BTN('ghost')}>↑ Import CSV</button>
            <button onClick={() => openForm('add')} style={BTN('primary')}>+ Add customer</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {SEG_TABS.map(t => (
            <button key={t.key} onClick={() => setActiveSegment(t.key)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, background: activeSegment === t.key ? C.darkGreen : 'transparent', color: activeSegment === t.key ? C.green : C.muted, border: '1px solid ' + (activeSegment === t.key ? C.green + '44' : C.border) }}>
              {t.label} <span style={{ opacity: 0.6 }}>{segCounts[t.key]}</span>
            </button>
          ))}
          <button onClick={() => setSortByRfm(v => !v)}
            title="Sort by RFM score (Recency × Frequency × Monetary)"
            style={{ marginLeft: 'auto', fontSize: 12, padding: '5px 12px', borderRadius: 20, cursor: 'pointer', fontWeight: 600, background: sortByRfm ? C.darkGreen : 'transparent', color: sortByRfm ? C.green : C.muted, border: '1px solid ' + (sortByRfm ? C.green + '44' : C.border) }}>
            {sortByRfm ? '✓ Sorted by RFM' : 'Sort by RFM'}
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…" style={{ ...INP, width: 220, flex: '0 0 auto' }} />
          <label style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived
          </label>
        </div>

        {loading ? <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p> : filtered.length === 0 ? <p style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No customers found.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(c => {
              const d = daysSince(c.last_visit)
              const arrow = d <= 30 ? '↑' : d >= 90 ? '↓' : ''
              const rfm = calcRFM(tv(c), c.visit_count ?? 0, c.last_visit)
              return (
                <div key={c.id} style={{ background: selected?.id === c.id ? 'rgba(127,184,151,0.08)' : C.card, borderRadius: 12, padding: '10px 16px', border: '1px solid ' + (selected?.id === c.id ? C.green + '44' : C.border), display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={checkedIds.has(c.id)} onClick={e => { e.stopPropagation(); toggleCheck(c.id) }} onChange={() => {}} style={{ cursor: 'pointer', accentColor: C.green }} />
                  <div onClick={() => setSelected(c)} style={{ cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                      <SegBadge seg={c.customer_segment} />
                      <RfmBadge tier={rfm.tier} total={rfm.total} />
                      {c.archived && <span style={{ fontSize: 10, color: C.muted }}>archived</span>}
                      {(c.tags ?? []).slice(0, 2).map(t => <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(127,184,151,0.1)', color: C.green }}>{t}</span>)}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{c.email ?? c.phone ?? '—'} · {c.visit_count ?? 0} visits · last {c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-AU') : 'never'}</div>
                  </div>
                  <div onClick={() => setSelected(c)} style={{ textAlign: 'right', cursor: 'pointer' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green }}>
                      ${tv(c).toLocaleString('en-AU', { maximumFractionDigits: 0 })}
                      {arrow && <span style={{ fontSize: 11, color: arrow === '↑' ? '#4ade80' : '#f87171', marginLeft: 3 }}>{arrow}</span>}
                    </div>
                    <div style={{ fontSize: 9, color: C.muted }}>LTV</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {checkedIds.size > 0 && (
          <div style={{ position: 'sticky', bottom: 16, marginTop: 12, padding: '12px 20px', borderRadius: 12, background: C.card, border: '1px solid ' + C.border, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <span style={{ fontSize: 12, color: C.muted }}>{checkedIds.size} selected</span>
            <button onClick={exportCSV} style={BTN('ghost')}>Export CSV</button>
            <button style={BTN('ghost')}>Send SMS</button>
            <button style={BTN('ghost')}>Tag segment</button>
            <button onClick={markLapsed} style={BTN('danger')}>Mark lapsed</button>
            <button onClick={() => setCheckedIds(new Set())} style={{ ...BTN('ghost'), marginLeft: 'auto' }}>Clear</button>
          </div>
        )}

        {cohortData.length > 0 && (
          <div style={{ marginTop: 32, padding: 20, background: C.card, borderRadius: 14, border: '1px solid ' + C.border }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Cohort Retention</h3>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>% of acquired customers still active at 30 / 60 / 90 days</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={cohortData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ background: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} formatter={(v) => `${String(v ?? '')}%`} />
                <Bar dataKey="30d" fill="#7FB897" radius={[3, 3, 0, 0]} />
                <Bar dataKey="60d" fill="#4a8a6a" radius={[3, 3, 0, 0]} />
                <Bar dataKey="90d" fill="#2D5240" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              {[['#7FB897', '30d'], ['#4a8a6a', '60d'], ['#2D5240', '90d']].map(([col, lbl]) => (
                <span key={lbl} style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: col, display: 'inline-block' }} />{lbl}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <div style={{ position: 'fixed', right: 0, top: 0, width: 380, height: '100vh', borderLeft: '1px solid ' + C.border, padding: 24, overflowY: 'auto', background: C.card, zIndex: 30 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div><h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{selected.name}</h2><SegBadge seg={selected.customer_segment} /></div>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[{ label: 'LTV', value: '$' + tv(selected).toLocaleString('en-AU', { maximumFractionDigits: 0 }) }, { label: 'Visits', value: String(selected.visit_count ?? 0) }, { label: 'Points', value: String(selected.loyalty_points ?? 0) }].map(({ label, value }) => (
              <div key={label} style={{ background: C.elevated, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{value}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 14, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selected.email && <div><span style={{ color: C.muted }}>Email: </span>{selected.email}</div>}
            {selected.phone && <div><span style={{ color: C.muted }}>Phone: </span>{selected.phone}</div>}
            <div><span style={{ color: C.muted }}>Last visit: </span>{selected.last_visit ? new Date(selected.last_visit).toLocaleDateString('en-AU') : 'never'}</div>
            <div><span style={{ color: C.muted }}>Source: </span>{selected.source ?? 'pos'}</div>
          </div>
          <div style={{ marginBottom: 16, padding: 14, background: 'rgba(127,184,151,0.06)', borderRadius: 10, border: '1px solid rgba(127,184,151,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Aria Intel</p>
              <button onClick={summarise} disabled={summaryLoading} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', opacity: summaryLoading ? 0.6 : 1 }}>{summaryLoading ? 'Thinking…' : selected.ai_summary ? 'Refresh' : 'Summarise'}</button>
            </div>
            {aiIntelLoading && <p style={{ fontSize: 12, color: C.muted }}>Loading intel…</p>}
            {!aiIntelLoading && (aiIntel?.summary ?? selected.ai_summary)
              ? <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{aiIntel?.summary ?? selected.ai_summary}</p>
              : !aiIntelLoading && <p style={{ fontSize: 12, color: C.muted }}>No summary yet.</p>}
            {aiIntel?.favourite_product && <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Favourite: <span style={{ color: C.text }}>{aiIntel.favourite_product}</span></p>}
            {aiIntel?.visit_frequency && <p style={{ fontSize: 12, color: C.muted }}>Frequency: <span style={{ color: C.text }}>{aiIntel.visit_frequency}</span></p>}
          </div>
          {aiIntel?.purchases && aiIntel.purchases.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>Recent purchases</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {aiIntel.purchases.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 10px', background: C.elevated, borderRadius: 8 }}>
                    <span style={{ color: C.muted }}>{new Date(p.date).toLocaleDateString('en-AU')}</span>
                    <span style={{ color: C.text }}>{p.items}</span>
                    <span style={{ color: C.green }}>${p.amount.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {daysSince(selected.last_visit) >= 45 && (
            <div style={{ marginBottom: 16, padding: 12, background: 'rgba(239,159,39,0.08)', borderRadius: 10, border: '1px solid rgba(239,159,39,0.2)' }}>
              <p style={{ fontSize: 12, color: '#efb52a', marginBottom: 8 }}>Lapsed {daysSince(selected.last_visit)} days ago</p>
              <button style={{ fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, background: 'rgba(239,159,39,0.15)', color: '#efb52a', border: '1px solid rgba(239,159,39,0.3)' }}>Send winback message</button>
            </div>
          )}
          {selected.notes && <div style={{ marginBottom: 16, fontSize: 13 }}><p style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Notes</p><p style={{ lineHeight: 1.5 }}>{selected.notes}</p></div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => openForm('edit')} style={BTN('primary')}>Edit</button>
            {!selected.archived && <button onClick={() => archiveCustomer(selected.id)} style={BTN('danger')}>Archive</button>}
          </div>
        </div>
      )}
    </div>
  )
}
