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

  // ── Data fetch — PRESERVED EXACTLY ───────────────────────────────────────
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
                <div key={m.id} style={{
                  background: CARD, borderRadius: 16, boxShadow: SHADOW,
                  border: '1px solid ' + (unread ? 'rgba(127,184,151,.3)' : LINE),
                  borderLeft: '3px solid ' + (unread ? SAGE : LINE),
                  padding: '14px 16px',
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

    </div>
  )
}
