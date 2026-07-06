'use client'

import { useState, useEffect } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#fafafa'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
const CARD_BG = '#fff'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type Notif = {
  id: string
  type: 'order' | 'loyalty' | 'offer' | 'system'
  title: string
  body: string | null
  action_url: string | null
  read_at: string | null
  created_at: string
}

const TYPE_COLORS: Record<string, { bg: string; dot: string }> = {
  order:   { bg: 'rgba(37,99,235,0.1)',   dot: '#2563eb' },
  loyalty: { bg: 'rgba(217,245,78,0.18)', dot: ACCENT },
  offer:   { bg: 'rgba(124,58,237,0.08)', dot: '#7c3aed' },
  system:  { bg: 'rgba(0,0,0,0.04)',      dot: INK_MUTED },
}

function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  return days + 'd ago'
}

export function NotificationsClient({ slug, bizName }: {
  slug: string
  bizId: string
  bizName: string
}) {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let phone = ''
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) phone = (JSON.parse(saved) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }

    if (!phone) {
      window.location.replace('/' + slug + '/onboarding')
      return
    }

    fetch('/api/public/cx/' + slug + '/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
      .then(r => r.json())
      .then((me: { customer_id?: string }) => {
        const cid = me.customer_id ?? null
        setCustomerId(cid)
        if (cid) {
          return fetch('/api/public/cx/' + slug + '/notifications?customer_id=' + cid)
            .then(r => r.json())
            .then((d: { notifications?: Notif[] }) => setNotifs(d.notifications ?? []))
        }
      })
      .catch(() => { /* ok */ })
      .finally(() => setLoading(false))
  }, [slug])

  const markRead = async (id: string) => {
    if (!customerId) return
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    await fetch('/api/public/cx/' + slug + '/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId, id }),
    })
  }

  const markAllRead = async () => {
    if (!customerId) return
    const now = new Date().toISOString()
    setNotifs(ns => ns.map(n => ({ ...n, read_at: n.read_at ?? now })))
    await fetch('/api/public/cx/' + slug + '/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId }),
    })
  }

  const unread = notifs.filter(n => !n.read_at).length

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: BG, fontFamily: FB, color: INK, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ padding: '52px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, margin: '0 0 4px' }}>
            Notifications
          </h1>
          <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>
            {unread > 0 ? (unread + ' unread') : ('From ' + bizName)}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => void markAllRead()}
            style={{ background: 'none', border: 'none', fontFamily: FB, fontSize: 13, color: ACCENT_TEXT, cursor: 'pointer', fontWeight: 700, padding: '0 0 4px' }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div style={{ padding: '0 16px' }}>
        {notifs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED }}>No notifications yet.</p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED }}>
              You will receive order updates and loyalty rewards here.
            </p>
          </div>
        ) : (
          notifs.map(notif => {
            const colors = TYPE_COLORS[notif.type] ?? TYPE_COLORS.system
            const isUnread = !notif.read_at
            const content = (
              <div
                style={{
                  background: CARD_BG, borderRadius: 16, marginBottom: 10,
                  padding: '14px 16px',
                  boxShadow: isUnread ? '0 2px 12px rgba(0,0,0,0.08)' : '0 1px 6px rgba(0,0,0,0.04)',
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  cursor: isUnread ? 'pointer' : 'default',
                }}
                onClick={() => { if (isUnread) void markRead(notif.id) }}
              >
                {/* Type dot */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: colors.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: colors.dot }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                    <p style={{ fontFamily: FB, fontSize: 14, fontWeight: isUnread ? 700 : 400, color: INK, margin: 0, flex: 1, paddingRight: 8 }}>
                      {notif.title}
                    </p>
                    <span style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, flexShrink: 0 }}>
                      {timeAgo(notif.created_at)}
                    </span>
                  </div>
                  {notif.body && (
                    <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '2px 0 0', lineHeight: 1.4 }}>
                      {notif.body}
                    </p>
                  )}
                </div>

                {isUnread && (
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ACCENT, flexShrink: 0, marginTop: 4 }} />
                )}
              </div>
            )
            if (notif.action_url) {
              return (
                <a key={notif.id} href={notif.action_url} style={{ textDecoration: 'none', display: 'block' }}>
                  {content}
                </a>
              )
            }
            return <div key={notif.id}>{content}</div>
          })
        )}
      </div>

      <CxTabBar slug={slug} active="notifications" />
    </div>
  )
}