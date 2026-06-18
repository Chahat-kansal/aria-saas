'use client'
import { useState, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, MessageCircle, MoreHorizontal, BadgeCheck, EyeOff, Play } from 'lucide-react'
import { PALETTE, BORDER, RADIUS, SIGNAL_COLORS } from './theme'

export interface PostCardData {
  id: string
  business_id: string
  business: { name: string | null; logo_url: string | null; community_verified: boolean | null; industry?: string | null; suburb?: string | null; city?: string | null } | null
  post_type: string
  title: string | null
  body: string | null
  media_urls: string[]
  media_type: string | null
  ai_generated?: boolean
  published_at: string | null
  saved_at?: string
  is_expired?: boolean
  stream_id?: string | null
  counts?: { like: number; comment: number; save: number }
  mine?: { liked: boolean; saved: boolean }
  // CX-0 POS-signal chips (data-driven; only shown when the signal is real)
  busy_now?: number
  fresh_batch?: boolean
  fresh_product?: boolean
  promo_live?: boolean
  // CX-0 cold-start AI insight card variant (rendered by <AiInsightCard/>)
  ai_card?: boolean
  card_text?: string
}

// CX-0 — POS-signal chips computed from real feed data. BUSY shows at >= 3 sales/2h.
function signalChips(post: PostCardData): Array<{ label: string; color: string }> {
  const chips: Array<{ label: string; color: string }> = []
  if ((post.busy_now ?? 0) >= 3) chips.push({ label: '🔴 BUSY NOW', color: SIGNAL_COLORS.busy })
  if (post.fresh_product || post.fresh_batch) chips.push({ label: '🌿 FRESH', color: SIGNAL_COLORS.fresh })
  if (post.promo_live) chips.push({ label: '📣 PROMO LIVE', color: SIGNAL_COLORS.promo })
  return chips
}

// CX-0 cold-start — a lightweight "Aria" insight card; copy is grounded in real POS figures upstream.
export function AiInsightCard({ post }: { post: PostCardData }) {
  return (
    <article style={{ background: PALETTE.surface, borderRadius: RADIUS.xl, border: BORDER, marginBottom: 14, padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 30, height: 30, borderRadius: 10, background: PALETTE.ink, color: PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>✦</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '2px 0 4px' }}>✦ Aria · local right now</p>
        <p style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, color: PALETTE.ink, margin: 0 }}>{post.card_text ?? ''}</p>
        {post.business_id && (
          <Link href={`/community/businesses/${post.business_id}`} style={{ fontSize: 11, fontWeight: 700, color: PALETTE.ink, textDecoration: 'underline', display: 'inline-block', marginTop: 8 }}>
            visit {(post.business?.name ?? 'shop').toLowerCase()} →
          </Link>
        )}
      </div>
    </article>
  )
}

interface Props {
  post: PostCardData
  onAfterAction?: (id: string, change: { liked?: boolean; saved?: boolean }) => void
  onHideBusiness?: (business_id: string) => void
  showHide?: boolean
  // CX-1-P3: when set, tapping the post body opens the post-detail page (used in the feed).
  detailHref?: string
}

function fmtRel(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' mins ago'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + 'h ago'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd ago'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const BADGE_LABEL: Record<string, string> = {
  offer: 'TODAY ONLY',
  new_stock: 'NEW IN',
  event: 'EVENT',
  story: 'STORY',
  reel: 'REEL',
  video: 'VIDEO',
}

// Signature move: wrap "$N" price tokens in a lime highlight span.
function renderBodyWithPrices(text: string) {
  const parts = text.split(/(\$\d[\d,]*(?:\.\d{2})?)/g)
  return parts.map((part, i) =>
    /^\$\d/.test(part)
      ? <span key={i} style={{ background: PALETTE.accent, color: PALETTE.ink, padding: '0 5px', borderRadius: 5 }}>{part}</span>
      : <Fragment key={i}>{part}</Fragment>
  )
}

export function PostCard({ post, onAfterAction, onHideBusiness, showHide = true, detailHref }: Props) {
  const router = useRouter()
  const [liked, setLiked] = useState(!!post.mine?.liked)
  const [saved, setSaved] = useState(!!post.mine?.saved)
  const [likeCount, setLikeCount] = useState(post.counts?.like ?? 0)
  const [commentCount] = useState(post.counts?.comment ?? 0)
  const [showMenu, setShowMenu] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [commentSuccess, setCommentSuccess] = useState(false)
  const [popping, setPopping] = useState(false)

  async function toggle(type: 'like' | 'save') {
    const wasOn = type === 'like' ? liked : saved
    if (type === 'like') {
      setLiked(!wasOn)
      setLikeCount(c => c + (wasOn ? -1 : 1))
      if (!wasOn) { setPopping(true); setTimeout(() => setPopping(false), 320) }
    } else {
      setSaved(!wasOn)
    }
    try {
      const res = await fetch('/api/community/engagement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, type }),
      })
      if (!res.ok) throw new Error('Failed')
      onAfterAction?.(post.id, type === 'like' ? { liked: !wasOn } : { saved: !wasOn })
    } catch {
      if (type === 'like') { setLiked(wasOn); setLikeCount(c => c + (wasOn ? 1 : -1)) }
      else setSaved(wasOn)
    }
  }

  async function postComment() {
    if (!commentInput.trim()) return
    setCommentBusy(true)
    setCommentError('')
    try {
      const res = await fetch('/api/community/engagement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, type: 'comment', comment_text: commentInput }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not post comment')
      setCommentInput('')
      setCommentSuccess(true)
      setTimeout(() => setCommentSuccess(false), 2400)
    } catch (e: unknown) {
      setCommentError((e as Error).message)
    }
    setCommentBusy(false)
  }

  const isVideo = post.media_type === 'video' || post.media_type === 'reel'
  const isReel = post.media_type === 'reel'
  const isLive = post.post_type === 'live'
  const firstMedia = post.media_urls?.[0]
  const meta = [post.business?.suburb ?? post.business?.city ?? post.business?.industry].filter(Boolean).join('')
  const badge = BADGE_LABEL[post.post_type]
  const bodyText = post.title || post.body || ''

  return (
    <article style={{
      background: PALETTE.surface,
      borderRadius: RADIUS.xl,
      border: BORDER,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <Link href={`/community/businesses/${post.business_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            width: 30, height: 30, borderRadius: 10,
            background: post.business?.logo_url ? `url(${post.business.logo_url}) center/cover` : PALETTE.ink,
            color: PALETTE.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, flexShrink: 0,
          }}>
            {!post.business?.logo_url && (post.business?.name?.[0]?.toLowerCase() ?? '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: PALETTE.ink, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(post.business?.name ?? '').toLowerCase()}
              {post.business?.community_verified && <BadgeCheck size={13} style={{ color: PALETTE.ink, flexShrink: 0 }} />}
            </p>
            <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fmtRel(post.published_at)}{meta && ' · ' + meta}{post.ai_generated && ' · ✦ ARIA'}
            </p>
          </div>
        </Link>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu(v => !v)} aria-label="Post menu"
            style={{ background: 'transparent', border: 'none', color: PALETTE.ink, padding: 8, cursor: 'pointer', display: 'flex', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div onClick={() => setShowMenu(false)}
              style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: PALETTE.surface, border: BORDER, borderRadius: RADIUS.md, padding: 6, zIndex: 10, minWidth: 190 }}>
              {showHide && onHideBusiness && (
                <button onClick={() => onHideBusiness(post.business_id)}
                  style={menuItem}>
                  <EyeOff size={14} /> Hide posts from this shop
                </button>
              )}
              <Link href={`/community/businesses/${post.business_id}`} style={{ ...menuItem, textDecoration: 'none' }}>
                Visit profile
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* CX-0 — POS-signal chips (only when the signal is real) */}
      {signalChips(post).length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 14px 10px' }}>
          {signalChips(post).map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', background: c.color, color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.03em', padding: '3px 9px', borderRadius: RADIUS.pill }}>{c.label}</span>
          ))}
        </div>
      )}

      {/* Hero — full-bleed */}
      {(firstMedia || isLive) && (
        <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: PALETTE.ink, overflow: 'hidden' }}>
          {isLive ? (
            <button onClick={() => post.stream_id && router.push('/community/live/' + post.stream_id)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#111', cursor: post.stream_id ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {firstMedia && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firstMedia} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
              )}
              <span style={{ position: 'relative', zIndex: 1, background: PALETTE.live, color: PALETTE.surface, padding: '8px 20px', borderRadius: RADIUS.pill, fontSize: 15, fontWeight: 800, letterSpacing: '0.06em', animation: 'community-live-pulse 1.4s ease-in-out infinite' }}>
                LIVE
              </span>
            </button>
          ) : isReel ? (
            <Link href="/community/reels" prefetch={false} style={{ display: 'block', position: 'absolute', inset: 0, textDecoration: 'none' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.media_urls[1] ?? firstMedia} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.22)' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Play size={22} color={PALETTE.ink} fill={PALETTE.ink} style={{ marginLeft: 3 }} />
                </div>
              </div>
            </Link>
          ) : isVideo ? (
            <video src={firstMedia} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstMedia} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {badge && (
            <span style={{
              position: 'absolute', top: 10, right: 10,
              background: PALETTE.ink, color: PALETTE.accent,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
              padding: '4px 10px', borderRadius: RADIUS.pill,
            }}>{badge}</span>
          )}
        </div>
      )}

      {/* Body */}
      {bodyText && (
        <div style={{ padding: '14px 14px 4px', cursor: detailHref ? 'pointer' : 'default' }}
          onClick={detailHref ? () => router.push(detailHref) : undefined}>
          {post.title && post.body
            ? (<>
                <p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.3, color: PALETTE.ink }}>{renderBodyWithPrices(post.title)}</p>
                <p style={{ fontSize: 13, fontWeight: 500, margin: '6px 0 0', lineHeight: 1.5, color: PALETTE.ink, opacity: 0.78, whiteSpace: 'pre-wrap' }}>{renderBodyWithPrices(post.body)}</p>
              </>)
            : (<p style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, lineHeight: 1.35, color: PALETTE.ink, whiteSpace: 'pre-wrap' }}>{renderBodyWithPrices(bodyText)}</p>)}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '12px 14px 14px' }}>
        <button onClick={() => toggle('like')} aria-label="Like"
          style={iconAction}>
          <Heart size={20} fill={liked ? PALETTE.live : 'transparent'} color={liked ? PALETTE.live : PALETTE.ink} strokeWidth={liked ? 0 : 2} className={popping ? 'community-pop' : undefined} />
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.ink, letterSpacing: '-0.02em' }}>{likeCount}</span>
        </button>
        <button onClick={() => setShowComments(v => !v)} aria-label="Comment"
          style={iconAction}>
          <MessageCircle size={20} color={PALETTE.ink} strokeWidth={2} />
          <span style={{ fontSize: 13, fontWeight: 700, color: PALETTE.ink, letterSpacing: '-0.02em' }}>{commentCount}</span>
        </button>
        <button onClick={() => toggle('save')}
          style={{
            marginLeft: 'auto',
            background: saved ? PALETTE.accent : PALETTE.surface,
            color: PALETTE.ink, border: BORDER, borderRadius: RADIUS.pill,
            fontSize: 12, fontWeight: 700, padding: '7px 16px', cursor: 'pointer', minHeight: 44,
          }}>
          {saved ? 'saved' : 'save'}
        </button>
      </div>

      {/* Comment composer */}
      {showComments && (
        <div style={{ padding: '0 14px 14px', borderTop: BORDER }}>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !commentBusy) postComment() }}
              placeholder="say something nice…"
              maxLength={600}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: RADIUS.pill,
                background: PALETTE.surfaceAlt, border: BORDER,
                color: PALETTE.ink, fontSize: 13, outline: 'none', fontFamily: 'inherit', fontWeight: 500, minHeight: 44,
              }}
            />
            <button onClick={postComment} disabled={commentBusy || !commentInput.trim()}
              style={{ padding: '0 16px', borderRadius: RADIUS.pill, border: BORDER, background: PALETTE.accent, color: PALETTE.ink, fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44, opacity: commentBusy || !commentInput.trim() ? 0.5 : 1 }}>
              post
            </button>
          </div>
          {commentError && <p style={{ fontSize: 11, color: PALETTE.live, margin: '8px 0 0' }}>{commentError}</p>}
          {commentSuccess && <p style={{ fontSize: 11, color: PALETTE.ink, margin: '8px 0 0', fontWeight: 600 }}>✓ comment posted</p>}
          <p style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: PALETTE.inkSoft, margin: '8px 0 0', lineHeight: 1.5 }}>
            Phone, email + card details are blocked. Sort the rest in person.
          </p>
        </div>
      )}
    </article>
  )
}

const iconAction: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7,
  background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, minHeight: 44,
}

const menuItem: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px',
  background: 'transparent', border: 'none', color: PALETTE.ink, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', borderRadius: RADIUS.sm, textAlign: 'left', fontFamily: 'inherit',
}
