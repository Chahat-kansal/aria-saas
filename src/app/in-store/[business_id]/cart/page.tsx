'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'

const INK = '#0a0a0a', CREAM = '#fafafa', SURFACE = '#ffffff', INK_SOFT = '#888888', ACCENT = '#d9f54e', LIVE = '#ff3b5e'
const BORDER = `1.5px solid ${INK}`
const FONT = 'Inter, system-ui, -apple-system, sans-serif'

interface Item { product_id: string; name: string; price_cents: number; qty: number; age_restricted: boolean }
const money = (c: number) => '$' + (c / 100).toFixed(2)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<Array<{ rawValue: string }>> }

export default function ScanAndGoCart() {
  const { business_id } = useParams<{ business_id: string }>()
  const [items, setItems] = useState<Item[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [toast, setToast] = useState('')
  const [phase, setPhase] = useState<'shopping' | 'finished' | 'paid'>('shopping')
  const [qr, setQr] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [loyaltyPhone, setLoyaltyPhone] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastScanRef = useRef<{ code: string; at: number }>({ code: '', at: 0 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zxingRef = useRef<any>(null)

  const subtotal = items.reduce((n, i) => n + i.price_cents * i.qty, 0)
  const count = items.reduce((n, i) => n + i.qty, 0)

  const flashToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500) }

  const sendCart = useCallback(async (action: string, payload: Record<string, unknown>) => {
    const res = await fetch('/api/public/scan-and-go/cart', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id, token, action, ...payload }),
    })
    if (res.status === 401) { window.location.href = `/in-store/${business_id}`; return }
    const d = await res.json()
    if (d.token) setToken(d.token)
    if (d.not_found) { flashToast("We don't have that one yet — please bring it to the counter.") }
    else if (d.items) setItems(d.items)
  }, [business_id, token])

  const onCode = useCallback((code: string) => {
    const now = Date.now()
    if (code === lastScanRef.current.code && now - lastScanRef.current.at < 2500) return
    lastScanRef.current = { code, at: now }
    if (navigator.vibrate) navigator.vibrate(40)
    sendCart('add', { barcode: code })
  }, [sendCart])

  const stopScan = useCallback(() => {
    setScanning(false)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    if (zxingRef.current) { try { zxingRef.current.reset() } catch { /* noop */ } zxingRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  const startScan = useCallback(async () => {
    setScanning(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      const video = videoRef.current
      if (!video) return
      video.srcObject = stream
      await video.play()

      const W = window as unknown as { BarcodeDetector?: new (o?: unknown) => BarcodeDetectorLike }
      if (W.BarcodeDetector) {
        const detector = new W.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'] })
        const loop = async () => {
          if (!streamRef.current) return
          try { const codes = await detector.detect(video); if (codes[0]?.rawValue) onCode(codes[0].rawValue) } catch { /* frame miss */ }
          rafRef.current = requestAnimationFrame(loop)
        }
        loop()
      } else {
        type ZxingReader = { decodeFromVideoDevice: (deviceId: string | null, video: HTMLVideoElement, cb: (result: { getText: () => string } | null) => void) => void; reset: () => void }
        const mod = await import('@zxing/library')
        const reader = new mod.BrowserMultiFormatReader() as unknown as ZxingReader
        zxingRef.current = reader
        reader.decodeFromVideoDevice(null, video, (result) => { if (result) onCode(result.getText()) })
      }
    } catch {
      flashToast('Camera unavailable — check permissions.')
      setScanning(false)
    }
  }, [onCode])

  useEffect(() => () => stopScan(), [stopScan])

  // Pre-add a product when arriving from a chat "Add to basket" link (?add=<id>),
  // then strip the param so a refresh doesn't add it again.
  const preAdded = useRef(false)
  useEffect(() => {
    if (preAdded.current) return
    const pid = new URLSearchParams(window.location.search).get('add')
    if (!pid) return
    preAdded.current = true
    sendCart('add', { product_id: pid })
    const url = new URL(window.location.href)
    url.searchParams.delete('add')
    window.history.replaceState({}, '', url.toString())
  }, [sendCart])

  async function finish() {
    stopScan()
    const res = await fetch('/api/public/scan-and-go/finish', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id, token, loyalty_phone: loyaltyPhone.trim() || undefined }),
    })
    const d = await res.json()
    if (d.error) { flashToast(d.error); return }
    setPhase('finished')
    setQr(await QRCode.toDataURL(token ?? '', { width: 320, margin: 2, color: { dark: '#0a0a0a', light: '#ffffff' } }))
    if (d.expires_at) setSecondsLeft(Math.max(0, Math.round((new Date(d.expires_at).getTime() - Date.now()) / 1000)))
  }

  // Countdown + poll for redemption once finished.
  useEffect(() => {
    if (phase !== 'finished' || !token) return
    const tick = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    const poll = setInterval(async () => {
      try {
        const d = await fetch(`/api/public/scan-and-go/cart?token=${token}`).then(r => r.json())
        if (d.status === 'redeemed') { setPhase('paid'); clearInterval(poll); clearInterval(tick) }
        if (d.status === 'expired') { clearInterval(poll); clearInterval(tick) }
      } catch (e) { console.warn('[non-fatal]', e) }
    }, 4000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [phase, token])

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: CREAM, color: INK, fontFamily: FONT, padding: '20px 16px 120px' }}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>{children}</div>
    </div>
  )

  if (phase === 'paid') return wrap(
    <div style={{ textAlign: 'center', paddingTop: 60 }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <h1 style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Paid — thank you!</h1>
      <p style={{ color: INK_SOFT, fontSize: 15 }}>Your items are all sorted. Have a great day.</p>
    </div>
  )

  if (phase === 'finished') return wrap(
    <div style={{ textAlign: 'center', paddingTop: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Show this to the cashier</h1>
      <p style={{ color: INK_SOFT, fontSize: 14, margin: '0 0 16px' }}>{count} item{count === 1 ? '' : 's'} · {money(subtotal)}</p>
      {qr && <img src={qr} alt="Cart code" style={{ width: 260, height: 260, border: BORDER, borderRadius: 18, background: '#fff', padding: 10 }} />}
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '0.15em', marginTop: 14 }}>{token}</div>
      {secondsLeft > 0 && <p style={{ color: INK_SOFT, fontSize: 13, marginTop: 8 }}>Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</p>}
      {secondsLeft === 0 && <p style={{ color: LIVE, fontSize: 13, marginTop: 8 }}>This code has expired — re-open your cart to try again.</p>}
    </div>
  )

  return wrap(
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 4px', fontFamily: "'Fraunces', serif", fontStyle: 'italic' }}>Scan as you shop</h1>
      <p style={{ fontSize: 13, color: INK_SOFT, margin: '0 0 16px' }}>Scan each item, then show one code at the till.</p>

      {scanning ? (
        <div style={{ border: BORDER, borderRadius: 18, overflow: 'hidden', marginBottom: 14, position: 'relative', background: '#000' }}>
          <video ref={videoRef} playsInline muted style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }} />
          <button onClick={stopScan} style={{ position: 'absolute', top: 10, right: 10, height: 34, padding: '0 12px', borderRadius: 10, border: BORDER, background: SURFACE, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' }}>Done</button>
        </div>
      ) : (
        <button onClick={startScan} style={{ width: '100%', height: 56, borderRadius: 16, border: BORDER, background: ACCENT, color: INK, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: FONT, marginBottom: 14 }}>
          📷 Tap to scan a product
        </button>
      )}

      {toast && <div style={{ background: '#ffe9ec', border: `1.5px solid ${LIVE}`, borderRadius: 12, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{toast}</div>}

      {items.length === 0 ? (
        <p style={{ textAlign: 'center', color: INK_SOFT, fontSize: 14, padding: 24 }}>No items yet. Scan something to get started.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(it => (
            <div key={it.product_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: SURFACE, border: BORDER, borderRadius: 14, padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{it.name} {it.age_restricted && <span title="ID check at till" style={{ fontSize: 10, fontWeight: 700, color: LIVE }}>18+</span>}</div>
                <div style={{ fontSize: 12, color: INK_SOFT }}>{money(it.price_cents)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => sendCart('update_qty', { product_id: it.product_id, qty: it.qty - 1 })} style={qtyBtn}>−</button>
                <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 700 }}>{it.qty}</span>
                <button onClick={() => sendCart('update_qty', { product_id: it.product_id, qty: it.qty + 1 })} style={qtyBtn}>+</button>
                <button onClick={() => sendCart('remove', { product_id: it.product_id })} style={{ ...qtyBtn, borderColor: LIVE, color: LIVE }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky footer */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: SURFACE, borderTop: BORDER, padding: '12px 16px' }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: INK_SOFT }}>{count} item{count === 1 ? '' : 's'}</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{money(subtotal)}</div>
          </div>
          <button onClick={finish} disabled={items.length === 0} style={{ height: 48, padding: '0 22px', borderRadius: 14, border: BORDER, background: items.length ? ACCENT : '#eee', color: INK, fontSize: 15, fontWeight: 800, cursor: items.length ? 'pointer' : 'default', fontFamily: FONT }}>
            Finish shopping →
          </button>
        </div>
      </div>
    </div>
  )
}

const qtyBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 9, border: BORDER, background: SURFACE, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: FONT, lineHeight: 1 }
