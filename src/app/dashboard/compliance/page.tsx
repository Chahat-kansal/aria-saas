'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface CheckItem {
  id: string; title: string; description: string; category: string
  due_date?: string | null; expiry_date?: string | null
  status: 'pending' | 'done' | 'overdue' | 'na'
  evidence_note?: string | null; evidence_url?: string | null
  document_url?: string | null; reminder_enabled?: boolean
  priority: 'high' | 'medium' | 'low'
}

const CATEGORY_ICONS: Record<string, string> = {
  food_safety: '🍽️', liquor: '🍺', employment: '👷', fire: '🔥',
  tax: '💰', insurance: '🛡️', privacy: '🔐', health: '🏥', general: '📋',
}
const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: 'Pending' },
  done:    { bg: 'rgba(34,197,94,0.1)',  color: '#22C55E', label: 'Done' },
  overdue: { bg: 'rgba(239,68,68,0.1)',  color: '#EF4444', label: 'Overdue' },
  na:      { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'N/A' },
}
const PRIORITY_DOT: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' }
const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)', border: 'rgba(255,255,255,0.07)',
  green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
}
const BTN: React.CSSProperties = { padding: '6px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }
const PILL: React.CSSProperties = { padding: '2px 8px', borderRadius: 99, fontSize: 10, fontWeight: 700 }

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
}

function CircleScore({ pct, attention }: { pct: number; attention: number }) {
  const r = 48; const circ = 2 * Math.PI * r
  const col = pct > 80 ? C.green : pct >= 60 ? C.amber : C.red
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 120, height: 120 }}>
        <svg width={120} height={120} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={60} cy={60} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={10} />
          <circle cx={60} cy={60} r={r} fill="none" stroke={col} strokeWidth={10}
            strokeDasharray={`${(pct / 100) * circ} ${circ}`} strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.6s' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: col }}>{pct}%</span>
          <span style={{ fontSize: 11, color: C.muted }}>Compliant</span>
        </div>
      </div>
      {attention > 0 && <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>{attention} item{attention !== 1 ? 's' : ''} need attention</p>}
    </div>
  )
}

export default function CompliancePage() {
  const { business } = useBusinessContext()
  const [items, setItems] = useState<CheckItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editNote, setEditNote] = useState<Record<string, string>>({})
  const [editUrl, setEditUrl] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'done'>('all')
  const [activeTab, setActiveTab] = useState<'checklist' | 'calendar'>('checklist')
  const [calDate, setCalDate] = useState(new Date())
  const [calSelected, setCalSelected] = useState<number | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/compliance?business_id=' + business.id)
      const d = await res.json()
      let loaded: CheckItem[] = d.items ?? []
      if (loaded.length === 0 && business.industry) {
        const sr = await fetch(`/api/compliance?business_id=${business.id}&action=seed&industry=${encodeURIComponent(business.industry)}`)
        const sd = await sr.json()
        loaded = sd.items ?? []
      }
      const now = new Date()
      const processed = loaded.map(item =>
        item.status === 'pending' && item.due_date && new Date(item.due_date) < now
          ? { ...item, status: 'overdue' as const } : item
      )
      setItems(processed)
      const notes: Record<string, string> = {}
      const urls: Record<string, string> = {}
      processed.forEach(i => {
        if (i.evidence_note) notes[i.id] = i.evidence_note
        if (i.evidence_url) urls[i.id] = i.evidence_url
      })
      setEditNote(notes); setEditUrl(urls)
    } catch (e) { console.warn('[non-fatal]', e) }
    setLoading(false)
  }, [business?.id, business?.industry])

  useEffect(() => { load() }, [load])

  async function patch(id: string, payload: Record<string, unknown>) {
    setSaving(id)
    await fetch('/api/compliance', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...payload }),
    }).catch(() => null)
    setSaving(null)
  }

  async function updateStatus(id: string, status: CheckItem['status']) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    await patch(id, { status })
  }

  async function saveEvidence(id: string) {
    await patch(id, { evidence_note: editNote[id] ?? null, evidence_url: editUrl[id] ?? null })
    setItems(prev => prev.map(i => i.id === id ? { ...i, evidence_note: editNote[id], evidence_url: editUrl[id] } : i))
  }

  async function uploadDoc(id: string, file: File) {
    setUploading(id)
    try {
      const form = new FormData()
      form.append('file', file); form.append('itemId', id)
      const res = await fetch('/api/compliance/upload', { method: 'POST', body: form })
      const { url } = await res.json()
      if (url) setItems(prev => prev.map(i => i.id === id ? { ...i, document_url: url } : i))
    } catch (e) { console.warn('[non-fatal]', e) }
    setUploading(null)
  }

  async function toggleReminder(id: string, enabled: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, reminder_enabled: enabled } : i))
    await patch(id, { reminder_enabled: enabled })
  }

  const done = items.filter(i => i.status === 'done').length
  const overdue = items.filter(i => i.status === 'overdue').length
  const pending = items.filter(i => i.status === 'pending').length
  const progress = items.length > 0 ? Math.round((done / items.length) * 100) : 0
  const attention = pending + overdue
  const filtered = items.filter(i => filter === 'all' || i.status === filter)
  const byCategory = filtered.reduce((acc: Record<string, CheckItem[]>, item) => {
    const cat = item.category ?? 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item); return acc
  }, {})

  const calYear = calDate.getFullYear(); const calMonth = calDate.getMonth()
  const firstDay = new Date(calYear, calMonth, 1).getDay()
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  const byDay: Record<number, CheckItem[]> = {}
  items.forEach(item => {
    if (!item.expiry_date) return
    const d = new Date(item.expiry_date)
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
      const day = d.getDate()
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(item)
    }
  })
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const dotCol = (item: CheckItem) => {
    const d = daysUntil(item.expiry_date)
    return d === null ? C.dim : d < 0 ? C.red : d <= 30 ? C.amber : C.green
  }

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Compliance</h1>
          <p style={{ fontSize: 13, color: C.muted }}>Stay on top of licenses, certifications, and legal obligations.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['checklist', 'calendar'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ ...BTN, background: activeTab === t ? '#8B5CF6' : 'rgba(255,255,255,0.06)', color: activeTab === t ? '#fff' : C.muted, border: '1px solid ' + (activeTab === t ? 'transparent' : C.border), textTransform: 'capitalize' }}>
              {t === 'calendar' ? '📅 Calendar' : '✅ Checklist'}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, alignItems: 'center' }}>
          <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: '16px 24px' }}>
            <CircleScore pct={progress} attention={attention} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, flex: 1 }}>
            {[{ label: 'Complete', value: done, color: C.green }, { label: 'Pending', value: pending, color: C.amber }, { label: 'Overdue', value: overdue, color: C.red }].map(s => (
              <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'checklist' ? (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {(['all', 'pending', 'overdue', 'done'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...BTN, border: '1px solid ' + (filter === f ? 'rgba(139,92,246,0.4)' : C.border), background: filter === f ? 'rgba(139,92,246,0.12)' : 'transparent', color: filter === f ? '#8B5CF6' : C.muted, textTransform: 'capitalize' }}>
                {f} {f !== 'all' && `(${items.filter(i => i.status === f).length})`}
              </button>
            ))}
          </div>
          {loading ? (
            <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Loading checklist...</div>
          ) : items.length === 0 ? (
            <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: 40, textAlign: 'center' }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>✅</p>
              <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No compliance items</p>
              <p style={{ fontSize: 13, color: C.muted }}>Your checklist will appear here once configured.</p>
            </div>
          ) : Object.entries(byCategory).map(([cat, catItems]) => (
            <div key={cat} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[cat] ?? '📋'}</span>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{cat.replace(/_/g, ' ')}</h2>
                <span style={{ fontSize: 11, color: C.dim }}>({catItems.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {catItems.map(item => {
                  const isExp = expanded === item.id
                  const days = daysUntil(item.due_date)
                  const exDays = daysUntil(item.expiry_date)
                  return (
                    <div key={item.id} style={{ background: C.card, border: '1px solid ' + (item.status === 'overdue' ? 'rgba(239,68,68,0.25)' : C.border), borderRadius: 12, overflow: 'hidden' }}>
                      <div onClick={() => setExpanded(isExp ? null : item.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_DOT[item.priority] ?? C.muted, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, margin: 0 }}>{item.title}</p>
                            {days !== null && days <= 30 && item.status !== 'done' && (
                              <span style={{ ...PILL, background: days < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: days < 0 ? C.red : C.amber }}>
                                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}
                              </span>
                            )}
                            {exDays !== null && exDays <= 90 && item.status !== 'done' && (
                              <span style={{ ...PILL, background: exDays < 0 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: exDays < 0 ? C.red : C.amber }}>
                                {exDays < 0 ? `Expired ${Math.abs(exDays)}d ago` : `Expires in ${exDays}d`}
                              </span>
                            )}
                            {item.document_url && <span style={{ ...PILL, background: 'rgba(34,197,94,0.1)', color: C.green }}>📄 Doc</span>}
                            {!!(item.evidence_note || item.evidence_url) && <span style={{ ...PILL, background: 'rgba(34,197,94,0.1)', color: C.green }}>📎 Evidence</span>}
                          </div>
                          {item.due_date && <p style={{ fontSize: 11, color: C.dim, marginTop: 2, marginBottom: 0 }}>Due: {new Date(item.due_date).toLocaleDateString('en-AU')}</p>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          {(['done', 'pending', 'na'] as const).map(s => (
                            <button key={s} onClick={e => { e.stopPropagation(); updateStatus(item.id, s) }} disabled={saving === item.id}
                              style={{ ...PILL, border: '1px solid ' + (item.status === s ? STATUS_CONFIG[s].color + '60' : C.border), background: item.status === s ? STATUS_CONFIG[s].bg : 'transparent', color: item.status === s ? STATUS_CONFIG[s].color : C.dim, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {STATUS_CONFIG[s].label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {isExp && (
                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid ' + C.border }}>
                          <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 10, marginBottom: 12 }}>{item.description}</p>
                          <p style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Evidence notes</p>
                          <textarea value={editNote[item.id] ?? ''} rows={2}
                            onChange={e => setEditNote(p => ({ ...p, [item.id]: e.target.value }))}
                            placeholder="Certificate number, renewal date, officer name..."
                            style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                          <p style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Evidence URL</p>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <input type="url" value={editUrl[item.id] ?? ''}
                              onChange={e => setEditUrl(p => ({ ...p, [item.id]: e.target.value }))}
                              placeholder="https://drive.google.com/..."
                              style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
                            {item.evidence_url && (
                              <a href={item.evidence_url} target="_blank" rel="noopener noreferrer"
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: C.green, fontSize: 11, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>View ↗</a>
                            )}
                          </div>
                          <p style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Compliance document</p>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            <input type="file" ref={el => { fileRefs.current[item.id] = el }} style={{ display: 'none' }}
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadDoc(item.id, f) }} />
                            <button onClick={() => fileRefs.current[item.id]?.click()} disabled={uploading === item.id}
                              style={{ ...BTN, background: 'rgba(255,255,255,0.06)', color: C.muted, border: '1px solid ' + C.border, opacity: uploading === item.id ? 0.6 : 1 }}>
                              {uploading === item.id ? 'Uploading...' : '⬆ Upload document'}
                            </button>
                            {item.document_url && (
                              <a href={item.document_url} target="_blank" rel="noopener noreferrer"
                                style={{ ...BTN, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: C.green, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>📄 View document</a>
                            )}
                          </div>
                          {item.expiry_date && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid ' + C.border }}>
                              <span style={{ fontSize: 12, color: C.muted }}>Expires: <strong style={{ color: C.text }}>{new Date(item.expiry_date).toLocaleDateString('en-AU')}</strong></span>
                              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 11, color: C.dim }}>Auto-reminder</span>
                                <div onClick={() => toggleReminder(item.id, !item.reminder_enabled)}
                                  style={{ width: 36, height: 20, borderRadius: 10, background: item.reminder_enabled ? '#8B5CF6' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: item.reminder_enabled ? 19 : 3, transition: 'left 0.2s' }} />
                                </div>
                              </div>
                            </div>
                          )}
                          <button onClick={() => saveEvidence(item.id)} disabled={saving === item.id}
                            style={{ ...BTN, background: '#8B5CF6', color: '#fff', opacity: saving === item.id ? 0.6 : 1 }}>
                            {saving === item.id ? 'Saving...' : 'Save evidence'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <button onClick={() => setCalDate(new Date(calYear, calMonth - 1, 1))}
              style={{ ...BTN, background: 'rgba(255,255,255,0.06)', color: C.muted, border: '1px solid ' + C.border }}>←</button>
            <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>
              {calDate.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setCalDate(new Date(calYear, calMonth + 1, 1))}
              style={{ ...BTN, background: 'rgba(255,255,255,0.06)', color: C.muted, border: '1px solid ' + C.border }}>→</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 16 }}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: 10, color: C.dim, padding: '4px 0', fontWeight: 600 }}>{d}</div>
            ))}
            {cells.map((day, i) => (
              <div key={i} onClick={() => { if (day !== null && byDay[day]) setCalSelected(day) }}
                style={{ minHeight: 40, borderRadius: 8, background: day !== null && byDay[day] ? 'rgba(139,92,246,0.1)' : 'transparent', border: '1px solid ' + (day !== null && calSelected === day ? 'rgba(139,92,246,0.5)' : 'transparent'), cursor: day !== null && byDay[day] ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, padding: 4 }}>
                {day !== null && <span style={{ fontSize: 11, color: C.muted }}>{day}</span>}
                {day !== null && byDay[day] && (
                  <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                    {byDay[day].slice(0, 3).map((item, j) => (
                      <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: dotCol(item) }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {calSelected !== null && byDay[calSelected] && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid ' + C.border, borderRadius: 10, padding: 14 }}>
              <p style={{ fontSize: 11, color: C.dim, marginBottom: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {new Date(calYear, calMonth, calSelected).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              {byDay[calSelected].map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotCol(item), flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>{CATEGORY_ICONS[item.category] ?? '📋'} {item.category.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
