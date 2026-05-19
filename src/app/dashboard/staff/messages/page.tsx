'use client'
import { useEffect, useState, useCallback } from 'react'

interface StaffMessage {
  id: string
  subject: string
  body: string
  is_broadcast: boolean
  read_at: string | null
  created_at: string
  sender: { first_name: string; last_name: string; color: string } | null
  recipient: { first_name: string; last_name: string } | null
}

interface StaffMember {
  id: string
  first_name: string
  last_name: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function StaffMessagesPage() {
  const [messages, setMessages] = useState<StaffMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompose, setShowCompose] = useState(false)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState({ recipient_id: '', subject: '', body: '', is_broadcast: false })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/staff/messages')
    const j = await r.json() as { messages?: StaffMessage[] }
    setMessages(j.messages ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('/api/staff/members?status=active').then(r => r.json()).then((j: { members?: StaffMember[] }) => {
      setStaffList(j.members ?? [])
    }).catch(() => { /* non-fatal */ })
  }, [])

  const send = async () => {
    if (!form.body.trim()) { setError('Message body is required.'); return }
    setSending(true); setError('')
    const payload: Record<string, unknown> = { body: form.body, subject: form.subject, is_broadcast: form.is_broadcast }
    if (!form.is_broadcast && form.recipient_id) payload.recipient_id = form.recipient_id
    const r = await fetch('/api/staff/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const j = await r.json() as { error?: string }
    setSending(false)
    if (j.error) { setError(j.error); return }
    setShowCompose(false)
    setForm({ recipient_id: '', subject: '', body: '', is_broadcast: false })
    load()
  }

  const senderName = (m: StaffMessage) =>
    m.sender ? `${m.sender.first_name} ${m.sender.last_name}` : 'Manager'

  const recipientLabel = (m: StaffMessage) =>
    m.is_broadcast ? 'All staff' : m.recipient ? `${m.recipient.first_name} ${m.recipient.last_name}` : '—'

  return (
    <div className="p-6 max-w-4xl space-y-6" style={{ color: 'var(--text-primary, #E8EDE7)' }}>
      <header className="flex justify-between items-baseline flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-medium">Staff Messages</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Send messages or broadcast to your whole team
          </p>
        </div>
        <button onClick={() => setShowCompose(true)}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: '#2D5240', color: '#7FB897' }}>
          + New message
        </button>
      </header>

      {showCompose && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.08))' }}>
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Compose message</h2>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_broadcast} onChange={e => setForm(f => ({ ...f, is_broadcast: e.target.checked, recipient_id: '' }))} className="rounded" />
            Broadcast to all active staff
          </label>

          {!form.is_broadcast && (
            <select value={form.recipient_id} onChange={e => setForm(f => ({ ...f, recipient_id: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }}>
              <option value="" style={{ background: '#1a2420', color: '#e8ede7' }}>Select recipient…</option>
              {staffList.map(s => (
                <option key={s.id} value={s.id} style={{ background: '#1a2420', color: '#e8ede7' }}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          )}

          <input type="text" placeholder="Subject (optional)" value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />

          <textarea rows={4} placeholder="Message…" value={form.body}
            onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ background: 'var(--bg-surface, #0E1812)', border: '1px solid var(--divider, rgba(232,237,231,0.08))', color: 'var(--text-primary, #E8EDE7)' }} />

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2">
            <button onClick={send} disabled={sending}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: '#2D5240', color: '#7FB897' }}>
              {sending ? 'Sending…' : form.is_broadcast ? 'Broadcast' : 'Send'}
            </button>
            <button onClick={() => { setShowCompose(false); setError('') }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary, #A8B5A8)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>Loading…</div>
      ) : messages.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          <p className="text-lg mb-1">No messages yet.</p>
          <p className="text-sm">Send your first message to the team.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {messages.map(m => (
            <div key={m.id} className="rounded-xl px-5 py-4 flex gap-4 items-start"
              style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.06))' }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shrink-0"
                style={{ background: m.sender?.color ?? '#2D5240' }}>
                {(m.sender?.first_name?.[0] ?? 'M')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{senderName(m)}</span>
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: m.is_broadcast ? 'rgba(45,82,64,0.4)' : 'rgba(255,255,255,0.06)', color: m.is_broadcast ? '#7FB897' : 'var(--text-secondary, #A8B5A8)' }}>
                    {recipientLabel(m)}
                  </span>
                  <span className="text-xs ml-auto" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{timeAgo(m.created_at)}</span>
                </div>
                {m.subject && <p className="text-sm font-medium mt-1">{m.subject}</p>}
                <p className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
