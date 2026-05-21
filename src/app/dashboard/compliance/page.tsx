'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface CheckItem {
  id: string
  title: string
  description: string
  category: string
  due_date?: string | null
  status: 'pending' | 'done' | 'overdue' | 'na'
  evidence_note?: string | null
  evidence_url?: string | null
  priority: 'high' | 'medium' | 'low'
}

const CATEGORY_ICONS: Record<string, string> = {
  'food_safety': '🍽️', 'liquor': '🍺', 'employment': '👷', 'fire': '🔥',
  'tax': '💰', 'insurance': '🛡️', 'privacy': '🔐', 'health': '🏥', 'general': '📋',
}
const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: 'rgba(245,158,11,0.1)', color: '#F59E0B', label: 'Pending' },
  done:    { bg: 'rgba(34,197,94,0.1)',  color: '#22C55E', label: 'Done' },
  overdue: { bg: 'rgba(239,68,68,0.1)',  color: '#EF4444', label: 'Overdue' },
  na:      { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'N/A' },
}
const PRIORITY_CONFIG: Record<string, { dot: string }> = {
  high:   { dot: '#EF4444' },
  medium: { dot: '#F59E0B' },
  low:    { dot: '#22C55E' },
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

const C = {
  bg: 'var(--bg-base)', card: 'var(--bg-surface)', text: 'var(--text-primary)',
  muted: 'var(--text-secondary)', dim: 'var(--text-tertiary)',
  border: 'rgba(255,255,255,0.07)', green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
}

export default function CompliancePage() {
  const { business } = useBusinessContext()
  const [items, setItems] = useState<CheckItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editNote, setEditNote] = useState<Record<string, string>>({})
  const [editUrl, setEditUrl] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending' | 'overdue' | 'done'>('all')

  const load = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const res = await fetch('/api/compliance?business_id=' + business.id)
      const d = await res.json()
      const loaded: CheckItem[] = d.items ?? d.data ?? []
      const now = new Date()
      const processed = loaded.map(item => {
        if (item.status === 'pending' && item.due_date && new Date(item.due_date) < now) {
          return { ...item, status: 'overdue' as const }
        }
        return item
      })
      setItems(processed)
      const notes: Record<string, string> = {}
      const urls: Record<string, string> = {}
      processed.forEach(i => {
        if (i.evidence_note) notes[i.id] = i.evidence_note
        if (i.evidence_url) urls[i.id] = i.evidence_url
      })
      setEditNote(notes)
      setEditUrl(urls)
    } catch { /* ignore */ }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: CheckItem['status']) {
    setSaving(id)
    try {
      await fetch('/api/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, business_id: business?.id }),
      })
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i))
    } catch { /* ignore */ }
    setSaving(null)
  }

  async function saveEvidence(id: string) {
    setSaving(id)
    try {
      await fetch('/api/compliance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          evidence_note: editNote[id] ?? null,
          evidence_url: editUrl[id] ?? null,
          business_id: business?.id,
        }),
      })
      setItems(prev => prev.map(i => i.id === id
        ? { ...i, evidence_note: editNote[id], evidence_url: editUrl[id] }
        : i))
    } catch { /* ignore */ }
    setSaving(null)
  }

  const filtered = items.filter(i => filter === 'all' || i.status === filter)
  const done = items.filter(i => i.status === 'done').length
  const overdue = items.filter(i => i.status === 'overdue').length
  const pending = items.filter(i => i.status === 'pending').length
  const progress = items.length > 0 ? Math.round((done / items.length) * 100) : 0

  const byCategory = filtered.reduce((acc: Record<string, CheckItem[]>, item) => {
    const cat = item.category ?? 'general'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100%', background: C.bg, color: C.text, fontFamily: "'Inter',sans-serif", padding: '24px 28px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Compliance Checklist</h1>
        <p style={{ fontSize: 13, color: C.muted }}>Stay on top of licenses, certifications, and legal obligations.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Complete', value: done, color: C.green },
          { label: 'Pending', value: pending, color: C.amber },
          { label: 'Overdue', value: overdue, color: C.red },
          { label: 'Progress', value: progress + '%', color: progress === 100 ? C.green : progress > 60 ? C.amber : C.red },
        ].map(s => (
          <div key={s.label} style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginBottom: 20 }}>
        <div style={{ height: 6, width: progress + '%', background: progress === 100 ? C.green : '#8B5CF6', borderRadius: 3, transition: 'width 0.5s' }} />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['all', 'pending', 'overdue', 'done'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid ' + (filter === f ? 'rgba(139,92,246,0.4)' : C.border), background: filter === f ? 'rgba(139,92,246,0.12)' : 'transparent', color: filter === f ? '#8B5CF6' : C.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
            {f} {f !== 'all' ? '(' + items.filter(i => i.status === f).length + ')' : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Loading checklist...</div>
      ) : items.length === 0 ? (
        <div style={{ background: C.card, border: '1px solid ' + C.border, borderRadius: 12, padding: '40px', textAlign: 'center' }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>✅</p>
          <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No compliance items</p>
          <p style={{ fontSize: 13, color: C.muted }}>Your compliance checklist will appear here once configured.</p>
        </div>
      ) : (
        Object.entries(byCategory).map(([category, catItems]) => (
          <div key={category} style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>{CATEGORY_ICONS[category] ?? '📋'}</span>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                {category.replace(/_/g, ' ')}
              </h2>
              <span style={{ fontSize: 11, color: C.dim }}>({catItems.length})</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {catItems.map(item => {
                const isExpanded = expanded === item.id
                const days = daysUntil(item.due_date)
                const hasEvidence = !!(item.evidence_note || item.evidence_url)
                return (
                  <div key={item.id} style={{ background: C.card, border: '1px solid ' + (item.status === 'overdue' ? 'rgba(239,68,68,0.25)' : C.border), borderRadius: 12, overflow: 'hidden' }}>
                    <div onClick={() => setExpanded(isExpanded ? null : item.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_CONFIG[item.priority]?.dot ?? C.muted, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.title}</p>
                          {days !== null && days <= 30 && item.status !== 'done' && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: days < 0 ? 'rgba(239,68,68,0.15)' : days < 7 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)', color: days < 0 ? C.red : days < 7 ? C.amber : C.muted }}>
                              {days < 0 ? Math.abs(days) + 'd overdue' : days === 0 ? 'Due today' : days + 'd left'}
                            </span>
                          )}
                          {hasEvidence && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: 'rgba(34,197,94,0.1)', color: C.green }}>
                              📎 Evidence
                            </span>
                          )}
                        </div>
                        {item.due_date && (
                          <p style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Due: {new Date(item.due_date).toLocaleDateString('en-AU')}</p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {(['done', 'pending', 'na'] as const).map(s => (
                          <button key={s} onClick={e => { e.stopPropagation(); updateStatus(item.id, s) }}
                            disabled={saving === item.id}
                            style={{ padding: '4px 10px', borderRadius: 99, border: '1px solid ' + (item.status === s ? STATUS_CONFIG[s].color + '60' : C.border), background: item.status === s ? STATUS_CONFIG[s].bg : 'transparent', color: item.status === s ? STATUS_CONFIG[s].color : C.dim, fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                            {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', borderTop: '1px solid ' + C.border }}>
                        <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 10, marginBottom: 12 }}>{item.description}</p>

                        {/* Evidence notes */}
                        <p style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Evidence notes</p>
                        <textarea
                          value={editNote[item.id] ?? ''}
                          onChange={e => setEditNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                          rows={2}
                          placeholder="Certificate number, renewal date, officer name..."
                          style={{ width: '100%', padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                        />

                        {/* Evidence URL */}
                        <p style={{ fontSize: 11, color: C.dim, marginBottom: 6, fontWeight: 600 }}>Evidence document URL</p>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                          <input
                            type="url"
                            value={editUrl[item.id] ?? ''}
                            onChange={e => setEditUrl(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="https://drive.google.com/... or Dropbox link"
                            style={{ flex: 1, padding: '8px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid ' + C.border, borderRadius: 8, color: C.text, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
                          />
                          {item.evidence_url && (
                            <a href={item.evidence_url} target="_blank" rel="noopener noreferrer"
                              style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: C.green, fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
                              View ↗
                            </a>
                          )}
                        </div>

                        <button onClick={() => saveEvidence(item.id)} disabled={saving === item.id}
                          style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving === item.id ? 0.6 : 1 }}>
                          {saving === item.id ? 'Saving...' : 'Save evidence'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
