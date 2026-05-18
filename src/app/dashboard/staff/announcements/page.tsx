'use client'
import { useEffect, useState, useCallback } from 'react'

interface Announcement {
  id: string
  title: string
  body: string
  priority: string
  expires_at: string | null
  created_at: string
}

function priorityStyle(p: string) {
  if (p === 'urgent') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Urgent' }
  if (p === 'high') return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'High' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#86efac', label: 'Normal' }
}

function timeLeft(iso: string | null) {
  if (!iso) return 'No expiry'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const d = Math.floor(diff / 86_400_000)
  if (d > 0) return `Expires in ${d}d`
  const h = Math.floor(diff / 3_600_000)
  return `Expires in ${h}h`
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title: '', body: '', priority: 'normal', expires_at: '' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/staff/announcements')
    const j = await r.json() as { announcements?: Announcement[] }
    setItems(j.announcements ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const post = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return }
    if (!form.body.trim()) { setError('Body is required.'); return }
    setSaving(true); setError('')
    const payload: Record<string, unknown> = { title: form.title, body: form.body, priority: form.priority }
    if (form.expires_at) payload.expires_at = new Date(form.expires_at).toISOString()
    const r = await fetch('/api/staff/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const j = await r.json() as { error?: string }
    setSaving(false)
    if (j.error) { setError(j.error); return }
    setShowForm(false)
    setForm({ title: '', body: '', priority: 'normal', expires_at: '' })
    load()
  }

  const priorityColor = (p: string) => {
    const s = priorityStyle(p)
    return <span className="text-xs px-2 py-0.5 rounded" style={{ background: s.bg, color: s.color }}>{s.label}</span>
  }

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-medium">Announcements</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Post notices visible to staff on their portal
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#2D5240', color: '#7FB897' }}>
          + Post announcement
        </button>
      </header>

      {showForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>New announcement</h2>

          <input type="text" placeholder="Title" value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />

          <textarea rows={4} placeholder="Announcement body…" value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />

          <div className="flex gap-3 flex-wrap">
            <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="px-3 py-2 rounded-lg text-sm flex-1"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <div className="flex-1">
              <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Expires (optional)</label>
              <input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={post} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              {saving ? 'Posting…' : 'Post'}
            </button>
            <button onClick={() => { setShowForm(false); setError('') }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          <p className="text-lg mb-1">No announcements yet.</p>
          <p className="text-sm">Post a notice for your staff to see on their portal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(a => (
            <div key={a.id} className="rounded-xl px-5 py-4 space-y-2"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{a.title}</span>
                {priorityColor(a.priority)}
                <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{timeLeft(a.expires_at)}</span>
              </div>
              <p className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{a.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
