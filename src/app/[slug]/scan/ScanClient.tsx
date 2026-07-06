'use client'

import { useState, useEffect, useRef } from 'react'
import { CxTabBar } from '../CxTabBar'

const BG = '#0a0a0a'
const INK = '#fafafa'
const ACCENT = '#d9f54e'
const ACCENT_TEXT = '#2f3a06'
const INK_MUTED = 'rgba(255,255,255,0.5)'
const FB = "var(--font-body,'Outfit',system-ui,sans-serif)"
const FD = "var(--font-display,'Cormorant',Georgia,serif)"

type MeData = {
  found: boolean
  customer_id?: string
  name?: string
  loyalty_identity_id?: string
  points_balance?: number
  loyalty_tier?: string | null
}

function drawBarcode(canvas: HTMLCanvasElement, code: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)

  const hex = (code.replace(/-/g, '') + code.replace(/-/g, '')).slice(0, 80)
  const totalBars = hex.length * 4
  const barW = W / totalBars

  ctx.fillStyle = '#0a0a0a'
  hex.split('').forEach((c, i) => {
    const val = parseInt(c, 16)
    const x = i * 4 * barW
    const h1 = H * (0.6 + (val % 3) * 0.13)
    const h2 = H * (0.4 + (val % 5) * 0.1)
    const h3 = H * (0.7 + ((val + 2) % 4) * 0.08)
    ctx.fillRect(x, H - h1, barW * 0.7, h1)
    if (val % 3 !== 1) ctx.fillRect(x + barW * 1.2, H - h2, barW * 0.5, h2)
    if (val > 7)       ctx.fillRect(x + barW * 2.2, H - h3, barW * 0.8, h3)
    if (val > 12)      ctx.fillRect(x + barW * 3.2, H - H * 0.5, barW * 0.4, H * 0.5)
  })
}

export function ScanClient({ slug, bizId, bizName, logoUrl }: {
  slug: string
  bizId: string
  bizName: string
  logoUrl: string | null
}) {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    let phone = ''
    try {
      const saved = localStorage.getItem('aria_cx_' + slug)
      if (saved) phone = (JSON.parse(saved) as { phone?: string }).phone ?? ''
    } catch { /* ok */ }

    if (!phone) {
      window.location.replace('/' + slug + '/onboarding')
      return
    }

    fetch('/api/public/cx/' + slug + '/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
      .then(r => r.json())
      .then((data: MeData) => { setMe(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    if (!me?.loyalty_identity_id || !canvasRef.current) return
    drawBarcode(canvasRef.current, me.loyalty_identity_id)
  }, [me?.loyalty_identity_id])

  const identityId = me?.loyalty_identity_id ?? ''
  const shortId = identityId ? identityId.slice(0, 8).toUpperCase() : ''

  return (
    <div style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: FB, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '52px 24px 24px', textAlign: 'center' }}>
        {logoUrl && (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px',
            background: 'url(' + logoUrl + ') center/cover no-repeat rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.12)',
          }} />
        )}
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 22, margin: 0, color: INK }}>
          {bizName}
        </p>
        <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0 0' }}>
          {me?.name ? ('Welcome back, ' + me.name) : 'Your loyalty card'}
        </p>
      </div>

      {/* Barcode card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px 100px' }}>
        {loading ? (
          <div style={{ color: INK_MUTED, fontFamily: FB, fontSize: 14 }}>Loading…</div>
        ) : !me?.found ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: INK_MUTED, fontFamily: FB, fontSize: 14, marginBottom: 20 }}>
              No loyalty account found.
            </p>
            <a
              href={'/' + slug + '/onboarding'}
              style={{ background: ACCENT, color: ACCENT_TEXT, padding: '12px 24px', borderRadius: 12, fontFamily: FB, fontWeight: 700, fontSize: 15, textDecoration: 'none' }}
            >
              Sign in
            </a>
          </div>
        ) : (
          <div style={{
            width: '100%', maxWidth: 340,
            background: '#fff', borderRadius: 20,
            padding: '24px 20px 20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          }}>
            {/* Barcode */}
            <canvas
              ref={canvasRef}
              width={600}
              height={160}
              style={{ width: '100%', height: 100, display: 'block', borderRadius: 8 }}
            />

            {/* ID below barcode */}
            <div style={{
              marginTop: 12, background: '#f5f5f5', borderRadius: 8,
              padding: '10px 16px', textAlign: 'center',
            }}>
              <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, letterSpacing: '0.15em', color: '#0a0a0a' }}>
                {shortId}
              </span>
            </div>

            {/* Points */}
            {me?.points_balance !== undefined && (
              <div style={{ marginTop: 16, textAlign: 'center' }}>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#6b7280', margin: '0 0 2px' }}>
                  Points balance
                </p>
                <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 28, color: '#0a0a0a', margin: 0 }}>
                  {me.points_balance.toLocaleString()} pts
                </p>
                {me.loyalty_tier && (
                  <span style={{
                    display: 'inline-block', marginTop: 6,
                    background: ACCENT, color: ACCENT_TEXT,
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999,
                    fontFamily: FB, textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {me.loyalty_tier}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CxTabBar slug={slug} active="scan" dark />
    </div>
  )
}