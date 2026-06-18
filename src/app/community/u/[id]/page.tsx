'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Heart, Store } from 'lucide-react'
import { C, BORDER, RADIUS, MAX_W, FONT_DISPLAY } from '../../theme'

interface MemberProfile { id: string; nickname: string | null; joined_at: string; follow_count: number; like_count: number }

function fmtJoined(iso: string) {
  try { return new Date(iso).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }) } catch { return '' }
}

export default function MemberProfilePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [m, setM] = useState<MemberProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    try {
      const res = await fetch('/api/community/members/' + id)
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      setM(await res.json() as MemberProfile)
    } catch { setNotFound(true) }
    setLoading(false)
  }, [id])
  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ height: 160, background: C.surfaceAlt, borderRadius: RADIUS.lg }} />
      </main>
    )
  }
  if (notFound || !m) {
    return (
      <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: C.ink }}>Member not found</p>
        <button onClick={() => router.back()} style={{ marginTop: 16, background: 'transparent', border: BORDER, borderRadius: RADIUS.md, padding: '9px 18px', color: C.ink, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>← back</button>
      </main>
    )
  }

  const name = (m.nickname && m.nickname.trim()) ? m.nickname : 'Anonymous member'

  return (
    <main style={{ maxWidth: MAX_W, margin: '0 auto', padding: '12px 16px 32px' }}>
      <button onClick={() => router.back()} aria-label="Back"
        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, marginBottom: 4 }}>
        <ArrowLeft size={18} color={C.ink} />
      </button>

      <section style={{ background: C.surface, border: BORDER, borderRadius: RADIUS.xl, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 6 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: C.accent, border: BORDER, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: C.ink }}>
          {name[0]?.toUpperCase() ?? '?'}
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '8px 0 0', fontFamily: FONT_DISPLAY, letterSpacing: '-0.01em', color: C.ink }}>{name.toLowerCase()}</h1>
        <p style={{ fontSize: 12, color: C.inkSoft, margin: 0 }}>member since {fmtJoined(m.joined_at)}</p>

        <div style={{ display: 'flex', gap: 10, marginTop: 14, width: '100%', maxWidth: 320 }}>
          <div style={{ flex: 1, background: C.surfaceAlt, borderRadius: RADIUS.md, padding: '12px 8px' }}>
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Store size={14} /> {m.follow_count}</p>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.inkSoft, margin: '3px 0 0' }}>following</p>
          </div>
          <div style={{ flex: 1, background: C.surfaceAlt, borderRadius: RADIUS.md, padding: '12px 8px' }}>
            <p style={{ fontSize: 18, fontWeight: 800, margin: 0, color: C.ink, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Heart size={14} /> {m.like_count}</p>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.inkSoft, margin: '3px 0 0' }}>posts liked</p>
          </div>
        </div>
      </section>

      <p style={{ fontSize: 11, color: C.inkSoft, textAlign: 'center', margin: '14px 0 0', lineHeight: 1.5 }}>
        Aria Community members are anonymous. Only a nickname and public activity counts are shown.
      </p>
    </main>
  )
}
