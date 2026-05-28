'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Bookmark } from 'lucide-react'
import { C, RADIUS, MAX_W, FONT_DISPLAY } from '../theme'
import { PostCard, type PostCardData } from '../PostCard'

interface SavedPost extends PostCardData {
  saved_at?: string
  is_story?: boolean
  expires_at?: string | null
}

export default function SavedPage() {
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [member, setMember] = useState<{ id: string; nickname: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const d = await fetch('/api/community/saved').then(r => r.json())
      setPosts(d.posts ?? [])
      setMember(d.member ?? null)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function onAfter(id: string, change: { saved?: boolean }) {
    if (change.saved === false) {
      setPosts(prev => prev.filter(p => p.id !== id))
    }
  }

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '20px 16px 24px' }}>
      <header style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, margin: 0 }}>Saved</p>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: '4px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em' }}>
          Your offers wallet
        </h1>
        <p style={{ fontSize: 13, color: C.textMuted, margin: '4px 0 0' }}>
          Posts you bookmarked. Open the shop&apos;s profile to redeem in person.
        </p>
      </header>

      {!member && !loading ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <Bookmark size={26} style={{ color: C.accent, opacity: 0.6, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>Join to save offers</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '0 0 14px', lineHeight: 1.55 }}>
            Anonymous — no email or name needed. Just a nickname (optional).
          </p>
          <Link href="/community/me" style={{
            display: 'inline-block', padding: '10px 18px', borderRadius: RADIUS.pill,
            background: C.accent, color: C.ink, fontSize: 13, fontWeight: 700, textDecoration: 'none',
          }}>Join in 5 seconds</Link>
        </div>
      ) : loading ? (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', padding: 24 }}>Loading…</p>
      ) : posts.length === 0 ? (
        <div style={{ padding: '40px 20px', textAlign: 'center', background: C.surface, borderRadius: RADIUS.lg, border: `1.5px dashed ${C.border}` }}>
          <Bookmark size={26} style={{ color: C.textMuted, opacity: 0.5, marginBottom: 10 }} />
          <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Nothing saved yet</p>
          <p style={{ fontSize: 13, color: C.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
            Tap the bookmark icon on any post to save it here for later.
          </p>
        </div>
      ) : (
        <div>
          {posts.map(p => (
            <div key={p.id} style={{ position: 'relative' }}>
              {p.is_expired && (
                <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, padding: '4px 10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: RADIUS.pill, color: C.danger, fontSize: 11, fontWeight: 700 }}>
                  Expired
                </div>
              )}
              <div style={{ opacity: p.is_expired ? 0.55 : 1 }}>
                <PostCard post={p} onAfterAction={onAfter} showHide={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
