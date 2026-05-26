'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Service { id: string; name: string; description: string | null; unit_price: number; gst_applicable: boolean; recurring: boolean; active: boolean }
interface BLine { description: string; quantity: number; unit_price: number; gst_applicable: boolean }
interface ILine extends BLine { id?: string; line_subtotal?: number; line_gst?: number; line_total?: number; position?: number }
interface Invoice { id: string; invoice_number: string; status: string; bill_to_name: string; bill_to_email: string | null; subtotal: number; gst_total: number; total: number; issue_date: string; due_date: string | null; sent_at: string | null; paid_at: string | null; send_method: string | null; pdf_url: string | null; ai_generated: boolean; created_at: string; notes: string | null; viewed_at: string | null; auto_reminders: boolean }

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', elevated: 'var(--bg-elevated)',
  text: 'var(--text-primary)', muted: 'var(--text-secondary)',
  green: '#7FB897', dark: '#2D5240', border: 'var(--divider)',
}
const INP: React.CSSProperties = { background: C.elevated, border: '1px solid ' + C.border, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 13, width: '100%', outline: 'none' }
const BTN = (v: 'p' | 'g' | 'd'): React.CSSProperties => ({ fontSize: 12, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: v === 'g' ? '1px solid ' + C.border : 'none', background: v === 'p' ? C.dark : v === 'd' ? 'rgba(239,68,68,0.1)' : 'transparent', color: v === 'p' ? C.green : v === 'd' ? '#ef4444' : C.muted })

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: 'rgba(156,163,175,0.15)', color: '#9ca3af' },
  sent: { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6' },
  overdue: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444' },
  paid: { bg: 'rgba(127,184,151,0.2)', color: '#2D5240' },
}
function SBadge({ s }: { s: string }) {
  const c = STATUS_COLORS[s] ?? STATUS_COLORS.draft
  return <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 700, textTransform: 'uppercase', ...c }}>{s}</span>
}

function calcTotals(lines: BLine[]) {
  let sub = 0, gst = 0
  for (const l of lines) {
    const s = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)
    sub += s
    gst += l.gst_applicable ? Math.round(s * 0.10 * 100) / 100 : 0
  }
  return { sub, gst, total: sub + gst }
}

const EMPTY_SVC = { name: '', description: '', unit_price: 0, gst_applicable: true, recurring: false }
const EMPTY_LINE: BLine = { description: '', quantity: 1, unit_price: 0, gst_applicable: true }

export default function InvoicesPage() {
  const { business } = useBusinessContext()
  const bid = business?.id
  const [tab, setTab] = useState<'invoices' | 'services'>('invoices')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [filter, setFilter] = useState('all')
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [selLines, setSelLines] = useState<ILine[]>([])
  const [building, setBuilding] = useState(false)
  const [bForm, setBForm] = useState({ bill_to_name: '', bill_to_email: '', due_date: '', notes: '' })
  const [bLines, setBLines] = useState<BLine[]>([{ ...EMPTY_LINE }])
  const [ariaText, setAriaText] = useState('')
  const [ariaLoading, setAriaLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [svcModal, setSvcModal] = useState<Partial<Service> | null>(null)
  const [svcForm, setSvcForm] = useState(EMPTY_SVC)
  const [svcSaving, setSvcSaving] = useState(false)
  const [reminderModal, setReminderModal] = useState(false)
  const [reminderDraft, setReminderDraft] = useState('')
  const [reminderMethod, setReminderMethod] = useState<'email' | 'sms'>('email')
  const [reminderSending, setReminderSending] = useState(false)
  const [sendMethod, setSendMethod] = useState<'email' | 'sms'>('email')
  const [sending, setSending] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'pipeline'>('list')
  const [recurringModal, setRecurringModal] = useState(false)
  const [recurringFreq, setRecurringFreq] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly')
  const [recurringSaving, setRecurringSaving] = useState(false)
  const notified = useRef(false)

  const fetchInvoices = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    const params = new URLSearchParams({ business_id: bid })
    if (filter !== 'all') params.set('status', filter)
    const r = await fetch('/api/invoices?' + params).then(x => x.json()).catch(() => ({ invoices: [] }))
    setInvoices(r.invoices ?? [])
    setLoading(false)
  }, [bid, filter])

  const fetchServices = useCallback(async () => {
    if (!bid) return
    const r = await fetch('/api/services?business_id=' + bid).then(x => x.json()).catch(() => ({ services: [] }))
    setServices(r.services ?? [])
  }, [bid])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])
  useEffect(() => { fetchServices() }, [fetchServices])

  async function openInvoice(inv: Invoice) {
    setSelected(inv)
    const r = await fetch('/api/invoices/' + inv.id).then(x => x.json()).catch(() => ({}))
    setSelLines(r.lines ?? [])
  }

  async function markPaid() {
    if (!selected) return
    const r = await fetch('/api/invoices/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paid', paid_at: new Date().toISOString() }) }).then(x => x.json())
    if (r.invoice) { setSelected(r.invoice); fetchInvoices() }
  }

  async function sendInvoice() {
    if (!selected) return
    setSending(true)
    const r = await fetch('/api/invoices/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: selected.id, sendMethod }) }).then(x => x.json())
    setSending(false)
    if (r.invoice) { setSelected(r.invoice); fetchInvoices() }
    else alert(r.error ?? 'Send failed')
  }

  async function draftReminder() {
    if (!selected) return
    setReminderModal(true)
    setReminderDraft('')
    const r = await fetch('/api/invoices/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: selected.id }) }).then(x => x.json())
    setReminderDraft(r.draft ?? '')
  }

  async function toggleAutoReminders() {
    if (!selected) return
    const r = await fetch('/api/invoices/' + selected.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ auto_reminders: !selected.auto_reminders }) }).then(x => x.json())
    if (r.invoice) { setSelected(r.invoice); fetchInvoices() }
  }

  async function saveRecurring() {
    if (!selected) return
    setRecurringSaving(true)
    await fetch('/api/invoices/recurring', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: selected.id, frequency: recurringFreq }) })
    setRecurringSaving(false); setRecurringModal(false)
  }

  async function sendReminder() {
    if (!selected || !reminderDraft.trim()) return
    setReminderSending(true)
    const r = await fetch('/api/invoices/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: selected.id, confirmedMessage: reminderDraft, sendMethod: reminderMethod }) }).then(x => x.json())
    setReminderSending(false)
    if (r.ok) { setReminderModal(false); alert('Reminder sent') }
    else alert(r.error ?? 'Failed')
  }

  async function draftWithAria() {
    if (!ariaText.trim() || !bid) return
    setAriaLoading(true)
    const r = await fetch('/api/invoices/draft-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ businessId: bid, text: ariaText, services: services.filter(s => s.active), customerName: bForm.bill_to_name }) }).then(x => x.json())
    setAriaLoading(false)
    if (r.lines?.length) setBLines(r.lines)
  }

  async function saveInvoice() {
    if (!bid || !bForm.bill_to_name.trim() || !bLines.length) return
    setSaving(true)
    const r = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ...bForm, lines: bLines }) }).then(x => x.json())
    setSaving(false)
    if (r.invoice) { setBuilding(false); setBForm({ bill_to_name: '', bill_to_email: '', due_date: '', notes: '' }); setBLines([{ ...EMPTY_LINE }]); setAriaText(''); fetchInvoices() }
    else alert(r.error ?? 'Save failed')
  }

  async function saveSvc() {
    if (!bid || !svcForm.name.trim()) return
    setSvcSaving(true)
    const isEdit = !!(svcModal as Service)?.id
    const url = isEdit ? '/api/services/' + (svcModal as Service).id : '/api/services'
    const r = await fetch(url, { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid, ...svcForm }) }).then(x => x.json())
    setSvcSaving(false)
    if (r.service) { setSvcModal(null); fetchServices() }
    else alert(r.error ?? 'Save failed')
  }

  async function toggleSvc(svc: Service) {
    await fetch('/api/services/' + svc.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !svc.active }) })
    fetchServices()
  }

  const tots = calcTotals(bLines)
  const filtered = filter === 'all' ? invoices : invoices.filter(i => i.status === filter)
  const thisMonth = new Date().toISOString().slice(0, 7)
  const revOutstanding = invoices.filter(i => i.status === 'sent').reduce((s, i) => s + Number(i.total), 0)
  const revOverdue = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total), 0)
  const revPaidMonth = invoices.filter(i => i.status === 'paid' && i.paid_at?.slice(0, 7) === thisMonth).reduce((s, i) => s + Number(i.total), 0)

  if (building) return (
    <div style={{ padding: 24, maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button style={BTN('g')} onClick={() => setBuilding(false)}>← Back</button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.dark }}>New Invoice</h1>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        {(['bill_to_name', 'bill_to_email', 'due_date', 'notes'] as const).map(k => (
          <div key={k} style={{ gridColumn: k === 'notes' ? '1/-1' : undefined }}>
            <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>{k === 'bill_to_name' ? 'Customer name *' : k === 'bill_to_email' ? 'Email' : k === 'due_date' ? 'Due date' : 'Notes'}</label>
            <input style={INP} type={k === 'due_date' ? 'date' : 'text'} value={bForm[k]} onChange={e => setBForm(f => ({ ...f, [k]: e.target.value }))} />
          </div>
        ))}
      </div>

      <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.dark }}>Draft with Aria</h3>
          <button style={BTN('p')} onClick={draftWithAria} disabled={ariaLoading || !ariaText.trim()}>
            {ariaLoading ? 'Drafting…' : 'Draft lines'}
          </button>
        </div>
        <textarea style={{ ...INP, height: 64, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Describe the work in plain language, e.g. '3 hours consulting + travel'" value={ariaText} onChange={e => setAriaText(e.target.value)} />
      </div>

      <div style={{ background: C.card, borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.dark }}>Line Items</h3>
          <div style={{ display: 'flex', gap: 8 }}>
            {services.filter(s => s.active).map(s => (
              <button key={s.id} style={{ ...BTN('g'), fontSize: 11 }} onClick={() => setBLines(prev => [...prev, { description: s.name, quantity: 1, unit_price: s.unit_price, gst_applicable: s.gst_applicable }])}>+ {s.name}</button>
            ))}
            <button style={BTN('g')} onClick={() => setBLines(prev => [...prev, { ...EMPTY_LINE }])}>+ Custom</button>
          </div>
        </div>
        {bLines.map((l, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 90px auto 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input style={INP} placeholder="Description" value={l.description} onChange={e => setBLines(prev => prev.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <input style={{ ...INP, textAlign: 'center' }} type="number" min="1" step="1" value={l.quantity} onChange={e => setBLines(prev => prev.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
            <input style={{ ...INP, textAlign: 'right' }} type="number" min="0" step="0.01" value={l.unit_price} onChange={e => setBLines(prev => prev.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))} />
            <label style={{ fontSize: 11, color: C.muted, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
              <input type="checkbox" checked={l.gst_applicable} onChange={e => setBLines(prev => prev.map((x, j) => j === i ? { ...x, gst_applicable: e.target.checked } : x))} /> GST
            </label>
            <button style={{ ...BTN('d'), padding: '4px 8px' }} onClick={() => setBLines(prev => prev.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <div style={{ textAlign: 'right', marginTop: 12, paddingTop: 12, borderTop: '1px solid ' + C.border, fontSize: 13 }}>
          <div style={{ color: C.muted }}>Subtotal: <strong>${tots.sub.toFixed(2)}</strong></div>
          <div style={{ color: C.muted }}>GST (10%): <strong>${tots.gst.toFixed(2)}</strong></div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginTop: 4 }}>Total: ${tots.total.toFixed(2)} AUD</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button style={BTN('g')} onClick={() => setBuilding(false)}>Cancel</button>
        <button style={BTN('p')} onClick={saveInvoice} disabled={saving || !bForm.bill_to_name.trim() || !bLines.length}>
          {saving ? 'Saving…' : 'Save Draft'}
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.dark }}>Invoices</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['invoices', 'services'] as const).map(t => (
            <button key={t} style={{ ...BTN(tab === t ? 'p' : 'g'), textTransform: 'capitalize' }} onClick={() => setTab(t)}>{t}</button>
          ))}
          {tab === 'invoices' && <button style={BTN('p')} onClick={() => setBuilding(true)}>+ New Invoice</button>}
          {tab === 'services' && <button style={BTN('p')} onClick={() => { setSvcModal({}); setSvcForm(EMPTY_SVC) }}>+ Add Service</button>}
        </div>
      </div>

      {tab === 'invoices' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
          {[{ label: 'Outstanding', val: revOutstanding, color: '#f59e0b' }, { label: 'Overdue', val: revOverdue, color: '#ef4444' }, { label: 'Paid this month', val: revPaidMonth, color: C.green }].map(({ label, val, color }) => (
            <div key={label} style={{ background: C.card, borderRadius: 10, padding: '12px 16px', border: '1px solid ' + C.border }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color }}>${val.toLocaleString('en-AU', { maximumFractionDigits: 0 })}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'invoices' && (
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {['all', 'draft', 'sent', 'overdue', 'paid'].map(f => (
                <button key={f} style={{ ...BTN(filter === f ? 'p' : 'g'), textTransform: 'capitalize' }} onClick={() => setFilter(f)}>{f}</button>
              ))}
              <button style={{ ...BTN(viewMode === 'pipeline' ? 'p' : 'g'), marginLeft: 'auto' }} onClick={() => setViewMode(v => v === 'list' ? 'pipeline' : 'list')}>{viewMode === 'pipeline' ? '≡ List' : '⋮⋮ Pipeline'}</button>
            </div>
            {viewMode === 'pipeline' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, overflowX: 'auto' }}>
                {[{ key: 'draft', label: 'Draft', color: '#9ca3af' }, { key: 'sent', label: 'Sent', color: '#3b82f6' }, { key: 'viewed', label: 'Viewed', color: '#a855f7' }, { key: 'paid', label: 'Paid', color: C.green }, { key: 'overdue', label: 'Overdue', color: '#ef4444' }].map(({ key, label, color }) => {
                  const col = invoices.filter(i => key === 'viewed' ? !!i.viewed_at : i.status === key)
                  return (
                    <div key={key} style={{ background: C.card, borderRadius: 10, padding: 12, border: '1px solid ' + C.border, minHeight: 120 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color, textTransform: 'uppercase', marginBottom: 8 }}>{label} <span style={{ opacity: 0.6 }}>{col.length}</span></div>
                      {col.map(inv => (
                        <div key={inv.id} onClick={() => openInvoice(inv)} style={{ background: C.elevated, borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer' }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.bill_to_name}</div>
                          <div style={{ fontSize: 11, color: C.muted }}>${(Number(inv.total) || 0).toFixed(0)}</div>
                          {inv.due_date && <div style={{ fontSize: 10, color: C.muted }}>{new Date(inv.due_date).toLocaleDateString('en-AU')}</div>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            ) : loading ? <p style={{ color: C.muted, fontSize: 13 }}>Loading…</p> : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 48, color: C.muted }}>
                <p style={{ fontSize: 14 }}>No invoices yet.</p>
                <button style={BTN('p')} onClick={() => setBuilding(true)}>Create your first invoice</button>
              </div>
            ) : filtered.map(inv => (
              <div key={inv.id} onClick={() => openInvoice(inv)} style={{ background: selected?.id === inv.id ? C.elevated : C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 16px', marginBottom: 8, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{inv.bill_to_name}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>{inv.invoice_number} · {new Date(inv.issue_date).toLocaleDateString('en-AU')}</div>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>${(Number(inv.total) || 0).toFixed(2)}</span>
                  {inv.viewed_at && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(168,85,247,0.12)', color: '#a855f7' }}>Viewed {Math.floor((Date.now() - new Date(inv.viewed_at).getTime()) / 60000)}m ago</span>}
                  <SBadge s={inv.status} />
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ width: 320, background: C.card, borderRadius: 12, padding: 20, border: '1px solid ' + C.border, flexShrink: 0, height: 'fit-content' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{selected.invoice_number}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{selected.bill_to_name}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <SBadge s={selected.status} />
                  <button style={{ ...BTN('g'), fontSize: 10, padding: '2px 6px' }} onClick={() => setSelected(null)}>✕</button>
                </div>
              </div>

              {selLines.map((l, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid ' + C.border, color: C.text }}>
                  <span style={{ flex: 1 }}>{l.quantity}× {l.description}</span>
                  <span>${(Number(l.line_total) || 0).toFixed(2)}</span>
                </div>
              ))}

              <div style={{ marginTop: 12, paddingTop: 8, fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}><span>Subtotal</span><span>${(Number(selected.subtotal) || 0).toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: C.muted }}><span>GST</span><span>${(Number(selected.gst_total) || 0).toFixed(2)}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14, color: C.dark, marginTop: 6 }}><span>Total</span><span>${(Number(selected.total) || 0).toFixed(2)}</span></div>
              </div>

              {selected.pdf_url && <a href={selected.pdf_url} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', marginTop: 12, fontSize: 12, color: C.dark }}>View Invoice PDF</a>}
              {selected.notes && <p style={{ marginTop: 8, fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{selected.notes}</p>}

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selected.status === 'draft') && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select style={{ ...INP, flex: 1 }} value={sendMethod} onChange={e => setSendMethod(e.target.value as 'email' | 'sms')}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                    </select>
                    <button style={BTN('p')} onClick={sendInvoice} disabled={sending}>{sending ? 'Sending…' : 'Send'}</button>
                  </div>
                )}
                {(selected.status === 'sent' || selected.status === 'overdue') && (
                  <>
                    <button style={BTN('p')} onClick={markPaid}>Mark Paid</button>
                    <button style={BTN('g')} onClick={draftReminder}>Draft Reminder</button>
                  </>
                )}
                {selected.status === 'paid' && selected.paid_at && (
                  <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', margin: 0 }}>Paid {new Date(selected.paid_at).toLocaleDateString('en-AU')}</p>
                )}
                {selected.viewed_at && <p style={{ fontSize: 11, color: '#a855f7', margin: 0 }}>Opened {Math.floor((Date.now() - new Date(selected.viewed_at).getTime()) / 60000)}m ago</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={toggleAutoReminders} style={{ ...BTN(selected.auto_reminders ? 'p' : 'g'), fontSize: 11 }}>Auto reminders: {selected.auto_reminders ? 'ON' : 'OFF'}</button>
                  <button style={{ ...BTN('g'), fontSize: 11 }} onClick={() => setRecurringModal(true)}>↻ Recurring</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'services' && (
        <div>
          {services.length === 0 ? (
            <p style={{ color: C.muted, fontSize: 13 }}>No services yet. Add your billable services to use them in invoices.</p>
          ) : services.map(s => (
            <div key={s.id} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 10, padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: s.active ? 1 : 0.5 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>${(Number(s.unit_price) || 0).toFixed(2)} ex-GST{s.gst_applicable ? ' · GST' : ''}{s.recurring ? ' · Recurring' : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={BTN('g')} onClick={() => { setSvcModal(s); setSvcForm({ name: s.name, description: s.description ?? '', unit_price: s.unit_price, gst_applicable: s.gst_applicable, recurring: s.recurring }) }}>Edit</button>
                <button style={BTN(s.active ? 'd' : 'g')} onClick={() => toggleSvc(s)}>{s.active ? 'Deactivate' : 'Activate'}</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {svcModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 24, width: 400, maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, color: C.dark }}>{(svcModal as Service)?.id ? 'Edit Service' : 'New Service'}</h2>
            {(['name', 'description'] as const).map(k => (
              <div key={k} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>{k === 'name' ? 'Name *' : 'Description'}</label>
                <input style={INP} value={svcForm[k]} onChange={e => setSvcForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, color: C.muted, display: 'block', marginBottom: 4 }}>Unit Price (ex-GST)</label>
              <input style={INP} type="number" min="0" step="0.01" value={svcForm.unit_price} onChange={e => setSvcForm(f => ({ ...f, unit_price: Number(e.target.value) }))} />
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={svcForm.gst_applicable} onChange={e => setSvcForm(f => ({ ...f, gst_applicable: e.target.checked }))} /> GST applicable</label>
              <label style={{ fontSize: 12, color: C.muted, display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={svcForm.recurring} onChange={e => setSvcForm(f => ({ ...f, recurring: e.target.checked }))} /> Recurring</label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={BTN('g')} onClick={() => setSvcModal(null)}>Cancel</button>
              <button style={BTN('p')} onClick={saveSvc} disabled={svcSaving || !svcForm.name.trim()}>{svcSaving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {reminderModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 24, width: 460, maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 8px', fontSize: 16, color: C.dark }}>Payment Reminder Draft</h2>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: C.muted }}>Review and edit before sending. You must confirm before it is sent.</p>
            {!reminderDraft ? <p style={{ color: C.muted, fontSize: 13 }}>Drafting with Aria…</p> : (
              <textarea style={{ ...INP, height: 140, resize: 'vertical', fontFamily: 'inherit', marginBottom: 12 }} value={reminderDraft} onChange={e => setReminderDraft(e.target.value)} />
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select style={{ ...INP }} value={reminderMethod} onChange={e => setReminderMethod(e.target.value as 'email' | 'sms')}>
                <option value="email">Email</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={BTN('g')} onClick={() => setReminderModal(false)}>Cancel</button>
              <button style={BTN('p')} onClick={sendReminder} disabled={reminderSending || !reminderDraft.trim()}>{reminderSending ? 'Sending…' : 'Confirm & Send'}</button>
            </div>
          </div>
        </div>
      )}

      {recurringModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 24, width: 360, maxWidth: '90vw' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, color: C.dark }}>Make Recurring</h2>
            <div style={{ marginBottom: 12 }}>
              <select style={INP} value={recurringFreq} onChange={e => setRecurringFreq(e.target.value as typeof recurringFreq)}>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>A new invoice will be auto-generated on each {recurringFreq} cycle.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={BTN('g')} onClick={() => setRecurringModal(false)}>Cancel</button>
              <button style={BTN('p')} onClick={saveRecurring} disabled={recurringSaving}>{recurringSaving ? 'Saving…' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
