'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { MessageCircle, BadgeCheck, ChevronLeft, ChevronRight } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../../theme'

interface ChatRow {
  id: string
  listing_id: string
  business_id: string
  messages: Array<{ from: 'member' | 'owner'; text: string; ts: string }>
  last_message_at: string
  unread_for_member: boolean
  marketplace_listings: { title: string; price: number | null; media_urls: string[]; status: string; businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null } | null } | null
}

function fmtRel(iso: string) {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + 'h'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function MyChatsPage() {
  const [chats, setChats] = useState<ChatRow[]>([])
  const [member, setMember] = useState<{ id: string; nickname: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const d = await fetch('/api/community/chats').then(r => r.json())
        setChats(d.chats ?? [])
        setMember(d.member ?? null)
      } catch (e) { console.error(e) }
      setLoading(false)
    })()
  }, [])

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <Link href="/community/market" prefetch={false} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textMuted, marginBottom: 12, textDecoration: 'none' }}>
        <ChevronLeft size={14} /> Marketplace
      </Link>

      <header style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Your chats</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          Conversations
        </h1>
      </header>

      {!member && !loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <MessageCircle size={26} style={{ color: C.accent, opacity: 0.6, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>You haven&apos;t messaged any shops yet</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0' }}>Find something you like and tap &quot;Message to buy&quot;.</p>
        </div>
      ) : loading ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>Loading…</p>
      ) : chats.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <MessageCircle size={26} style={{ color: C.textMuted, opacity: 0.5, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>No conversations yet</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0' }}>Browse the marketplace and message a shop to start.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chats.map(c => {
            const last = c.messages?.[c.messages.length - 1]
            const lst = c.marketplace_listings
            return (
              <Link key={c.id} href={`/community/market/${c.listing_id}`} prefetch={false} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: 12,
                background: C.surface, borderRadius: RADIUS.lg, border: `1px solid ${c.unread_for_member ? C.accent + '55' : C.border}`,
                textDecoration: 'none', color: C.text,
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: RADIUS.md,
                  background: lst?.media_urls?.[0] ? `url(${lst.media_urls[0]}) center/cover` : C.accentDeep,
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lst?.businesses?.name}</span>
                    {lst?.businesses?.community_verified && <BadgeCheck size={12} style={{ color: C.accent, flexShrink: 0 }} />}
                  </p>
                  <p style={{ fontSize: 12, color: C.textMuted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lst?.title}</p>
                  {last && (
                    <p style={{ fontSize: 12, color: c.unread_for_member ? C.text : C.textDim, fontWeight: c.unread_for_member ? 600 : 400, margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {last.from === 'member' ? 'You: ' : ''}{last.text}
                    </p>
                  )}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span style={{ fontSize: 10, color: C.textMuted }}>{fmtRel(c.last_message_at)}</span>
                  {c.unread_for_member && <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent }} />}
                  <ChevronRight size={14} style={{ color: C.textMuted }} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
