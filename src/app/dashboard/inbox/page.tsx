'use client'
import { useState, useEffect, useCallback } from 'react'

// Locked Pipel design system (prompt 83) — light, ink-on-cream, hard 1.5px borders.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e', LIVE = '#ff3b5e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

interface Item { source: string; id: string; business_id: string; customer_identifier: string | null; preview: string | null; created_at: string; has_unread: boolean }
type Msg = { role?: string; sender?: string; content?: string; text?: string; body?: string; at?: string; created_at?: string }
interface Detail { source: string; [k: string]: unknown }
interface Summary { headline: string; asks: string[]; loved: string | null; disliked: string | null; faq: string[]; sentiment: string }

const SOURCE_META: Record<string, { icon: string; label: string }> = {
  kiosk_chat: { icon: '💬', label: 'Kiosk chat' },
  marketplace_chat: { icon: '🛍️', label: 'Marketplace' },
  demand_signal: { icon: '📈', label: 'Demand signal' },
  community_report: { icon: '⚠️', label: 'Reported message' },
  blocked_visitor: { icon: '🚫', label: 'Blocked visitor' },
  kiosk_help_request: { icon: '🙋', label: 'Talk to staff' },
  feedback: { icon: '👍', label: 'Feedback' },
}
const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['messages', 'Messages'], ['demand', 'Demand'], ['feedback', 'Feedback'], ['flagged', 'Flagged']] as const

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function msgText(m: Msg): string { return m.content ?? m.text ?? m.body ?? '' }
function msgRole(m: Msg): string { return (m.role ?? m.sender ?? '').toLowerCase() }

export default function InboxPage() {
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState<string>('all')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Item | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => { fetch('/api/dashboard/inbox/summary').then(r => r.json()).then(d => setSummary(d.summary ?? null)).catch(() => {}) }, [])

  const load = useCallback(async (f: string) => {
    setLoading(true)
    try {
      const d = await fetch(`/api/dashboard/inbox?filter=${f}`).then(r => r.json())
      setItems(d.items ?? [])
      setUnread(d.unread_count ?? 0)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  async function open(it: Item) {
    setSelected(it); setDetail(null); setReply(''); setDetailLoading(true)
    try {
      const d = await fetch(`/api/dashboard/inbox?source=${it.source}&id=${it.id}`).then(r => r.json())
      setDetail(d.detail ?? null)
    } catch { /* ignore */ }
    setDetailLoading(false)
    if (it.has_unread) {
      setItems(prev => prev.map(x => x.id === it.id ? { ...x, has_unread: false } : x))
      setUnread(u => Math.max(0, u - 1))
    }
  }

  async function sendReply() {
    if (!selected || selected.source !== 'marketplace_chat' || !reply.trim()) return
    setSending(true)
    try {
      const r = await fetch('/api/community/owner/chats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: selected.id, text: reply.trim() }) }).then(x => x.json())
      if (r.blocked) { alert(r.reason ?? 'Message blocked'); }
      else { setReply(''); const d = await fetch(`/api/dashboard/inbox?source=marketplace_chat&id=${selected.id}`).then(x => x.json()); setDetail(d.detail ?? null) }
    } catch { /* ignore */ }
    setSending(false)
  }

  const canReply = selected?.source === 'marketplace_chat'

  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, padding: '24px 28px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Customer inbox</h1>
        <p style={{ fontSize: 14, color: INK_SOFT, margin: '0 0 18px' }}>
          Every customer interaction in one place — kiosk chats, marketplace messages, demand signals and flags.{unread > 0 ? ` ${unread} unread.` : ''}
        </p>

        {/* Aria's weekly read */}
        {summary && (
          <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 18, marginBottom: 16, boxShadow: '4px 4px 0 #0a0a0a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 7, background: ACCENT, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>a</span>
              <span style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aria&apos;s weekly read</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_SOFT }}>sentiment: {summary.sentiment}</span>
            </div>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px', lineHeight: 1.5 }}>{summary.headline}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {summary.asks.length > 0 && (
                <div><div style={{ fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', marginBottom: 4 }}>Asked for, you don&apos;t sell</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>{summary.asks.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
              )}
              {summary.faq.length > 0 && (
                <div><div style={{ fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', marginBottom: 4 }}>Repeated questions → add to FAQ</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.6 }}>{summary.faq.map((a, i) => <li key={i}>{a}</li>)}</ul></div>
              )}
              {(summary.loved || summary.disliked) && (
                <div><div style={{ fontSize: 11, fontWeight: 700, color: INK_SOFT, textTransform: 'uppercase', marginBottom: 4 }}>Products</div>
                  {summary.loved && <div style={{ fontSize: 13 }}>❤️ {summary.loved}</div>}
                  {summary.disliked && <div style={{ fontSize: 13, marginTop: 2 }}>⚠️ {summary.disliked}</div>}</div>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => { setFilter(key); setSelected(null); setDetail(null) }}
              style={{ height: 34, padding: '0 14px', borderRadius: 12, border: BORDER, background: filter === key ? ACCENT : SURFACE, color: INK, fontSize: 13, fontWeight: filter === key ? 700 : 500, cursor: 'pointer', fontFamily: FONT }}>
              {label}{key === 'unread' && unread > 0 ? ` (${unread})` : ''}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16, alignItems: 'start' }}>
          {/* Timeline */}
          <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, overflow: 'hidden' }}>
            {loading ? (
              <p style={{ padding: 24, color: INK_SOFT, textAlign: 'center', fontSize: 14 }}>Loading…</p>
            ) : items.length === 0 ? (
              <p style={{ padding: 32, color: INK_SOFT, textAlign: 'center', fontSize: 14 }}>Nothing here yet. Customer interactions will appear as they happen.</p>
            ) : items.map((it, i) => {
              const meta = SOURCE_META[it.source] ?? { icon: '•', label: it.source }
              const active = selected?.id === it.id && selected?.source === it.source
              return (
                <button key={`${it.source}-${it.id}`} onClick={() => open(it)}
                  style={{ display: 'flex', gap: 11, width: '100%', textAlign: 'left', alignItems: 'flex-start', padding: '13px 15px', background: active ? CREAM : 'transparent', border: 'none', borderTop: i === 0 ? 'none' : `1px solid #eee`, cursor: 'pointer', fontFamily: FONT }}>
                  <span style={{ fontSize: 18, lineHeight: 1.2, flexShrink: 0 }} aria-hidden>{meta.icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{meta.label}</span>
                      {it.has_unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: LIVE, flexShrink: 0 }} />}
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: INK_SOFT, flexShrink: 0 }}>{ago(it.created_at)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 13, color: '#333', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.preview ?? '—'}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Detail */}
          <div style={{ background: SURFACE, border: BORDER, borderRadius: 18, padding: 20, minHeight: 320 }}>
            {!selected ? (
              <p style={{ color: INK_SOFT, fontSize: 14, textAlign: 'center', paddingTop: 80 }}>Select an item to read the full interaction.</p>
            ) : detailLoading ? (
              <p style={{ color: INK_SOFT, fontSize: 14 }}>Loading…</p>
            ) : !detail ? (
              <p style={{ color: INK_SOFT, fontSize: 14 }}>Could not load this item.</p>
            ) : (
              <DetailView detail={detail} />
            )}

            {canReply && detail && (
              <div style={{ marginTop: 16, borderTop: `1px solid #eee`, paddingTop: 14 }}>
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} placeholder="Reply to the customer…"
                  style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: BORDER, padding: '10px 12px', fontSize: 14, fontFamily: FONT, resize: 'vertical', outline: 'none' }} />
                <button onClick={sendReply} disabled={sending || !reply.trim()}
                  style={{ marginTop: 8, height: 40, padding: '0 18px', borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, opacity: sending || !reply.trim() ? 0.6 : 1 }}>
                  {sending ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function DetailView({ detail }: { detail: Detail }) {
  const meta = SOURCE_META[detail.source] ?? { icon: '•', label: detail.source }
  const header = <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7 }}><span aria-hidden>{meta.icon}</span>{meta.label}</div>

  if (detail.source === 'kiosk_chat' || detail.source === 'marketplace_chat') {
    const raw = (detail.messages as Msg[] | null) ?? []
    const msgs = Array.isArray(raw) ? raw : []
    const listing = (detail.marketplace_listings as { title?: string } | null)
    return (
      <div>
        {header}
        {listing?.title && <div style={{ fontSize: 13, color: INK_SOFT, marginBottom: 10 }}>Re: <strong style={{ color: INK }}>{listing.title}</strong></div>}
        {detail.email_captured ? <div style={{ fontSize: 12, color: INK_SOFT, marginBottom: 10 }}>Email captured: {String(detail.email_captured)}</div> : null}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {msgs.length === 0 ? <p style={{ color: INK_SOFT, fontSize: 13 }}>No messages.</p> : msgs.map((m, i) => {
            const mine = ['owner', 'assistant', 'aria', 'business'].includes(msgRole(m))
            return (
              <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', background: mine ? ACCENT : CREAM, border: BORDER, borderRadius: 14, padding: '8px 12px', fontSize: 13.5, lineHeight: 1.45 }}>
                {msgText(m)}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (detail.source === 'demand_signal') {
    return (
      <div>{header}
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{String(detail.product_asked ?? detail.query_text ?? 'Customer demand')}</div>
        {detail.query_text ? <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>&ldquo;{String(detail.query_text)}&rdquo;</p> : null}
        <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 10 }}>
          {detail.in_stock === false ? 'Not in stock — a gap worth filling.' : detail.in_stock === true ? 'In stock.' : ''} {detail.signal_type ? `· ${String(detail.signal_type)}` : ''}
        </div>
      </div>
    )
  }

  if (detail.source === 'community_report') {
    return (
      <div>{header}
        <div style={{ fontSize: 14, marginBottom: 8 }}>Reason: <strong>{String(detail.reason ?? 'flagged')}</strong></div>
        <div style={{ fontSize: 13, color: INK_SOFT }}>Status: {String(detail.status ?? 'pending')}</div>
        <p style={{ fontSize: 13, color: INK_SOFT, marginTop: 12, lineHeight: 1.5 }}>Manage blocks and reports from the community owner tools.</p>
      </div>
    )
  }

  if (detail.source === 'blocked_visitor') {
    return (
      <div>{header}
        <div style={{ fontSize: 14, marginBottom: 8 }}>A visitor was blocked{detail.reason ? `: ${String(detail.reason)}` : ''}.</div>
        <div style={{ fontSize: 12, color: INK_SOFT, fontFamily: 'monospace' }}>{String(detail.session_token ?? '')}</div>
      </div>
    )
  }

  if (detail.source === 'kiosk_help_request') {
    return (
      <div>{header}
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{String(detail.title ?? 'Talk-to-staff request')}</div>
        {detail.description ? <p style={{ fontSize: 14, color: '#333', lineHeight: 1.6 }}>{String(detail.description)}</p> : null}
        <div style={{ fontSize: 13, color: INK_SOFT, marginTop: 10 }}>Status: {String(detail.status ?? 'pending')}</div>
      </div>
    )
  }

  return <div>{header}<pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#333' }}>{JSON.stringify(detail, null, 2)}</pre></div>
}
