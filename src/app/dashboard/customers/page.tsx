'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Papa from 'papaparse'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import { SEGMENT_COLORS } from '@/lib/customer-segments'

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)',
  green: '#7FB897', darkGreen: '#2D5240', border: 'var(--divider)',
}
const INP: React.CSSProperties = {
  background: C.elevated, border: '1px solid ' + C.border, borderRadius: 8,
  padding: '8px 12px', color: C.text, fontSize: 14, width: '100%', outline: 'none',
}
const BTN = (variant: 'primary' | 'ghost' | 'danger'): React.CSSProperties => ({
  fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600,
  background: variant === 'primary' ? C.darkGreen : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'transparent',
  color: variant === 'primary' ? C.green : variant === 'danger' ? '#ef4444' : C.muted,
  border: variant === 'ghost' ? '1px solid ' + C.border : variant === 'danger' ? '1px solid rgba(239,68,68,0.3)' : 'none',
})

interface Customer {
  id: string; name: string; email: string | null; phone: string | null
  company: string | null; address: string | null; city: string | null; postcode: string | null
  tags: string[] | null; notes: string | null; source: string | null
  customer_segment: string | null; churn_risk: string | null
  visit_count: number | null; total_spent: number | null; total_spend: number | null
  last_visit: string | null; ai_summary: string | null; ai_summary_at: string | null
  archived: boolean; created_at: string
}

const FORM_FIELDS = ['name', 'email', 'phone', 'company', 'address', 'city', 'postcode', 'notes'] as const
const CSV_FIELDS = ['name', 'email', 'phone', 'company', 'address', 'city', 'postcode', 'notes', 'tags', 'ignore'] as const

function SegBadge({ seg }: { seg: string | null }) {
  const s = SEGMENT_COLORS[seg ?? 'unscored'] ?? SEGMENT_COLORS.unscored
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, fontWeight: 600 }}>{s.label}</span>
}
function tv(c: Customer) { return Number(c.total_spent ?? c.total_spend ?? 0) }

export default function CustomersPage() {
  const { business } = useBusinessContext()
  const bid = business?.id

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState<Customer | null>(null)

  // Add/Edit form
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [formSaving, setFormSaving] = useState(false)

  // CSV import
  const [importStep, setImportStep] = useState<0 | 1 | 2 | 3>(0)
  const [importJobId, setImportJobId] = useState('')
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // AI summary
  const [summaryLoading, setSummaryLoading] = useState(false)

  const load = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    const p = new URLSearchParams({ business_id: bid, archived: String(showArchived) })
    if (search) p.set('q', search)
    const r = await fetch('/api/customers?' + p)
    const d = await r.json()
    setCustomers(d.customers ?? [])
    setLoading(false)
  }, [bid, search, showArchived])

  useEffect(() => { load() }, [load])

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
      await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: bid, ...form }),
      })
    } else if (selected) {
      const res = await fetch('/api/customers/' + selected.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const d = await res.json()
        setSelected(d.customer)
      }
    }
    setFormMode(null)
    setFormSaving(false)
    load()
  }

  const archiveCustomer = async (id: string) => {
    await fetch('/api/customers/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    setSelected(null)
    load()
  }

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true, skipEmptyLines: true,
      complete: async (res) => {
        const headers = res.meta.fields ?? []
        setCsvHeaders(headers)
        setCsvRows(res.data)
        setImportLoading(true)
        const r = await fetch('/api/customers/import-map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: bid, fileName: file.name, headers, sampleRows: res.data.slice(0, 20) }),
        })
        const d = await r.json()
        setImportJobId(d.jobId ?? '')
        setMapping(d.mapping ?? {})
        setImportLoading(false)
        setImportStep(2)
      },
    })
    setImportStep(1)
  }

  const runImport = async () => {
    setImportLoading(true)
    const r = await fetch('/api/customers/import-run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId: importJobId, businessId: bid, mapping, rows: csvRows }),
    })
    const d = await r.json()
    setImportResult(d)
    setImportLoading(false)
    setImportStep(3)
    load()
  }

  const summarise = async () => {
    if (!selected || !bid) return
    setSummaryLoading(true)
    const r = await fetch('/api/customers/' + selected.id + '/summarise', { method: 'POST' })
    const d = await r.json()
    if (d.summary) setSelected(s => s ? { ...s, ai_summary: d.summary } : s)
    setSummaryLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'Inter, sans-serif', display: 'flex' }}>
      {/* CSV import modal */}
      {importStep > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 520, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Import customers</h3>
              <button onClick={() => { setImportStep(0); setImportResult(null) }} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            {importStep === 1 && (
              <div style={{ textAlign: 'center', color: C.muted, padding: '20px 0' }}>
                <p style={{ fontSize: 14 }}>Analysing columns with Aria…</p>
              </div>
            )}
            {importStep === 2 && (
              <>
                <p style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Review column mapping — correct any mismatches before importing.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {csvHeaders.map(h => (
                    <div key={h} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</span>
                      <select value={mapping[h] ?? 'ignore'} onChange={e => setMapping(m => ({ ...m, [h]: e.target.value }))}
                        style={{ ...INP, padding: '6px 10px' }}>
                        {CSV_FIELDS.map(f => <option key={f} value={f} style={{ background: '#1a2420' }}>{f}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{csvRows.length} rows to import</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={runImport} disabled={importLoading} style={BTN('primary')}>
                    {importLoading ? 'Importing…' : 'Import ' + csvRows.length + ' rows'}
                  </button>
                  <button onClick={() => setImportStep(0)} style={BTN('ghost')}>Cancel</button>
                </div>
              </>
            )}
            {importStep === 3 && importResult && (
              <div style={{ textAlign: 'center', padding: '10px 0' }}>
                <div style={{ fontSize: 32, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green, marginBottom: 8 }}>
                  {importResult.imported}
                </div>
                <p style={{ fontSize: 14, color: C.text }}>customers imported</p>
                <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{importResult.skipped} skipped (duplicates or missing data)</p>
                <button onClick={() => { setImportStep(0); setImportResult(null) }} style={{ ...BTN('primary'), marginTop: 16 }}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit form panel */}
      {formMode && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 440 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>
                {formMode === 'add' ? 'Add customer' : 'Edit customer'}
              </h3>
              <button onClick={() => setFormMode(null)} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FORM_FIELDS.map(f => (
                <div key={f}>
                  <label style={{ fontSize: 11, color: C.muted, textTransform: 'capitalize', display: 'block', marginBottom: 4 }}>{f}{f === 'name' ? ' *' : ''}</label>
                  {f === 'notes'
                    ? <textarea value={form[f] ?? ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                        rows={3} style={{ ...INP, resize: 'vertical' }} />
                    : <input value={form[f] ?? ''} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))}
                        style={INP} />}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button onClick={saveForm} disabled={formSaving || !form.name?.trim()} style={{ ...BTN('primary'), opacity: !form.name?.trim() ? 0.5 : 1 }}>
                {formSaving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setFormMode(null)} style={BTN('ghost')}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Main list */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto', maxWidth: selected ? 600 : '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>Customers</h1>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{customers.length} {showArchived ? 'archived' : 'active'}</p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input type="file" ref={fileRef} accept=".csv" style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
            <button onClick={() => fileRef.current?.click()} style={BTN('ghost')}>↑ Import CSV</button>
            <button onClick={() => openForm('add')} style={BTN('primary')}>+ Add customer</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, phone…"
            style={{ ...INP, width: 220, flex: '0 0 auto' }} />
          <label style={{ fontSize: 12, color: C.muted, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>

        {loading ? (
          <p style={{ color: C.muted, fontSize: 14 }}>Loading…</p>
        ) : customers.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 14, textAlign: 'center', padding: '40px 0' }}>No customers found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {customers.map(c => (
              <div key={c.id} onClick={() => setSelected(c)}
                style={{ background: selected?.id === c.id ? 'rgba(127,184,151,0.08)' : C.card, borderRadius: 12, padding: '12px 16px', cursor: 'pointer', border: '1px solid ' + (selected?.id === c.id ? C.green + '44' : C.border), display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</span>
                    <SegBadge seg={c.customer_segment} />
                    {c.archived && <span style={{ fontSize: 10, color: C.muted }}>archived</span>}
                    {(c.tags ?? []).slice(0, 2).map(t => (
                      <span key={t} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: 'rgba(127,184,151,0.1)', color: C.green }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                    {c.email ?? c.phone ?? '—'} · {c.visit_count ?? 0} visits · last {c.last_visit ? new Date(c.last_visit).toLocaleDateString('en-AU') : 'never'}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: C.green }}>${(tv(c) || 0).toFixed(0)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ width: 380, borderLeft: '1px solid ' + C.border, padding: 24, overflowY: 'auto', background: C.card }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{selected.name}</h2>
              <SegBadge seg={selected.customer_segment} />
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
            {[
              { label: 'Total spent', value: '$' + (tv(selected) || 0).toFixed(0) },
              { label: 'Visits', value: String(selected.visit_count ?? 0) },
              { label: 'Churn risk', value: selected.churn_risk ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: C.elevated, borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>{value}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 14, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {selected.email && <div><span style={{ color: C.muted }}>Email: </span>{selected.email}</div>}
            {selected.phone && <div><span style={{ color: C.muted }}>Phone: </span>{selected.phone}</div>}
            {selected.company && <div><span style={{ color: C.muted }}>Company: </span>{selected.company}</div>}
            {(selected.city || selected.address) && (
              <div><span style={{ color: C.muted }}>Address: </span>{[selected.address, selected.city, selected.postcode].filter(Boolean).join(', ')}</div>
            )}
            <div><span style={{ color: C.muted }}>Source: </span>{selected.source ?? 'pos'}</div>
            <div><span style={{ color: C.muted }}>Last visit: </span>{selected.last_visit ? new Date(selected.last_visit).toLocaleDateString('en-AU') : 'never'}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 6 }}>Tags</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(selected.tags ?? []).map(t => (
                <span key={t} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: 'rgba(127,184,151,0.12)', color: C.green }}>{t}</span>
              ))}
              {!(selected.tags ?? []).length && <span style={{ fontSize: 12, color: C.muted }}>No tags</span>}
            </div>
          </div>

          {selected.notes && (
            <div style={{ marginBottom: 16, fontSize: 13 }}>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>Notes</p>
              <p style={{ color: C.text, lineHeight: 1.5 }}>{selected.notes}</p>
            </div>
          )}

          {/* AI Summary */}
          <div style={{ marginBottom: 20, padding: 14, background: 'rgba(127,184,151,0.06)', borderRadius: 10, border: '1px solid rgba(127,184,151,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>Aria Summary</p>
              <button onClick={summarise} disabled={summaryLoading} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: C.darkGreen, color: C.green, border: 'none', cursor: 'pointer', opacity: summaryLoading ? 0.6 : 1 }}>
                {summaryLoading ? 'Summarising…' : selected.ai_summary ? 'Refresh' : 'Summarise with Aria'}
              </button>
            </div>
            {selected.ai_summary ? (
              <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{selected.ai_summary}</p>
            ) : (
              <p style={{ fontSize: 12, color: C.muted }}>No summary yet.</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => openForm('edit')} style={BTN('primary')}>Edit</button>
            {!selected.archived && (
              <button onClick={() => archiveCustomer(selected.id)} style={BTN('danger')}>Archive</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
