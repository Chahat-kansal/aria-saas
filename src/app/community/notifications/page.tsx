'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ChevronLeft, Bell } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../theme'

interface Notif {
  id: string
  type: 'new_post' | 'new_like' | 'new_comment' | 'new_follower'
  actor_business_id: string | null
  actor_member_id: string | null
  post_id: string | null
  read_at: string | null
  created_at: string
  businesses: { name: string | null; logo_url: string | null } | null
  actor_member: { nickname: string | null } | null
  community_posts: { title: string | null; post_type: string | null } | null
}

const EMOJI: Record<Notif['type'], string> = {
  new_like: '❤️',
  new_comment: '💬',
  new_follower: '👤',
  new_post: '📢',
}

function fmtRel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  if (d < 7) return d + 'd'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

function line(n: Notif): { who: string; action: string } {
  const nick = (n.actor_member?.nickname ?? 'Someone').toLowerCase()
  const biz = (n.businesses?.name ?? 'a shop').toLowerCase()
  switch (n.type) {
    case 'new_like':     return { who: nick, action: 'liked your post' }
    case 'new_comment':  return { who: nick, action: 'commented on your post' }
    case 'new_follower': return { who: nick, action: 'started following you' }
    case 'new_post':     return { who: biz, action: 'shared a new post' }
  }
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [joined, setJoined] = useState(true)

  const load = useCallback(async () => {
    try {
      const d = await fetch('/api/community/notifications').then(r => r.json())
      setItems(d.notifications ?? [])
      setJoined(d.member !== null)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <Link href="/community" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textMuted, marginBottom: 14, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Back
      </Link>

      <header style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Notifications</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          What&apos;s happening
        </h1>
      </header>

      {loading ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>Loading…</p>
      ) : !joined ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <Bell size={26} style={{ color: C.accent, opacity: 0.6, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Join to get notified</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Follow a shop and you&apos;ll see their new posts and your activity here.
          </p>
          <Link href="/community/me" style={{ display: 'inline-block', marginTop: 14, padding: '10px 18px', borderRadius: RADIUS.pill, background: C.accent, color: C.ink, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>Join in 5 seconds</Link>
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>✦</div>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>You&apos;re all caught up</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Follow your favourite local shops and Aria will let you know the moment they post.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(n => {
            const { who, action } = line(n)
            const snippet = n.community_posts?.title
            const href = n.post_id ? `/community/posts/${n.post_id}` : (n.actor_business_id ? `/community/businesses/${n.actor_business_id}` : '/community')
            const unread = !n.read_at
            return (
              <Link key={n.id} href={href} prefetch={false} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12,
                background: unread ? 'rgba(127,184,151,0.06)' : C.surface,
                borderRadius: RADIUS.lg, border: `1px solid ${unread ? C.accent + '40' : C.border}`,
                textDecoration: 'none', color: C.text,
              }}>
                <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }}>{EMOJI[n.type]}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, margin: 0, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 700 }}>{who}</span>{' '}{action}
                  </p>
                  {snippet && (
                    <p style={{ fontSize: 12, color: C.textMuted, margin: '3px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      &ldquo;{snippet}&rdquo;
                    </p>
                  )}
                </div>
                <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, marginTop: 2 }}>{fmtRel(n.created_at)}</span>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
