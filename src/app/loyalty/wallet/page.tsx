'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

// Locked Pipel design — light ink-on-cream, hard 1.5px borders, Cormorant + Outfit.
const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e'
const BORDER = `1.5px solid ${INK}`
const FONT = "var(--font-body, 'Outfit', system-ui, sans-serif)"
const DISPLAY = "var(--font-display, 'Cormorant', Georgia, serif)"

interface Tier { current_label: string; current_color: string; next_label: string | null; progress_pct: number; to_next_points: number }
interface Membership {
  business_id: string; business_name: string; logo_url: string | null
  program_type: 'points' | 'stamps'
  points_balance: number; dollar_value: number
  stamps_count: number; stamps_target: number; stamp_reward_text: string
  tier: Tier | null
}

export default function WalletPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState<string | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [qr, setQr] = useState<string | null>(null)
  const [secsLeft, setSecsLeft] = useState(0)
  const [zoom, setZoom] = useState(false)
  const expiryRef = useRef(0)
  const regenRef = useRef(false)

  useEffect(() => {
    fetch('/api/loyalty/memberships').then(async r => {
      if (r.status === 401) { router.replace('/loyalty'); return null }
      return r.json()
    }).then(d => {
      if (!d) return
      setName(d.name ?? null); setMemberships((d.memberships ?? []) as Membership[]); setLoading(false)
      genCode()
    }).catch(() => setLoading(false))
  }, [router])

  const genCode = async () => {
    if (regenRef.current) return
    regenRef.current = true
    try {
      const r = await fetch('/api/loyalty/redeem-code', { method: 'POST' })
      const d = await r.json()
      if (r.ok && d.token) {
        const QRCode = (await import('qrcode')).default
        setQr(await QRCode.toDataURL(d.token, { margin: 1, width: 260 }))
        expiryRef.current = new Date(d.expires_at).getTime()
      }
    } catch { /* tap to refresh */ }
    regenRef.current = false
  }

  useEffect(() => {
    const t = setInterval(() => {
      if (!expiryRef.current) return
      const left = Math.max(0, Math.round((expiryRef.current - Date.now()) / 1000))
      setSecsLeft(left)
      if (left === 0 && !regenRef.current) genCode()
    }, 1000)
    return () => clearInterval(t)
  }, [])

  const logout = async () => {
    await fetch('/api/loyalty/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
    router.replace('/loyalty')
  }

  const card: React.CSSProperties = { background: SURFACE, border: BORDER, borderRadius: 18, boxShadow: '4px 4px 0 #0a0a0a' }
  const link: React.CSSProperties = { background: 'none', border: 'none', color: INK, textDecoration: 'underline', cursor: 'pointer', fontSize: 13, fontFamily: FONT, padding: 0 }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: INK_SOFT }}>Loading your wallet…</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: CREAM, fontFamily: FONT, color: INK, padding: '28px 18px' }}>
      <div style={{ width: '100%', maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header: name + sign out */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, fontFamily: DISPLAY, fontStyle: 'italic' }}>Hi{name ? `, ${name.split(' ')[0]}` : ''}</h1>
          <div style={{ display: 'flex', gap: 14 }}>
            <a href="/loyalty?browse=1" style={{ ...link, textDecoration: 'underline' }}>Join</a>
            <button onClick={logout} style={link}>Sign out</button>
          </div>
        </div>

        {/* ONE barcode for every business */}
        <div style={{ ...card, padding: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 12px' }}>Your one code — scan at any Aria business</p>
          {qr ? (
            <>
              <img src={qr} alt="Your rewards code" width={200} height={200} onClick={() => setZoom(true)}
                style={{ border: BORDER, borderRadius: 14, background: SURFACE, cursor: 'zoom-in' }} />
              <p style={{ fontSize: 12, fontWeight: 700, margin: '10px 0 0' }}>{secsLeft > 0 ? `Refreshes in ${secsLeft}s` : 'Refreshing…'} · tap to enlarge</p>
            </>
          ) : (
            <button onClick={genCode} style={{ height: 44, padding: '0 18px', borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}>Show my code</button>
          )}
        </div>

        {/* Membership cards */}
        {memberships.length === 0 ? (
          <div style={{ ...card, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
            <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>No rewards yet</p>
            <p style={{ fontSize: 14, color: INK_SOFT, margin: '0 0 14px', lineHeight: 1.5 }}>Join a business to start earning — your code works everywhere.</p>
            <a href="/loyalty?browse=1" style={{ display: 'inline-block', height: 44, lineHeight: '44px', padding: '0 20px', borderRadius: 12, border: BORDER, background: ACCENT, color: INK, fontWeight: 700, textDecoration: 'none' }}>Find a business →</a>
          </div>
        ) : (
          memberships.map(m => {
            const isStamps = m.program_type === 'stamps'
            return (
              <a key={m.business_id} href={`/loyalty/${m.business_id}/signin`} style={{ textDecoration: 'none', color: INK }}>
                <div style={{ ...card, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, border: BORDER, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 800 }}>
                      {m.logo_url ? <img src={m.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (m.business_name?.[0] ?? '★')}
                    </div>
                    <p style={{ fontSize: 17, fontWeight: 800, margin: 0, flex: 1, minWidth: 0 }}>{m.business_name}</p>
                    {m.tier && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, border: BORDER, color: m.tier.current_color }}>{m.tier.current_label}</span>}
                  </div>

                  {isStamps ? (() => {
                    const ready = m.stamps_count >= m.stamps_target
                    const dot = m.stamps_target > 12 ? 18 : 26 // compact + wrap for large cards
                    return (
                      <div>
                        <div role="img" aria-label={`${m.stamps_count} of ${m.stamps_target} stamps collected`} style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {Array.from({ length: m.stamps_target }).map((_, i) => {
                            const filled = i < m.stamps_count
                            return <span key={i} aria-hidden style={{ width: dot, height: dot, borderRadius: '50%', border: BORDER, background: filled ? ACCENT : SURFACE, boxShadow: filled ? 'inset 0 0 0 3px #fafafa' : 'none', transition: 'background 160ms ease' }} />
                          })}
                        </div>
                        {ready ? (
                          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, border: BORDER, background: ACCENT, fontSize: 14, fontWeight: 800, textAlign: 'center' }}>Reward ready — {m.stamp_reward_text}</div>
                        ) : (
                          <p style={{ fontSize: 13, color: INK_SOFT, margin: '12px 0 0' }}><strong style={{ color: INK }}>{m.stamps_count}/{m.stamps_target}</strong> · {m.stamps_target - m.stamps_count} more for {m.stamp_reward_text}</p>
                        )}
                      </div>
                    )
                  })() : (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: 32, fontWeight: 800, fontFamily: DISPLAY, fontStyle: 'italic', lineHeight: 1 }}>{m.points_balance.toLocaleString()}</span>
                        <span style={{ fontSize: 13, color: INK_SOFT }}>points · ${m.dollar_value.toFixed(2)}</span>
                      </div>
                      {m.tier?.next_label ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ height: 9, borderRadius: 999, border: BORDER, background: SURFACE, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${m.tier.progress_pct}%`, background: ACCENT, transition: 'width 240ms ease' }} />
                          </div>
                          <p style={{ fontSize: 11, color: INK_SOFT, margin: '5px 0 0' }}>{m.tier.to_next_points.toLocaleString()} points to {m.tier.next_label}</p>
                        </div>
                      ) : m.tier ? (
                        <p style={{ fontSize: 11, color: INK_SOFT, margin: '8px 0 0' }}>Top tier — thank you!</p>
                      ) : null}
                    </div>
                  )}
                </div>
              </a>
            )
          })
        )}

        {memberships.length > 0 && (
          <a href="/loyalty?browse=1" style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: INK, textDecoration: 'none', padding: '12px', border: BORDER, borderRadius: 14, background: SURFACE }}>＋ Join another business</a>
        )}

        <div style={{ textAlign: 'center', marginTop: 4, fontSize: 12, color: INK_SOFT }}>Powered by Aria</div>
      </div>

      {/* Tap-to-enlarge barcode */}
      {zoom && qr && (
        <div onClick={() => setZoom(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 24, cursor: 'zoom-out' }}>
          <img src={qr} alt="Your rewards code" style={{ width: '100%', maxWidth: 360, background: '#fff', borderRadius: 18, padding: 16 }} />
        </div>
      )}
    </div>
  )
}
