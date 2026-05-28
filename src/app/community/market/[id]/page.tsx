'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, MapPin, ArrowLeft, Send, Shield, Loader2 } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../../theme'

interface Listing {
  id: string
  business_id: string
  title: string
  description: string | null
  price: number | null
  media_urls: string[]
  category: string | null
  status: string
  created_at: string
  businesses: { name: string | null; logo_url: string | null; community_verified: boolean | null; industry: string | null; suburb: string | null; city: string | null; website: string | null } | null
}

interface ChatMessage { from: 'member' | 'owner'; text: string; ts: string }

export default function ListingDetailPage() {
  const params = useParams<{ id: string }>()
  const listingId = params.id

  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [imgIdx, setImgIdx] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!listingId) return
    (async () => {
      try {
        const d = await fetch('/api/community/marketplace/' + listingId).then(r => r.ok ? r.json() : null)
        if (d?.listing) setListing(d.listing)
      } catch (e) { console.error(e) }
      setLoading(false)
    })()
  }, [listingId])

  // When chat is opened, resolve any existing thread for this listing+member
  useEffect(() => {
    if (!showChat || !listingId) return
    (async () => {
      try {
        const d = await fetch('/api/community/chats?listing_id=' + listingId).then(r => r.json())
        if (d?.chat?.id) {
          // Load full thread
          const full = await fetch('/api/community/chats?id=' + d.chat.id).then(r => r.json())
          if (full?.chat) {
            setChatId(full.chat.id)
            setMessages(Array.isArray(full.chat.messages) ? full.chat.messages : [])
          }
        }
      } catch (e) { console.error(e) }
    })()
  }, [showChat, listingId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = useCallback(async () => {
    if (!input.trim() || sending) return
    setSending(true)
    setBlocked(null)
    const text = input
    try {
      const res = await fetch('/api/community/chats', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_id: listingId, text }),
      })
      const d = await res.json()
      if (res.ok) {
        setMessages(prev => [...prev, { from: 'member', text, ts: new Date().toISOString() }])
        setInput('')
        if (d.chat_id && !chatId) setChatId(d.chat_id)
      } else if (d.blocked) {
        setBlocked(d.reason ?? 'Message blocked for safety.')
      } else {
        setBlocked(d.error ?? 'Could not send.')
      }
    } catch (e) {
      setBlocked('Network error.')
      console.error(e)
    }
    setSending(false)
  }, [input, sending, listingId, chatId])

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: 16 }}>
        <div style={{ height: 280, background: C.surfaceHi, borderRadius: RADIUS.lg, marginBottom: 14 }} />
        <div style={{ height: 16, width: '70%', background: C.surfaceHi, borderRadius: 4 }} />
      </main>
    )
  }

  if (!listing) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <h1 style={{ fontSize: 20, fontFamily: FONT_DISPLAY }}>Listing not found</h1>
        <p style={{ color: C.textMuted, marginTop: 8 }}>This item may have been removed.</p>
        <Link href="/community/market" style={{ display: 'inline-block', marginTop: 20, color: C.accent }}>← Back to marketplace</Link>
      </main>
    )
  }

  const biz = listing.businesses

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', paddingBottom: 24 }}>
      {/* Back */}
      <Link href="/community/market" prefetch={false} style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 8px) + 12px)', left: 12, zIndex: 20,
        width: 36, height: 36, borderRadius: '50%',
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', textDecoration: 'none',
      }}>
        <ArrowLeft size={18} />
      </Link>

      {/* Media gallery */}
      {listing.media_urls.length > 0 ? (
        <div style={{ width: '100%', aspectRatio: '1', background: '#000', position: 'relative' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={listing.media_urls[imgIdx]} alt={listing.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {listing.media_urls.length > 1 && (
            <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6 }}>
              {listing.media_urls.map((_, i) => (
                <button key={i} onClick={() => setImgIdx(i)} aria-label={`Image ${i + 1}`} style={{
                  width: 8, height: 8, borderRadius: '50%', border: 'none',
                  background: i === imgIdx ? '#fff' : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer', padding: 0,
                }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div style={{ width: '100%', aspectRatio: '4/3', background: C.accentDeep, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent, fontSize: 80, fontWeight: 700, fontFamily: FONT_DISPLAY }}>
          {listing.title[0]}
        </div>
      )}

      <section style={{ padding: '20px 16px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.25, fontFamily: FONT_DISPLAY }}>
          {listing.title}
        </h1>
        {listing.price !== null && (
          <p style={{ fontSize: 28, fontWeight: 700, color: C.accent, margin: '8px 0 0', fontFamily: FONT_DISPLAY }}>
            A${Number(listing.price).toFixed(2)}
          </p>
        )}
        {listing.category && (
          <span style={{ display: 'inline-block', marginTop: 10, padding: '4px 10px', background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: RADIUS.pill, fontSize: 11, color: C.textDim }}>
            {listing.category}
          </span>
        )}

        {/* Business strip */}
        <Link href={`/community/businesses/${listing.business_id}`} prefetch={false} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 14px', marginTop: 16,
          background: C.surface, borderRadius: RADIUS.md, border: `1.5px solid ${C.border}`,
          textDecoration: 'none', color: C.text,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: biz?.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
            color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16, border: `1.5px solid ${C.border}`, flexShrink: 0,
          }}>
            {!biz?.logo_url && (biz?.name?.[0] ?? '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {biz?.name}
              {biz?.community_verified && <BadgeCheck size={14} style={{ color: C.accent }} />}
            </p>
            {(biz?.suburb || biz?.city) && (
              <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <MapPin size={11} /> {biz?.suburb ?? biz?.city}
              </p>
            )}
          </div>
        </Link>

        {/* Description */}
        {listing.description && (
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.textMuted, margin: '0 0 8px' }}>About this item</p>
            <p style={{ fontSize: 14, color: C.textDim, margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{listing.description}</p>
          </div>
        )}

        {/* No-pay notice */}
        <div style={{ marginTop: 22, padding: '12px 14px', background: 'rgba(127,184,151,0.05)', border: `1.5px solid ${C.border}`, borderRadius: RADIUS.md, fontSize: 12, color: C.textDim, display: 'flex', gap: 10, lineHeight: 1.5 }}>
          <Shield size={16} style={{ color: C.accent, flexShrink: 0, marginTop: 1 }} />
          <span>
            <strong style={{ color: C.text }}>No online payment.</strong> Message the shop to arrange pickup and pay in person. Personal details (phone, email, address) are blocked in chat — sort the rest at the shop.
          </span>
        </div>

        {/* Message to buy */}
        <button onClick={() => setShowChat(true)}
          style={{
            marginTop: 16, width: '100%',
            padding: '14px', borderRadius: RADIUS.pill,
            background: C.accent, color: C.ink,
            border: 'none', fontSize: 15, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            minHeight: 48,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          <Send size={16} /> Message to buy
        </button>
      </section>

      {/* Chat drawer */}
      {showChat && (
        <div onClick={() => setShowChat(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: C.bg, width: '100%', maxWidth: MAX_W, margin: '0 auto',
            borderTopLeftRadius: 24, borderTopRightRadius: 24,
            display: 'flex', flexDirection: 'column',
            height: '85vh', maxHeight: '85vh',
            paddingBottom: 'env(safe-area-inset-bottom, 0)',
          }}>
            {/* Drawer handle */}
            <div style={{ padding: '10px 0', display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
            </div>

            {/* Drawer header */}
            <header style={{ padding: '4px 16px 12px', borderBottom: `1.5px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: biz?.logo_url ? `url(${biz.logo_url}) center/cover` : C.accentDeep,
                color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {!biz?.logo_url && (biz?.name?.[0] ?? '?')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {biz?.name}
                  {biz?.community_verified && <BadgeCheck size={13} style={{ color: C.accent }} />}
                </p>
                <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  About: {listing.title}
                </p>
              </div>
              <button onClick={() => setShowChat(false)}
                style={{ background: 'transparent', border: 'none', color: C.textMuted, padding: 8, cursor: 'pointer', minHeight: 36, minWidth: 36 }}>
                ×
              </button>
            </header>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: C.textMuted, fontSize: 13, lineHeight: 1.5 }}>
                  Say hi. Ask if it&apos;s still available, when you can pop in.<br />
                  <strong style={{ color: C.text }}>Personal details (phone, email, address) are blocked for safety</strong> — arrange the rest in person.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: m.from === 'member' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '78%',
                    padding: '10px 14px',
                    borderRadius: m.from === 'member' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: m.from === 'member' ? C.accent : C.surface,
                    color: m.from === 'member' ? C.ink : C.text,
                    fontSize: 14, lineHeight: 1.4,
                    border: m.from === 'member' ? 'none' : `1.5px solid ${C.border}`,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {m.text}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
              {chatId && messages.length > 0 && (
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                  <button
                    onClick={async () => {
                      if (!confirm('Report this conversation to keep the community safe?')) return
                      await fetch('/api/community/report', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message_id: chatId, business_id: listing.business_id, reason: 'reported from chat' }),
                      }).catch(() => null)
                      alert('Thanks — reported. We\'ll take a look.')
                    }}
                    style={{ background: 'transparent', border: 'none', color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
                    report this conversation
                  </button>
                </div>
              )}
            </div>

            {/* Blocked notice */}
            {blocked && (
              <div style={{ padding: '10px 16px', background: 'rgba(245,158,11,0.08)', borderTop: `1px solid rgba(245,158,11,0.25)`, color: C.warning, fontSize: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <Shield size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{blocked}</span>
              </div>
            )}

            {/* Composer */}
            <div style={{ padding: '10px 12px 14px', borderTop: `1.5px solid ${C.border}`, display: 'flex', gap: 8 }}>
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setBlocked(null) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Message…"
                maxLength={1000}
                style={{
                  flex: 1, padding: '11px 14px', borderRadius: RADIUS.pill,
                  background: C.surfaceHi, border: `1.5px solid ${C.border}`,
                  color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                  minHeight: 40,
                }}
              />
              <button onClick={send} disabled={sending || !input.trim()}
                style={{
                  width: 44, height: 44, borderRadius: '50%', border: 'none',
                  background: C.accent, color: C.ink,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: sending || !input.trim() ? 0.5 : 1,
                  flexShrink: 0,
                }}>
                {sending ? <Loader2 size={16} className="community-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
