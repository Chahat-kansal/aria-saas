'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send } from 'lucide-react'
import { C, BORDER, RADIUS, MAX_W, FONT } from '../../theme'
import { supabase } from '@/lib/supabase'

interface DmMessage { from: 'member' | 'owner'; text: string; ts: string }
interface Business { id: string; name: string; logo_url: string | null; industry: string | null; city: string | null }
interface ThreadResponse {
  thread: { id: string; messages: DmMessage[]; last_message_at: string | null } | null
  business: Business | null
  member: { id: string; nickname: string | null } | null
}

export default function DmPage() {
  const router = useRouter()
  const params = useParams()
  const businessId = params?.businessId as string

  const [business, setBusiness] = useState<Business | null>(null)
  const [messages, setMessages] = useState<DmMessage[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [member, setMember] = useState<{ id: string; nickname: string | null } | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [blocked, setBlocked] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r: ThreadResponse = await fetch('/api/community/dm?business_id=' + encodeURIComponent(businessId)).then(r => r.json())
    setBusiness(r.business ?? null)
    setMember(r.member ?? null)
    if (r.thread) {
      setThreadId(r.thread.id)
      setMessages(r.thread.messages ?? [])
    }
    setLoading(false)
  }, [businessId])

  useEffect(() => { load() }, [load])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime — subscribe to UPDATE on the thread row
  useEffect(() => {
    if (!threadId) return
    if (channelRef.current) supabase.removeChannel(channelRef.current)

    const ch = supabase
      .channel('dm:' + threadId)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'marketplace_chats', filter: 'id=eq.' + threadId },
        (payload: { new: Record<string, unknown> }) => {
          const msgs = payload.new.messages
          if (Array.isArray(msgs)) setMessages(msgs as DmMessage[])
        }
      )
      .subscribe()

    channelRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [threadId])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    setBlocked(null)
    try {
      const r = await fetch('/api/community/dm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, text: text.trim() }),
      }).then(r => r.json())

      if (r.blocked) {
        setBlocked(r.reason ?? 'Message blocked by privacy filter.')
      } else if (r.ok) {
        setText('')
        if (!threadId && r.thread_id) {
          setThreadId(r.thread_id)
          // Re-load to get full thread with Realtime wired
          await load()
        }
      }
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px', fontFamily: FONT }}>
        <div style={{ height: 44, background: C.surfaceHi, borderRadius: RADIUS.md, marginBottom: 16 }} />
        {[0, 1, 2].map(i => (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 14, justifyContent: i % 2 === 0 ? 'flex-start' : 'flex-end' }}>
            <div style={{ height: 40, width: '65%', background: C.surfaceHi, borderRadius: RADIUS.lg }} />
          </div>
        ))}
      </main>
    )
  }

  if (!business) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '40px 16px', textAlign: 'center', fontFamily: FONT }}>
        <p style={{ color: C.textMuted }}>Business not found.</p>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', fontFamily: FONT, display: 'flex', flexDirection: 'column', height: '100dvh', background: C.bg }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: C.surface, borderBottom: BORDER, flexShrink: 0 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={20} color={C.ink} />
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: RADIUS.pill, flexShrink: 0,
          background: business.logo_url ? `url(${business.logo_url}) center/cover` : C.accent,
          border: BORDER,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: C.ink, fontWeight: 700, fontSize: 14,
        }}>
          {!business.logo_url && business.name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{business.name}</p>
          {business.city && <p style={{ fontSize: 11, color: C.inkSoft, margin: '1px 0 0' }}>{business.city}</p>}
        </div>
      </header>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 20px' }}>
            <p style={{ fontSize: 14, color: C.inkSoft, margin: 0 }}>
              Start a conversation with {business.name}.
            </p>
            <p style={{ fontSize: 12, color: C.inkSoft, margin: '6px 0 0', lineHeight: 1.5, opacity: 0.7 }}>
              Messages are anonymous. No personal details shared with the shop.
            </p>
          </div>
        )}
        {messages.map((m, i) => {
          const isMe = m.from === 'member'
          return (
            <div key={i} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '75%', padding: '10px 13px',
                background: isMe ? C.accent : C.surface,
                border: BORDER,
                borderRadius: isMe ? `${RADIUS.lg}px ${RADIUS.lg}px 6px ${RADIUS.lg}px` : `${RADIUS.lg}px ${RADIUS.lg}px ${RADIUS.lg}px 6px`,
                color: C.ink,
              }}>
                <p style={{ fontSize: 14, margin: 0, lineHeight: 1.45, wordBreak: 'break-word' }}>{m.text}</p>
                <p style={{ fontSize: 10, color: C.inkSoft, margin: '4px 0 0', textAlign: isMe ? 'right' : 'left' }}>
                  {new Date(m.ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Privacy notice banner */}
      <div style={{ padding: '6px 14px', background: C.surfaceAlt, borderTop: `1px solid ${C.surfaceAlt}` }}>
        <p style={{ fontSize: 10, color: C.inkSoft, margin: 0, textAlign: 'center' }}>
          Messages are filtered — no phone numbers, emails or addresses allowed.
        </p>
      </div>

      {blocked && (
        <div style={{ padding: '8px 14px', background: '#fff0f0', borderTop: `1px solid #fecaca` }}>
          <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{blocked}</p>
        </div>
      )}

      {!member && (
        <div style={{ padding: '10px 14px', background: C.surface, borderTop: BORDER, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: C.inkSoft, margin: 0 }}>
            <a href="/community/me" style={{ color: C.ink, fontWeight: 700, textDecoration: 'underline' }}>Join the community</a> to send messages.
          </p>
        </div>
      )}

      {/* Input */}
      {member && (
        <form
          onSubmit={e => { e.preventDefault(); send() }}
          style={{ display: 'flex', gap: 8, padding: '10px 14px 14px', background: C.surface, borderTop: BORDER, flexShrink: 0 }}
        >
          <input
            value={text}
            onChange={e => { setText(e.target.value); setBlocked(null) }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Message…"
            maxLength={1000}
            style={{
              flex: 1, padding: '11px 14px', background: C.surfaceAlt,
              border: BORDER, borderRadius: RADIUS.lg,
              color: C.ink, fontSize: 14, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            style={{
              width: 44, height: 44, borderRadius: RADIUS.lg, flexShrink: 0,
              background: text.trim() ? C.accent : C.surfaceAlt,
              border: BORDER,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: (sending || !text.trim()) ? 'default' : 'pointer',
              opacity: sending ? 0.5 : 1,
              transition: 'background 160ms',
            }}
          >
            <Send size={16} color={C.ink} />
          </button>
        </form>
      )}
    </main>
  )
}
