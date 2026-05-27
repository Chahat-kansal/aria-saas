'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, BadgeCheck, EyeOff } from 'lucide-react'
import { C, RADIUS, FONT_DISPLAY } from './theme'

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
  counts?: { like: number; comment: number; save: number }
  mine?: { liked: boolean; saved: boolean }
}

interface Props {
  post: PostCardData
  onAfterAction?: (id: string, change: { liked?: boolean; saved?: boolean }) => void
  onHideBusiness?: (business_id: string) => void
  showHide?: boolean
}

function fmtRel(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3600_000) return Math.floor(diff / 60_000) + 'm'
  if (diff < 86_400_000) return Math.floor(diff / 3600_000) + 'h'
  if (diff < 7 * 86_400_000) return Math.floor(diff / 86_400_000) + 'd'
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export function PostCard({ post, onAfterAction, onHideBusiness, showHide = true }: Props) {
  const [liked, setLiked] = useState(!!post.mine?.liked)
  const [saved, setSaved] = useState(!!post.mine?.saved)
  const [likeCount, setLikeCount] = useState(post.counts?.like ?? 0)
  const [saveCount, setSaveCount] = useState(post.counts?.save ?? 0)
  const [showMenu, setShowMenu] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [commentInput, setCommentInput] = useState('')
  const [commentBusy, setCommentBusy] = useState(false)
  const [commentError, setCommentError] = useState('')
  const [commentSuccess, setCommentSuccess] = useState(false)
  const [popping, setPopping] = useState(false)

  async function toggle(type: 'like' | 'save') {
    const wasOn = type === 'like' ? liked : saved
    // Optimistic update
    if (type === 'like') {
      setLiked(!wasOn)
      setLikeCount(c => c + (wasOn ? -1 : 1))
      if (!wasOn) { setPopping(true); setTimeout(() => setPopping(false), 320) }
    } else {
      setSaved(!wasOn)
      setSaveCount(c => c + (wasOn ? -1 : 1))
    }
    try {
      const res = await fetch('/api/community/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id: post.id, type }),
      })
      if (!res.ok) throw new Error('Failed')
      onAfterAction?.(post.id, type === 'like' ? { liked: !wasOn } : { saved: !wasOn })
    } catch {
      // Revert
      if (type === 'like') { setLiked(wasOn); setLikeCount(c => c + (wasOn ? 1 : -1)) }
      else { setSaved(wasOn); setSaveCount(c => c + (wasOn ? 1 : -1)) }
    }
  }

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin + '/community/businesses/' + post.business_id : ''
    try {
      if (typeof navigator !== 'undefined' && (navigator as Navigator & { share?: (data: { title?: string; text?: string; url?: string }) => Promise<void> }).share) {
        await (navigator as Navigator & { share: (data: { title?: string; text?: string; url?: string }) => Promise<void> }).share({
          title: post.business?.name ?? 'Aria Community',
          text: post.title ?? post.body?.slice(0, 80) ?? '',
          url,
        })
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url)
      }
    } catch { /* user cancelled */ }
    // Always log the share attempt
    fetch('/api/community/engagement', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: post.id, type: 'share' }),
    }).catch(() => null)
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
  const firstMedia = post.media_urls?.[0]

  return (
    <article style={{
      background: C.surface,
      borderRadius: RADIUS.lg,
      border: `1px solid ${C.border}`,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
        <Link href={`/community/businesses/${post.business_id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
          <div style={{
            width: 40, height: 40, borderRadius: RADIUS.pill,
            background: post.business?.logo_url ? `url(${post.business.logo_url}) center/cover` : C.accentDeep,
            color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 15, flexShrink: 0, border: `1px solid ${C.border}`,
          }}>
            {!post.business?.logo_url && (post.business?.name?.[0] ?? '?')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.text, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {post.business?.name}
              {post.business?.community_verified && <BadgeCheck size={14} style={{ color: C.accent, flexShrink: 0 }} />}
            </p>
            <p style={{ fontSize: 11, color: C.textMuted, margin: '2px 0 0', display: 'flex', gap: 5, alignItems: 'center' }}>
              {post.business?.suburb ?? post.business?.city ?? post.business?.industry}
              {post.published_at && <><span style={{ opacity: 0.5 }}>·</span><span>{fmtRel(post.published_at)}</span></>}
              {post.ai_generated && <><span style={{ opacity: 0.5 }}>·</span><span style={{ color: '#A78BFA' }}>✦ Aria</span></>}
            </p>
          </div>
        </Link>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu(v => !v)}
            style={{ background: 'transparent', border: 'none', color: C.textMuted, padding: 8, cursor: 'pointer', display: 'flex', minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
            <MoreHorizontal size={18} />
          </button>
          {showMenu && (
            <div onClick={() => setShowMenu(false)}
              style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: C.surface, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 6, zIndex: 10, minWidth: 180, boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
              {showHide && onHideBusiness && (
                <button onClick={() => onHideBusiness(post.business_id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px', background: 'transparent', border: 'none', color: C.text, fontSize: 13, cursor: 'pointer', borderRadius: RADIUS.sm, textAlign: 'left' }}>
                  <EyeOff size={14} /> Hide posts from this business
                </button>
              )}
              <Link href={`/community/businesses/${post.business_id}`}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', color: C.text, fontSize: 13, textDecoration: 'none', borderRadius: RADIUS.sm }}>
                Visit profile
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Media */}
      {firstMedia && (
        <div style={{ width: '100%', background: '#000', position: 'relative' }}>
          {isVideo ? (
            <video src={firstMedia} controls playsInline preload="metadata" style={{ width: '100%', maxHeight: 560, display: 'block', objectFit: 'contain' }} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={firstMedia} alt="" style={{ width: '100%', maxHeight: 560, display: 'block', objectFit: 'cover' }} />
          )}
        </div>
      )}

      {/* Body */}
      {(post.title || post.body) && (
        <div style={{ padding: '12px 14px 4px' }}>
          {post.title && <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px', fontFamily: FONT_DISPLAY, fontStyle: 'italic', letterSpacing: '-0.01em' }}>{post.title}</h3>}
          {post.body && <p style={{ fontSize: 14, color: C.textDim, margin: 0, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.body}</p>}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 8px 12px' }}>
        <ActionButton
          icon={<Heart size={20} fill={liked ? C.accent : 'transparent'} strokeWidth={liked ? 0 : 1.8} className={popping ? 'community-pop' : undefined} />}
          label={likeCount > 0 ? String(likeCount) : 'Like'}
          active={liked}
          onClick={() => toggle('like')}
        />
        <ActionButton
          icon={<MessageCircle size={20} strokeWidth={1.8} />}
          label={post.counts?.comment ? String(post.counts.comment) : 'Comment'}
          onClick={() => setShowComments(v => !v)}
        />
        <ActionButton
          icon={<Bookmark size={20} fill={saved ? C.accent : 'transparent'} strokeWidth={saved ? 0 : 1.8} />}
          label={saveCount > 0 ? String(saveCount) : 'Save'}
          active={saved}
          onClick={() => toggle('save')}
        />
        <ActionButton
          icon={<Share2 size={20} strokeWidth={1.8} />}
          label="Share"
          onClick={share}
        />
      </div>

      {/* Comment composer */}
      {showComments && (
        <div style={{ padding: '0 14px 14px', borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <input
              value={commentInput}
              onChange={e => setCommentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !commentBusy) postComment() }}
              placeholder="Say something nice…"
              maxLength={600}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: RADIUS.pill,
                background: C.surfaceHi, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 14, outline: 'none', fontFamily: 'inherit',
                minHeight: 40,
              }}
            />
            <button onClick={postComment} disabled={commentBusy || !commentInput.trim()}
              style={{
                padding: '0 16px', borderRadius: RADIUS.pill, border: 'none',
                background: C.accent, color: '#0d0d14', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', minHeight: 40, fontFamily: 'inherit',
                opacity: commentBusy || !commentInput.trim() ? 0.5 : 1,
              }}>
              Post
            </button>
          </div>
          {commentError && <p style={{ fontSize: 12, color: C.danger, margin: '8px 0 0' }}>{commentError}</p>}
          {commentSuccess && <p style={{ fontSize: 12, color: C.accent, margin: '8px 0 0' }}>✓ Comment posted</p>}
          <p style={{ fontSize: 10, color: C.textMuted, margin: '8px 0 0', lineHeight: 1.5 }}>
            For your safety, comments with phone numbers, emails, or card details are blocked. Sort it in person at the shop.
          </p>
        </div>
      )}
    </article>
  )
}

function ActionButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '10px 14px', borderRadius: 999,
        background: 'transparent', border: 'none',
        color: active ? C.accent : C.textDim, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
      }}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
