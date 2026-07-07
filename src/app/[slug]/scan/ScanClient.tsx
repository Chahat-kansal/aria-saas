'use client'

import { useState, useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
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

function BrightnessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
      style={{ display: 'block', flexShrink: 0 }}>
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1" x2="8" y2="2.5" />
      <line x1="8" y1="13.5" x2="8" y2="15" />
      <line x1="1" y1="8" x2="2.5" y2="8" />
      <line x1="13.5" y1="8" x2="15" y2="8" />
      <line x1="3.05" y1="3.05" x2="4.11" y2="4.11" />
      <line x1="11.89" y1="11.89" x2="12.95" y2="12.95" />
      <line x1="12.95" y1="3.05" x2="11.89" y2="4.11" />
      <line x1="4.11" y1="11.89" x2="3.05" y2="12.95" />
    </svg>
  )
}

export function ScanClient({ slug, bizName, logoUrl }: {
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
    const code = me?.loyalty_identity_id
    if (!code || !canvasRef.current) return
    try {
      JsBarcode(canvasRef.current, code, {
        format: 'CODE128',
        width: 2.2,
        height: 110,
        displayValue: false,
        background: '#ffffff',
        lineColor: '#0a0a0a',
        margin: 0,
      })
    } catch {
      // fallback: white canvas if ID not CODE128-encodable
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height) }
    }
  }, [me?.loyalty_identity_id])

  const identityId = me?.loyalty_identity_id ?? ''
  const displayCode = identityId ? identityId.replace(/-/g, '').toUpperCase().slice(0, 16) : ''

  return (
    <div style={{ minHeight: '100dvh', background: BG, color: INK, fontFamily: FB, display: 'flex', flexDirection: 'column', maxWidth: '28rem', margin: '0 auto' }}>
      <style>{'*, *::before, *::after { box-sizing: border-box }'}</style>

      {/* Header */}
      <div style={{ padding: '52px 24px 20px', textAlign: 'center' }}>
        {logoUrl && (
          <div style={{
            width: 52, height: 52, borderRadius: '50%', margin: '0 auto 12px',
            background: 'url(' + logoUrl + ') center/cover no-repeat rgba(255,255,255,0.08)',
            border: '2px solid rgba(255,255,255,0.12)',
          }} />
        )}
        <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, margin: 0, color: INK }}>
          {bizName}
        </p>
        <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, margin: '4px 0 0' }}>
          {me?.name ? ('Welcome back, ' + me.name) : 'Your loyalty card'}
        </p>
      </div>

      {/* Barcode card */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px calc(100px + env(safe-area-inset-bottom))' }}>
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
          <>
            {/* Brightness hint */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: INK_MUTED, fontFamily: FB, fontSize: 12,
              marginBottom: 16,
            }}>
              <BrightnessIcon />
              <span>Set brightness to maximum before scanning</span>
            </div>

            {/* Card */}
            <div style={{
              width: '100%', maxWidth: 340,
              background: '#fff', borderRadius: 24,
              padding: '24px 20px 20px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            }}>
              {/* CODE128 barcode */}
              <div style={{ borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                <canvas
                  ref={canvasRef}
                  style={{ width: '100%', display: 'block' }}
                />
              </div>

              {/* Machine-readable code */}
              <div style={{
                marginTop: 14, background: '#f5f5f5', borderRadius: 10,
                padding: '10px 16px', textAlign: 'center',
              }}>
                <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: '#0a0a0a' }}>
                  {displayCode}
                </span>
              </div>

              {/* Points + tier */}
              {me?.points_balance !== undefined && (
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <p style={{ fontFamily: FB, fontSize: 12, color: '#6b7280', margin: '0 0 2px' }}>
                    Points balance
                  </p>
                  <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 30, color: '#0a0a0a', margin: 0, fontWeight: 700, lineHeight: 1.1 }}>
                    {(me.points_balance ?? 0).toLocaleString()} pts
                  </p>
                  {me.loyalty_tier && (
                    <span style={{
                      display: 'inline-block', marginTop: 8,
                      background: ACCENT, color: ACCENT_TEXT,
                      fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 999,
                      fontFamily: FB, textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>
                      {me.loyalty_tier}
                    </span>
                  )}
                </div>
              )}
            </div>

            <p style={{ fontFamily: FB, fontSize: 12, color: INK_MUTED, marginTop: 16, textAlign: 'center' }}>
              Show this to staff at the counter
            </p>
          </>
        )}
      </div>

      <CxTabBar slug={slug} active="scan" dark />
    </div>
  )
}