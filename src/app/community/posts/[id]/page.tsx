'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PostCard, type PostCardData } from '../../PostCard'
import { PALETTE, BORDER, RADIUS, MAX_W, SIGNAL_COLORS } from '../../theme'

interface Comment { id: string; text: string | null; nickname: string; created_at: string }

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

  const load = useCallback(async () => {
    if (!id) return
    const d = await fetch('/api/community/engagement?post_id=' + id).then(r => r.json()).catch(() => null)
    if (!d || !d.post) { setNotFound(true); setLoading(false); return }
    setPost(d.post as PostCardData)
    setComments((d.comments ?? []) as Comment[])
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

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

      <PostCard post={post} showHide={false} />

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
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 10px' }}>Comments ({comments.length})</h2>
        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: PALETTE.inkSoft, fontWeight: 500 }}>No comments yet — use the comment button on the post above to be the first.</p>
        ) : (
          <div>
            {comments.map(c => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: `1px solid ${PALETTE.surfaceAlt}` }}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: PALETTE.ink }}>{(c.nickname ?? 'Anonymous').toLowerCase()}</p>
                <p style={{ fontSize: 13, margin: '2px 0 0', color: PALETTE.ink, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{c.text}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
