'use client'
import { useCallback, useEffect, useState } from 'react'

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

// ─── Design tokens — same palette as all other portal pages ─────────────
const CARD      = '#ffffff'
const INK       = '#1d2a24'
const MUTED     = '#6b7d74'
const LINE      = '#e6ece8'
const SAGE      = '#7FB897'
const DEEP      = '#2D5240'
const SAGE_TINT = '#eef6f1'
const AMBER     = '#BA7517'
const RED       = '#E24B4A'
const SHADOW    = '0 1px 2px rgba(45,82,64,.06), 0 8px 24px rgba(45,82,64,.06)'

// ─── Priority chip for announcements (light-mode palette) ────────────────
function priorityStyle(p: string) {
  if (p === 'urgent') return { chipBg: 'rgba(226,75,74,.12)', chipColor: RED,   left: RED,   label: 'Urgent' }
  if (p === 'high')   return { chipBg: 'rgba(186,117,23,.12)', chipColor: AMBER, left: AMBER, label: 'High'   }
  return                     { chipBg: SAGE_TINT,              chipColor: DEEP,  left: SAGE,  label: 'Normal' }
}

// ─── timeAgo — PRESERVED EXACTLY ─────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function Bone({ h = 16, r = 8, w = '100%' }: { h?: number; r?: number; w?: string | number }) {
  return <div style={{ height: h, width: w, borderRadius: r, background: 'rgba(45,82,64,.08)' }} />
}

function SkeletonMessage() {
  return (
    <div style={{
      background: CARD, borderRadius: 16, boxShadow: SHADOW,
      border: '1px solid ' + LINE, borderLeft: '3px solid rgba(127,184,151,.3)',
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Bone h={32} r={99} w={32} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <Bone h={13} r={5} w="35%" />
            <Bone h={11} r={4} w={40} />
          </div>
          <Bone h={15} r={5} w="70%" />
          <div style={{ marginTop: 6 }}><Bone h={11} r={4} w="30%" /></div>
        </div>
      </div>
    </div>
  )
}

// ─── Section label ────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase',
      color: MUTED, margin: '0 4px 10px', fontWeight: 600,
    }}>
      {text}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────
export default function StaffMessagesPage() {
  const [messages,      setMessages]      = useState<Message[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading,       setLoading]       = useState(true)
  // STAFF-MSG-FIX — open + reply state
  const [selected,  setSelected]  = useState<Message | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending,   setSending]   = useState(false)
  const [replyMsg,  setReplyMsg]  = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/staff/portal/messages')
      const j = await r.json() as { messages?: Message[]; announcements?: Announcement[] }
      setMessages(j.messages ?? [])
      setAnnouncements(j.announcements ?? [])
    } catch { /* keep previous state */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Open a message → show detail + mark it read (server + optimistic local clear).
  function openMessage(m: Message) {
    setSelected(m); setReplyText(''); setReplyMsg('')
    if (!m.read_at) {
      setMessages(prev => prev.map(x => x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x))
      fetch('/api/staff/portal/messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: m.id }),
      }).catch(() => {})
    }
  }

  async function sendReply() {
    if (!selected || !replyText.trim()) return
    setSending(true); setReplyMsg('')
    try {
      const r = await fetch('/api/staff/portal/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply_to_id: selected.id, body: replyText.trim() }),
      })
      const j = await r.json()
      if (!r.ok) { setReplyMsg(j.error ?? 'Could not send reply'); return }
      setReplyMsg('Reply sent ✓'); setReplyText('')
      await load()
    } catch { setReplyMsg('Could not send reply') }
    finally { setSending(false) }
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) return (
    <div>
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <div className="animate-pulse"><Bone h={26} r={6} w="35%" /></div>
      </div>
      <div className="animate-pulse" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SkeletonMessage />
        <SkeletonMessage />
        <SkeletonMessage />
      </div>
    </div>
  )

  // ── Derived state — PRESERVED EXACTLY ────────────────────────────────────
  const hasContent = announcements.length > 0 || messages.length > 0
  const unreadCount = messages.filter(m => !m.read_at).length

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!hasContent) return (
    <div>
      <div style={{ paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE }}>
        <h1 style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 26, fontWeight: 600, color: INK,
          margin: 0, lineHeight: 1.15,
        }}>
          Inbox
        </h1>
      </div>
      <div style={{
        background: CARD, borderRadius: 20, boxShadow: SHADOW,
        border: '1px solid ' + LINE, padding: '40px 24px', textAlign: 'center',
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: 15, background: SAGE_TINT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px', fontSize: 22,
        }}>
          ✉️
        </div>
        <div style={{
          fontFamily: 'var(--font-display, serif)',
          fontSize: 18, fontWeight: 600, color: INK, marginBottom: 6,
        }}>
          No messages yet
        </div>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.55, maxWidth: 240, margin: '0 auto' }}>
          Messages from your manager will appear here.
        </p>
      </div>
    </div>
  )

  return (
    <div>
      {/* AN-E spell 15 swipe-dismiss: entrance slide-in-from-right + transition prep on inbox rows */}
      <style>{`
        @keyframes anSwipeDismissIn{from{opacity:0;transform:translateX(18px)}to{opacity:1;transform:translateX(0)}}
        .an-swipe-dismiss{animation:anSwipeDismissIn .42s cubic-bezier(.22,1,.36,1) both}
        @media (prefers-reduced-motion: reduce){.an-swipe-dismiss{animation:none!important;transition:none!important}}
      `}</style>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        paddingBottom: 16, marginBottom: 22, borderBottom: '1px solid ' + LINE,
      }}>
        <div>
          <h1 style={{
            fontFamily: 'var(--font-display, serif)',
            fontSize: 26, fontWeight: 600, color: INK,
            margin: 0, lineHeight: 1.15,
          }}>
            Inbox
          </h1>
          <p style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
            Messages and announcements from your manager
          </p>
        </div>
        {unreadCount > 0 && (
          <div style={{
            background: SAGE, color: DEEP,
            borderRadius: 99, padding: '3px 10px',
            fontSize: 12, fontWeight: 700, flexShrink: 0,
          }}>
            {unreadCount} unread
          </div>
        )}
      </div>

      {/* ── Announcements section ─────────────────────────────────────────── */}
      {announcements.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <SectionLabel text="Announcements" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {announcements.map(a => {
              const ps = priorityStyle(a.priority)
              return (
                <div key={a.id} style={{
                  background: CARD, borderRadius: 16, boxShadow: SHADOW,
                  border: '1px solid ' + LINE,
                  borderLeft: '3px solid ' + ps.left,
                  padding: '14px 16px',
                }}>
                  {/* Title row */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start', marginBottom: 8, gap: 8,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-display, serif)',
                      fontSize: 16, fontWeight: 600, color: INK, flex: 1,
                    }}>
                      {a.title}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 600,
                      padding: '3px 10px', borderRadius: 999,
                      background: ps.chipBg, color: ps.chipColor,
                      flexShrink: 0,
                    }}>
                      {ps.label}
                    </span>
                  </div>

                  {/* Body */}
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5, marginBottom: 8 }}>
                    {a.body}
                  </div>

                  {/* Footer */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED }}>
                    <span>{timeAgo(a.created_at)}</span>
                    {a.expires_at && (
                      <>
                        <span style={{ opacity: 0.4 }}>·</span>
                        <span>
                          expires {new Date(a.expires_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Direct messages section ───────────────────────────────────────── */}
      {messages.length > 0 && (
        <div>
          <SectionLabel text="Messages" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map(m => {
              // ── unread + senderName — PRESERVED EXACTLY ───────────────────
              const unread = !m.read_at
              const senderName = m.sender
                ? m.sender.first_name + ' ' + m.sender.last_name
                : 'Manager'

              // Sender avatar initials
              const initials = m.sender
                ? m.sender.first_name[0] + m.sender.last_name[0]
                : 'M'
              const avatarColor = m.sender?.color ?? DEEP

              return (
                <div key={m.id} className="an-swipe-dismiss"
                  role="button" tabIndex={0}
                  onClick={() => openMessage(m)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openMessage(m) } }}
                  style={{
                  background: CARD, borderRadius: 16, boxShadow: SHADOW,
                  border: '1px solid ' + (unread ? 'rgba(127,184,151,.3)' : LINE),
                  borderLeft: '3px solid ' + (unread ? SAGE : LINE),
                  padding: '14px 16px',
                  touchAction: 'pan-y', cursor: 'pointer',
                  transition: 'transform 280ms cubic-bezier(.22,1,.36,1), opacity 280ms ease',
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                    {/* Sender avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: avatarColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      {initials}
                    </div>

                    {/* Message content */}
                    <div style={{ flex: 1, minWidth: 0 }}>

                      {/* Top row: sender + timestamp */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline', marginBottom: 4, gap: 6,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {/* Unread dot — preserving unread = !m.read_at logic */}
                          {unread && (
                            <div style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: SAGE, flexShrink: 0,
                            }} />
                          )}
                          <span style={{
                            fontSize: 13, fontWeight: unread ? 700 : 500, color: INK,
                          }}>
                            {senderName}
                          </span>
                          {m.is_broadcast && (
                            <span style={{
                              fontSize: 10, fontWeight: 600,
                              background: SAGE_TINT, color: DEEP,
                              padding: '2px 7px', borderRadius: 999,
                              flexShrink: 0,
                            }}>
                              All staff
                            </span>
                          )}
                        </div>
                        <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>
                          {timeAgo(m.created_at)}
                        </span>
                      </div>

                      {/* Subject or body preview — PRESERVED EXACTLY */}
                      {m.subject ? (
                        <>
                          <div style={{
                            fontSize: 14, fontWeight: unread ? 600 : 500, color: INK,
                            marginBottom: 4,
                          }}>
                            {m.subject}
                          </div>
                          <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>
                            {m.body}
                          </div>
                        </>
                      ) : (
                        <div style={{
                          fontSize: 14, fontWeight: unread ? 600 : 400, color: unread ? INK : MUTED,
                          lineHeight: 1.45,
                        }}>
                          {m.body.slice(0, 60)}{m.body.length > 60 ? '…' : ''}
                        </div>
                      )}

                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── STAFF-MSG-FIX — message detail + reply ───────────────────────── */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(29,42,36,.45)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: CARD, width: '100%', maxWidth: 560,
              borderRadius: '20px 20px 0 0', boxShadow: SHADOW,
              padding: '20px 20px 24px', maxHeight: '88vh', overflowY: 'auto',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  background: selected.sender?.color ?? DEEP,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                }}>
                  {selected.sender ? selected.sender.first_name[0] + selected.sender.last_name[0] : 'M'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>
                    {selected.sender ? selected.sender.first_name + ' ' + selected.sender.last_name : 'Manager'}
                  </div>
                  <div style={{ fontSize: 12, color: MUTED }}>{timeAgo(selected.created_at)}{selected.is_broadcast ? ' · All staff' : ''}</div>
                </div>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" style={{
                border: 'none', background: SAGE_TINT, color: DEEP, borderRadius: 10,
                width: 32, height: 32, fontSize: 16, cursor: 'pointer', flexShrink: 0,
              }}>×</button>
            </div>

            {selected.subject && (
              <div style={{ fontFamily: 'var(--font-display, serif)', fontSize: 18, fontWeight: 600, color: INK, marginBottom: 8 }}>
                {selected.subject}
              </div>
            )}
            <div style={{ fontSize: 14, color: INK, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 18 }}>
              {selected.body}
            </div>

            {/* Reply */}
            <div style={{ borderTop: '1px solid ' + LINE, paddingTop: 14 }}>
              <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: MUTED, fontWeight: 600, marginBottom: 8 }}>Reply</div>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Write a reply to your manager…"
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'vertical',
                  border: '1px solid ' + LINE, borderRadius: 12, padding: '10px 12px',
                  fontSize: 14, color: INK, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  style={{
                    border: 'none', borderRadius: 99, padding: '9px 18px',
                    background: DEEP, color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
                    opacity: sending || !replyText.trim() ? 0.55 : 1,
                  }}
                >
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
                {replyMsg && <span style={{ fontSize: 12, color: replyMsg.includes('✓') ? DEEP : RED }}>{replyMsg}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
