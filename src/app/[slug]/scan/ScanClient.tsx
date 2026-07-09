'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import QRCode from 'qrcode'
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
  short_code?: string | null
  points_balance?: number
  loyalty_tier?: string | null
}

type ScanMode = 'show' | 'camera'

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

export function ScanClient({ slug, bizId, bizName, logoUrl }: {
  slug: string
  bizId: string
  bizName: string
  logoUrl: string | null
}) {
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<ScanMode>('show')
  const [checkinStatus, setCheckinStatus] = useState<'idle' | 'scanning' | 'success' | 'error'>('idle')
  const [checkinMsg, setCheckinMsg] = useState('')
  const [debugMsg, setDebugMsg] = useState('')
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanningRef = useRef(false)

  useEffect(() => {
    fetch('/api/public/cx/' + slug + '/me', { method: 'POST' })
      .then(r => r.json())
      .then((data: MeData) => { setMe(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  // QR code: prefer short_code (10-digit), fallback to identity UUID
  const qrValue = me?.short_code ?? me?.loyalty_identity_id ?? null

  useEffect(() => {
    if (!qrValue || !qrCanvasRef.current) return
    QRCode.toCanvas(qrCanvasRef.current, qrValue, {
      errorCorrectionLevel: 'M',
      margin: 3,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err) => {
      if (err) console.error('[ScanClient] QR error:', err)
    })
  }, [qrValue])

  const displayCode = me?.short_code
    ? me.short_code.slice(0, 4) + ' ' + me.short_code.slice(4)
    : (me?.loyalty_identity_id ?? '').replace(/-/g, '').toUpperCase().slice(0, 16)

  // ── Camera: stop stream ────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    scanningRef.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // ── Process decoded counter QR text ───────────────────────────────────────
  const processCounterQR = useCallback(async (text: string) => {
    let outletId: string | null = null
    let valid = false

    // Format 1: aria:checkin:v1:{business_id}:{outlet_id}
    if (text.startsWith('aria:checkin:v1:')) {
      const parts = text.split(':')
      if (parts.length >= 4) {
        const bPart = parts[3] ?? ''
        if (bPart === bizId || bPart === '') {
          outletId = parts[4] ?? null
          valid = true
        }
      }
    } else {
      // Format 2: URL with ?mode=checkin&o={outlet_id}
      try {
        const u = new URL(text.startsWith('http') ? text : ('https://x' + text))
        if (u.searchParams.get('mode') === 'checkin') {
          outletId = u.searchParams.get('o')
          valid = true
        }
      } catch { /* not a URL */ }
    }

    if (!valid) {
      setCheckinStatus('error')
      setCheckinMsg('Not a valid check-in QR. Scan the card on the counter.')
      return
    }

    setCheckinMsg('Checking in…')
    try {
      const res = await fetch('/api/public/cx/' + slug + '/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outlet_id: outletId }),
      }).then(r => r.json())

      if (res.ok) {
        setCheckinStatus('success')
        const mins = res.expires_at
          ? Math.max(1, Math.ceil((new Date(res.expires_at).getTime() - Date.now()) / 60000))
          : 15
        setCheckinMsg('You\'re checked in! Staff will see you for the next ' + mins + ' min.')
        setTimeout(() => { setMode('show'); setCheckinStatus('idle'); setCheckinMsg('') }, 5000)
      } else {
        setCheckinStatus('error')
        setCheckinMsg(res.error ?? 'Check-in failed — try again')
      }
    } catch {
      setCheckinStatus('error')
      setCheckinMsg('Network error — try again')
    }
  }, [bizId, slug])

  // ── Start camera: BarcodeDetector (Chrome/Android) → jsQR canvas fallback ──
  const startCamera = useCallback(async () => {
    setCheckinStatus('scanning')
    setCheckinMsg('')
    setDebugMsg('requesting camera…')
    scanningRef.current = true

    // 1 — Acquire stream
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    } catch {
      setCheckinStatus('error')
      setCheckinMsg('Camera access denied — allow camera in browser settings, then retry.')
      setDebugMsg('getUserMedia rejected')
      return
    }
    streamRef.current = stream

    const video = videoRef.current
    if (!video) { stream.getTracks().forEach(t => t.stop()); return }

    video.srcObject = stream
    try { await video.play() } catch { /* autoPlay attr handles it on some browsers */ }
    setDebugMsg('camera on — waiting for first frame…')

    // 2 — iOS: videoWidth stays 0 until loadedmetadata; guard before first rAF
    if (video.videoWidth === 0) {
      await new Promise<void>(resolve => {
        const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve() }
        video.addEventListener('loadedmetadata', onMeta)
        setTimeout(resolve, 3000) // safety
      })
    }
    if (!scanningRef.current) return // user left while we waited

    // 3a — Native BarcodeDetector (Chrome / Android)
    const winAny = window as unknown as Record<string, unknown>
    if (typeof winAny['BarcodeDetector'] === 'function') {
      setDebugMsg('scanning… (BarcodeDetector)')
      const DetCtor = winAny['BarcodeDetector'] as new (opts: { formats: string[] }) => {
        detect(v: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
      }
      const detector = new DetCtor({ formats: ['qr_code'] })
      const bdLoop = async () => {
        if (!scanningRef.current) return
        try {
          const codes = await detector.detect(video)
          if (codes.length > 0 && scanningRef.current) {
            const val = codes[0].rawValue
            stopCamera()
            if ('vibrate' in navigator) navigator.vibrate(50)
            setDebugMsg('decoded: ' + val.slice(0, 60))
            await processCounterQR(val)
            return
          }
        } catch { /* no QR this frame */ }
        if (scanningRef.current) requestAnimationFrame(() => { bdLoop().catch(() => undefined) })
      }
      bdLoop().catch(() => undefined)
      return
    }

    // 3b — jsQR canvas fallback (Safari / Firefox)
    setDebugMsg('scanning… (jsQR)')
    const { default: jsQR } = await import('jsqr')
    const offscreen = document.createElement('canvas')
    const ctx = offscreen.getContext('2d')
    if (!ctx) return
    const jsLoop = () => {
      if (!scanningRef.current) return
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        offscreen.width = video.videoWidth
        offscreen.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const img = ctx.getImageData(0, 0, offscreen.width, offscreen.height)
        const result = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
        if (result && scanningRef.current) {
          stopCamera()
          if ('vibrate' in navigator) navigator.vibrate(50)
          setDebugMsg('decoded: ' + result.data.slice(0, 60))
          void processCounterQR(result.data)
          return
        }
      }
      if (scanningRef.current) requestAnimationFrame(jsLoop)
    }
    jsLoop()
  }, [stopCamera, processCounterQR])

  useEffect(() => {
    if (mode === 'camera') {
      startCamera()
    } else {
      stopCamera()
      if (mode === 'show') { setCheckinStatus('idle'); setCheckinMsg(''); setDebugMsg('') }
    }
    return stopCamera
  }, [mode, startCamera, stopCamera])

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

      {/* Mode toggle — show only when logged in */}
      {me?.found && !loading && (
        <div style={{ display: 'flex', gap: 8, padding: '0 24px 16px', justifyContent: 'center' }}>
          <button
            onClick={() => setMode('show')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 12, border: 'none',
              background: mode === 'show' ? ACCENT : 'rgba(255,255,255,0.08)',
              color: mode === 'show' ? ACCENT_TEXT : INK_MUTED,
              fontFamily: FB, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Show my code
          </button>
          <button
            onClick={() => setMode('camera')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 12, border: 'none',
              background: mode === 'camera' ? ACCENT : 'rgba(255,255,255,0.08)',
              color: mode === 'camera' ? ACCENT_TEXT : INK_MUTED,
              fontFamily: FB, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Scan counter QR
          </button>
        </div>
      )}

      {/* Content area */}
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
        ) : mode === 'camera' ? (
          /* ── Camera scan mode ── */
          <div style={{ width: '100%', maxWidth: 340 }}>
            {checkinStatus !== 'success' && (
              <p style={{ fontFamily: FB, fontSize: 13, color: INK_MUTED, textAlign: 'center', marginBottom: 12 }}>
                Point camera at the QR on the counter card
              </p>
            )}
            {checkinStatus !== 'success' && (
              <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#111', aspectRatio: '1' }}>
                <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <div style={{ width: 180, height: 180, border: '2.5px solid ' + ACCENT, borderRadius: 16, boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' }} />
                </div>
                {process.env.NODE_ENV !== 'production' && debugMsg && (
                  <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, background: 'rgba(0,0,0,0.78)', color: ACCENT, fontFamily: 'monospace', fontSize: 10, padding: '4px 8px', borderRadius: 6, wordBreak: 'break-all', pointerEvents: 'none' }}>
                    {debugMsg}
                  </div>
                )}
              </div>
            )}
            {checkinStatus === 'success' && (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
                <p style={{ fontFamily: FD, fontStyle: 'italic', fontSize: 24, color: '#00B140', margin: '0 0 10px' }}>Checked in!</p>
                <p style={{ fontFamily: FB, fontSize: 14, color: INK_MUTED, margin: 0 }}>{checkinMsg}</p>
              </div>
            )}
            {checkinStatus === 'error' && (
              <div style={{ marginTop: 16, padding: '14px 18px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, textAlign: 'center' }}>
                <p style={{ fontFamily: FB, fontSize: 13, color: '#EF4444', margin: '0 0 10px' }}>{checkinMsg}</p>
                <button onClick={() => startCamera()} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: INK, padding: '6px 16px', borderRadius: 8, fontFamily: FB, fontSize: 12, cursor: 'pointer' }}>
                  Try again
                </button>
              </div>
            )}
            {checkinStatus !== 'success' && (
              <button
                onClick={() => setMode('show')}
                style={{ marginTop: 16, width: '100%', padding: '10px 0', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: 'none', color: INK_MUTED, fontFamily: FB, fontSize: 13, cursor: 'pointer' }}
              >
                ← Back to my code
              </button>
            )}
          </div>
        ) : (
          /* ── Show my code mode ── */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: INK_MUTED, fontFamily: FB, fontSize: 12, marginBottom: 16 }}>
              <BrightnessIcon />
              <span>Set brightness to maximum before scanning</span>
            </div>

            <div style={{
              width: '100%', maxWidth: 340,
              background: '#fff', borderRadius: 24,
              padding: '24px 20px 20px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                <canvas ref={qrCanvasRef} style={{ display: 'block', maxWidth: '100%' }} />
              </div>

              <div style={{ marginTop: 14, background: '#f5f5f5', borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
                <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: '0.12em', color: '#0a0a0a' }}>
                  {displayCode}
                </span>
              </div>

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