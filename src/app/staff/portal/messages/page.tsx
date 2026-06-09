'use client'
import { useEffect, useState } from 'react'

interface Message {
  id: string
  subject: string
  body: string
  is_broadcast: boolean
  read_at: string | null
  created_at: string
  sender: { first_name: string; last_name: string; color: string } | null
}

interface Announcement {
  id: string
  title: string
  body: string
  priority: string
  expires_at: string | null
  created_at: string
}

function priorityBadge(p: string) {
  if (p === 'urgent') return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', label: 'Urgent' }
  if (p === 'high') return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', label: 'High' }
  return { bg: 'rgba(34,197,94,0.12)', color: '#86efac', label: 'Normal' }
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
  const [messages, setMessages] = useState<Message[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/staff/portal/messages')
      .then(r => r.json())
      .then((j: { messages?: Message[]; announcements?: Announcement[] }) => {
        setMessages(j.messages ?? [])
        setAnnouncements(j.announcements ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
      Loading…
    </div>
  )

  const hasContent = announcements.length > 0 || messages.length > 0

  if (!hasContent) return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium">Messages</h1>
      <div className="rounded-xl p-8 text-center"
        style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <div className="text-2xl mb-2">💬</div>
        <div className="text-sm font-medium">No messages yet</div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
          Messages from your manager will appear here.
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-medium">Messages</h1>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
            Announcements
          </div>
          {announcements.map(a => {
            const badge = priorityBadge(a.priority)
            return (
              <div key={a.id} className="rounded-xl p-4"
                style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{a.title}</div>
                    <div className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{a.body}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                    style={{ background: badge.bg, color: badge.color }}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                    {timeAgo(a.created_at)}
                  </span>
                  {a.expires_at && (
                    <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      · expires {new Date(a.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* Direct messages */}
      {messages.length > 0 && (
        <section className="space-y-2">
          {announcements.length > 0 && (
            <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
              Direct messages
            </div>
          )}
          {messages.map(m => {
            const unread = !m.read_at
            const senderName = m.sender
              ? `${m.sender.first_name} ${m.sender.last_name}`
              : 'Manager'
            return (
              <div key={m.id} className="rounded-xl p-4"
                style={{
                  background: 'var(--bg-elevated, #1A2620)',
                  border: `1px solid ${unread ? 'rgba(127,184,151,0.25)' : 'var(--divider, rgba(232,237,231,0.04))'}`,
                }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {unread && (
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#7FB897' }} />
                      )}
                      {m.subject ? (
                        <span className={`text-sm ${unread ? 'font-medium' : ''}`}>{m.subject}</span>
                      ) : (
                        <span className={`text-sm ${unread ? 'font-medium' : ''} truncate`}>{m.body.slice(0, 60)}{m.body.length > 60 ? '…' : ''}</span>
                      )}
                      {m.is_broadcast && (
                        <span className="text-xs px-1.5 py-0.5 rounded flex-shrink-0"
                          style={{ background: 'rgba(127,184,151,0.12)', color: '#7FB897' }}>
                          All staff
                        </span>
                      )}
                    </div>
                    {m.subject && (
                      <div className="text-sm mt-1" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{m.body}</div>
                    )}
                    <div className="text-xs mt-1.5" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>
                      {senderName} · {timeAgo(m.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
