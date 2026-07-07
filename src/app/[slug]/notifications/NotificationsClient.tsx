'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#f3efe4'
const INK = '#0a0a0a'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = '#6b7280'
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

const TYPE_META: Record<string, { bg: string; dot: string; icon: string }> = {
  order:   { bg: 'rgba(37,99,235,0.1)',    dot: '#2563eb', icon: '📦' },
  loyalty: { bg: 'rgba(217,245,78,0.2)',   dot: '#a3b010', icon: '⭐' },
  offer:   { bg: 'rgba(124,58,237,0.08)',  dot: '#7c3aed', icon: '🏷️' },
  system:  { bg: 'rgba(0,0,0,0.05)',       dot: INK_MUTED, icon: '🔔' },
}

function timeAgo(s: string): string {
  const diff = Date.now() - new Date(s).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return mins + 'm ago'
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + 'h ago'
  const days = Math.floor(hrs / 24)
  if (days < 7) return days + 'd ago'
  return new Date(s).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' })
}

function resolveActionUrl(notif: Notif, slug: string): string | null {
  if (notif.action_url) return notif.action_url
  if (notif.type === 'loyalty') return '/' + slug + '/rewards'
  return null
}

export function NotificationsClient({ slug, bizName }: {
  slug: string
  bizId: string
  bizName: string
}) {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // Track which IDs have been queued for mark-read (avoid repeat PATCHes)
  const readQueued = useRef<Set<string>>(new Set())
  const customerIdRef = useRef<string | null>(null)

  useEffect(() => { customerIdRef.current = customerId }, [customerId])

  const markRead = useCallback(async (id: string) => {
    const cid = customerIdRef.current
    if (!cid || readQueued.current.has(id)) return
    readQueued.current.add(id)
    setNotifs(ns => ns.map(n => n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n))
    await fetch('/api/public/cx/' + slug + '/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: cid, id }),
    }).catch(() => { /* ok */ })
  }, [slug])

  const markAllRead = async () => {
    const cid = customerId
    if (!cid) return
    const now = new Date().toISOString()
    setNotifs(ns => ns.map(n => ({ ...n, read_at: n.read_at ?? now })))
    await fetch('/api/public/cx/' + slug + '/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: cid }),
    }).catch(() => { /* ok */ })
  }

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
        customerIdRef.current = cid
        if (cid) {
          return fetch('/api/public/cx/' + slug + '/notifications?customer_id=' + cid)
            .then(r => r.json())
            .then((d: { notifications?: Notif[] }) => setNotifs(d.notifications ?? []))
        }
      })
      .catch(() => { /* ok */ })
      .finally(() => setLoading(false))
  }, [slug])

  // IntersectionObserver: mark each unread card as read when it enters viewport
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!listRef.current) return
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = (entry.target as HTMLElement).dataset.notifId
            const unread = (entry.target as HTMLElement).dataset.unread
            if (id && unread === '1') {
              // Slight delay so user actually sees it before marking read
              setTimeout(() => void markRead(id), 800)
            }
          }
        })
      },
      { threshold: 0.6 }
    )
    const cards = listRef.current.querySelectorAll('[data-notif-id]')
    cards.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [notifs, markRead])

  const unread = notifs.filter(n => !n.read_at).length

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FB, color: INK_MUTED }}>
        Loading…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: BG, fontFamily: FB, color: INK, paddingBottom: 'calc(80px + env(safe-area-inset-bottom) + 24px)', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Header */}
      <div style={{ padding: '52px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 38, margin: '0 0 2px', fontWeight: 400, color: INK }}>
            Notifications
          </h1>
          <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
            {unread > 0 ? (unread + ' unread') : ('From ' + bizName)}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={() => void markAllRead()}
            style={{
              background: 'none', border: 'none',
              fontFamily: FB, fontSize: 13, color: ACCENT_TEXT,
              cursor: 'pointer', fontWeight: 700, padding: '0 0 4px',
            }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div ref={listRef} style={{ padding: '0 16px' }}>
        {notifs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <p style={{ fontFamily: FB, fontSize: 15, color: INK_MUTED, margin: '0 0 6px' }}>
              No notifications yet.
            </p>
            <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: 0 }}>
              Order updates and loyalty rewards will appear here.
            </p>
          </div>
        ) : (
          notifs.map(notif => {
            const meta = TYPE_META[notif.type] ?? TYPE_META.system
            const isUnread = !notif.read_at
            const actionUrl = resolveActionUrl(notif, slug)

            const cardBody = (
              <div
                data-notif-id={notif.id}
                data-unread={isUnread ? '1' : '0'}
                style={{
                  background: 'rgba(255,255,255,0.65)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  borderRadius: 18,
                  border: '1px solid rgba(0,0,0,0.05)',
                  boxShadow: isUnread ? '0 2px 16px rgba(0,0,0,0.08)' : '0 1px 8px rgba(0,0,0,0.04)',
                  marginBottom: 10,
                  padding: '14px 16px',
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                  cursor: actionUrl ? 'pointer' : 'default',
                }}
              >
                {/* Type icon bubble */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: meta.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                }}>
                  {meta.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                    <p style={{
                      fontFamily: FB, fontSize: 14,
                      fontWeight: isUnread ? 700 : 500,
                      color: INK, margin: 0, flex: 1, paddingRight: 8, lineHeight: 1.3,
                    }}>
                      {notif.title}
                    </p>
                    <span style={{ fontFamily: FB, fontSize: 11, color: INK_MUTED, flexShrink: 0, marginTop: 1 }}>
                      {timeAgo(notif.created_at)}
                    </span>
                  </div>
                  {notif.body && (
                    <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '3px 0 0', lineHeight: 1.45 }}>
                      {notif.body}
                    </p>
                  )}
                  {/* Link hint for actionable notifications */}
                  {actionUrl && (
                    <p style={{ fontFamily: FB, fontSize: 11, color: meta.dot, margin: '6px 0 0', fontWeight: 700 }}>
                      {notif.type === 'order' ? 'Track order →' : notif.type === 'loyalty' ? 'View rewards →' : 'View →'}
                    </p>
                  )}
                </div>

                {/* Unread dot */}
                {isUnread && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: ACCENT, flexShrink: 0, marginTop: 4,
                    boxShadow: '0 0 6px rgba(217,245,78,0.7)',
                  }} />
                )}
              </div>
            )

            if (actionUrl) {
              return (
                <a key={notif.id} href={actionUrl} style={{ textDecoration: 'none', display: 'block' }}>
                  {cardBody}
                </a>
              )
            }
            return <div key={notif.id}>{cardBody}</div>
          })
        )}
      </div>

      <CxTabBar slug={slug} active="notifications" />
    </div>
  )
}