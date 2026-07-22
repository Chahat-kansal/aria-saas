'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard, type PostCardData } from '../../PostCard'
import { LevelChip } from '../../LevelChip'
import { PALETTE, BORDER, RADIUS, MAX_W, SIGNAL_COLORS } from '../../theme'

interface Level { level: number; name: string }
interface Reply { id: string; text: string | null; nickname: string; created_at: string; member_id?: string | null; level?: Level | null }
interface Comment { id: string; text: string | null; nickname: string; created_at: string; member_id?: string | null; level?: Level | null; replies?: Reply[] }

function fmtRel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + 'h'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [post, setPost] = useState<PostCardData | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [ariaQ, setAriaQ] = useState('')
  const [ariaReply, setAriaReply] = useState<string | null>(null)
  const [ariaBusy, setAriaBusy] = useState(false)
  const threadRef = useRef<HTMLElement>(null) // CX-POLISH-2 — comment button scrolls here
  // CX-POLISH-3 — comment composer + replies
  const [cInput, setCInput] = useState('')
  const [cPosting, setCPosting] = useState(false)
  const [cError, setCError] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: string; nickname: string } | null>(null)
  const [replyInput, setReplyInput] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    const d = await fetch('/api/community/engagement?post_id=' + id).then(r => r.json()).catch(() => null)
    if (!d || !d.post) { setNotFound(true); setLoading(false); return }
    setPost(d.post as PostCardData)
    setComments((d.comments ?? []) as Comment[])
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  async function submitComment(text: string, parentId?: string): Promise<boolean> {
    const t = text.trim()
    if (!t || cPosting) return false
    setCPosting(true); setCError('')
    try {
      const res = await fetch('/api/community/engagement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: id, type: 'comment', comment_text: t, ...(parentId ? { parent_id: parentId } : {}) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setCError(d.error ?? d.reason ?? 'Could not post your comment.'); setCPosting(false); return false }
      await load() // refresh the thread (new comment / reply nested in)
      setCPosting(false)
      return true
    } catch { setCError('Network error — please try again.'); setCPosting(false); return false }
  }

  async function askAria() {
    if (!ariaQ.trim() || ariaBusy) return
    setAriaBusy(true); setAriaReply(null)
    try {
      const r = await fetch('/api/community/posts/' + id + '/aria-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: ariaQ.trim() }),
      }).then(r => r.json())
      setAriaReply(r.reply ?? 'Aria is unavailable right now.')
    } catch { setAriaReply('Aria is unavailable right now.') }
    setAriaBusy(false)
  }

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ height: 320, background: PALETTE.surfaceAlt, borderRadius: RADIUS.lg }} />
      </main>
    )
  }
  if (notFound || !post) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>post not found</p>
        <button onClick={() => router.back()} style={{ marginTop: 16, background: 'transparent', border: BORDER, borderRadius: RADIUS.md, padding: '9px 18px', color: PALETTE.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>← back</button>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '12px 16px 32px' }}>
      <button onClick={() => router.back()} aria-label="Back"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, marginBottom: 4 }}>
        <ArrowLeft size={18} color={PALETTE.ink} />
      </button>

      <PostCard post={post} showHide={false} onCommentClick={() => threadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

      {/* Ask Aria — explicit trigger, grounded reply */}
      <section style={{ marginTop: 14, background: PALETTE.surface, border: `1.5px solid ${SIGNAL_COLORS.fresh}`, borderRadius: RADIUS.lg, padding: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: SIGNAL_COLORS.fresh, margin: '0 0 8px' }}>✦ Ask Aria about this</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={ariaQ} onChange={e => setAriaQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') askAria() }}
            placeholder="e.g. what does this offer include?" maxLength={200}
            style={{ flex: 1, padding: '10px 12px', background: PALETTE.surfaceAlt, border: BORDER, borderRadius: RADIUS.md, color: PALETTE.ink, fontSize: 13, outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
          <button onClick={askAria} disabled={ariaBusy || !ariaQ.trim()}
            style={{ padding: '0 16px', background: SIGNAL_COLORS.fresh, color: '#fff', border: 'none', borderRadius: RADIUS.md, fontSize: 13, fontWeight: 700, cursor: ariaBusy || !ariaQ.trim() ? 'not-allowed' : 'pointer', minHeight: 42, opacity: ariaBusy || !ariaQ.trim() ? 0.5 : 1, fontFamily: 'inherit' }}>
            {ariaBusy ? '…' : 'Ask'}
          </button>
        </div>
        {ariaReply && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: PALETTE.surfaceAlt, borderRadius: RADIUS.md, borderLeft: `3px solid ${SIGNAL_COLORS.fresh}` }}>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: SIGNAL_COLORS.fresh, margin: '0 0 4px' }}>✦ ARIA</p>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: PALETTE.ink, margin: 0 }}>{ariaReply}</p>
          </div>
        )}
        <p style={{ fontSize: 10, color: PALETTE.inkSoft, margin: '8px 0 0', lineHeight: 1.4 }}>
          Aria answers only from this post and the shop&apos;s public profile. For anything else, message the shop.
        </p>
      </section>

      {/* Comments thread */}
      <section ref={threadRef} style={{ marginTop: 18, scrollMarginTop: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', margin: '0 0 12px', color: PALETTE.ink }}>
          {comments.length === 0 ? 'Comments' : comments.length === 1 ? 'View 1 comment' : `View all ${comments.length} comments`}
        </h2>
        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: PALETTE.inkSoft, fontWeight: 500 }}>No comments yet — be the first to say something nice below.</p>
        ) : (
          <div>
            {[...comments].reverse().map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${PALETTE.surfaceAlt}` }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: PALETTE.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.member_id
                    ? <Link href={'/community/u/' + c.member_id} style={{ color: PALETTE.ink, textDecoration: 'none' }}>{(c.nickname ?? 'Anonymous').toLowerCase()}</Link>
                    : (c.nickname ?? 'Anonymous').toLowerCase()}
                  <LevelChip level={c.level} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: PALETTE.inkSoft }}>{fmtRel(c.created_at)}</span>
                </p>
                <p style={{ fontSize: 13, margin: '2px 0 2px', color: PALETTE.ink, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{c.text}</p>
                <button onClick={() => { setReplyTo({ id: c.id, nickname: c.nickname }); setReplyInput('@' + (c.nickname ?? 'anonymous').toLowerCase() + ' '); setCError('') }}
                  style={{ background: 'transparent', border: 'none', padding: 0, fontSize: 11, fontWeight: 700, color: PALETTE.inkSoft, cursor: 'pointer', fontFamily: 'inherit' }}>
                  reply
                </button>

                {/* Nested replies */}
                {c.replies && c.replies.length > 0 && (
                  <div style={{ marginLeft: 16, marginTop: 8, borderLeft: `1.5px solid ${PALETTE.surfaceAlt}`, paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {c.replies.map(r => (
                      <div key={r.id}>
                        <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: PALETTE.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {r.member_id
                            ? <Link href={'/community/u/' + r.member_id} style={{ color: PALETTE.ink, textDecoration: 'none' }}>{(r.nickname ?? 'Anonymous').toLowerCase()}</Link>
                            : (r.nickname ?? 'Anonymous').toLowerCase()}
                          <LevelChip level={r.level} />
                          <span style={{ fontSize: 9, fontWeight: 500, color: PALETTE.inkSoft }}>{fmtRel(r.created_at)}</span>
                        </p>
                        <p style={{ fontSize: 12, margin: '1px 0 0', color: PALETTE.ink, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline reply composer */}
                {replyTo?.id === c.id && (
                  <div style={{ marginLeft: 16, marginTop: 8, display: 'flex', gap: 8 }}>
                    <input value={replyInput} onChange={e => setReplyInput(e.target.value)} autoFocus maxLength={600}
                      onKeyDown={e => { if (e.key === 'Enter' && !cPosting) { submitComment(replyInput, c.id).then(ok => { if (ok) { setReplyTo(null); setReplyInput('') } }) } }}
                      placeholder="reply…"
                      style={{ flex: 1, padding: '8px 12px', borderRadius: RADIUS.pill, background: PALETTE.surfaceAlt, border: BORDER, color: PALETTE.ink, fontSize: 12, outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
                    <button onClick={() => submitComment(replyInput, c.id).then(ok => { if (ok) { setReplyTo(null); setReplyInput('') } })}
                      disabled={cPosting || !replyInput.trim()}
                      style={{ padding: '0 14px', borderRadius: RADIUS.pill, border: BORDER, background: PALETTE.accent, color: PALETTE.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 38, opacity: cPosting || !replyInput.trim() ? 0.5 : 1 }}>
                      post
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Top-level comment composer */}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input value={cInput} onChange={e => { setCInput(e.target.value); setCError('') }} maxLength={600}
            onKeyDown={e => { if (e.key === 'Enter' && !cPosting) { submitComment(cInput).then(ok => { if (ok) setCInput('') }) } }}
            placeholder="add a comment…"
            style={{ flex: 1, padding: '10px 14px', borderRadius: RADIUS.pill, background: PALETTE.surfaceAlt, border: BORDER, color: PALETTE.ink, fontSize: 13, outline: 'none', fontFamily: 'inherit', minWidth: 0 }} />
          <button onClick={() => submitComment(cInput).then(ok => { if (ok) setCInput('') })} disabled={cPosting || !cInput.trim()}
            style={{ padding: '0 16px', borderRadius: RADIUS.pill, border: BORDER, background: PALETTE.accent, color: PALETTE.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44, opacity: cPosting || !cInput.trim() ? 0.5 : 1 }}>
            post
          </button>
        </div>
        {cError && <p style={{ fontSize: 11, color: PALETTE.live, margin: '8px 0 0' }}>{cError}</p>}
        <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '8px 0 0', lineHeight: 1.5 }}>
          Phone, email + card details are blocked. Sort the rest in person.
        </p>
      </section>
    </main>
  )
}
