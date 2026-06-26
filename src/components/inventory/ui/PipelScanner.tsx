'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import React from 'react'
import { useZxing } from 'react-zxing'
import { isIOSDevice } from '@/lib/mobile-detect'
import { P } from '@/lib/inventory/ui/pipel-tokens'

// INV-SCAN-CAMERA — a Pipel-styled camera barcode scanner for the inventory staff app. Reuses react-zxing +
// the POS BarcodeScanner's patterns (rear camera facingMode:environment, isIOSDevice, permission states via the
// video 'play' event + a 5s timeout, debounced decode) but renders INLINE in the Pipel scan card (not the POS
// full-screen purple overlay). A successful decode calls onDecode(text) — which the scan tab feeds into the
// existing runScan/scanLookup flow (no new lookup path). On denied/error it calls onDenied so the parent shows
// the manual-entry fallback. The parent only mounts this when the camera is actually supported (secure context).

export function PipelScanner({ active, onDecode, onDenied }: { active: boolean; onDecode: (text: string) => void; onDenied: () => void }) {
  const [permission, setPermission] = useState<'pending' | 'granted' | 'denied'>('pending')
  const [flash, setFlash] = useState(false)
  const lastText = useRef(''); const lastTs = useRef(0); const notified = useRef(false)

  const handle = useCallback((result: { getText: () => string }) => {
    const text = result.getText(); if (!text) return
    const now = Date.now()
    if (text === lastText.current && now - lastTs.current < 1500) return // debounce same code
    lastText.current = text; lastTs.current = now
    setFlash(true); setTimeout(() => setFlash(false), 250)
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(70)
    onDecode(text)
  }, [onDecode])

  const { ref } = useZxing({
    constraints: { video: { facingMode: isIOSDevice() ? { exact: 'environment' } : { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
    paused: !active,
    onDecodeResult: handle,
    onError: () => setPermission('denied'),
  })

  // grant detection via the video 'play' event; denied via a 5s no-stream timeout (same as the POS scanner)
  useEffect(() => { const el = ref.current; if (!el) return; const onPlay = () => setPermission('granted'); el.addEventListener('play', onPlay); return () => el.removeEventListener('play', onPlay) }, [ref])
  useEffect(() => { if (!active) return; const t = setTimeout(() => { if (permission === 'pending' && ref.current && !ref.current.srcObject) setPermission('denied') }, 5000); return () => clearTimeout(t) }, [active, permission, ref])
  useEffect(() => { if (permission === 'denied' && !notified.current) { notified.current = true; onDenied() } }, [permission, onDenied])

  if (permission === 'denied') return null // parent renders the manual-entry fallback

  return (
    <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', border: `1.5px solid ${P.ink}`, background: '#000', aspectRatio: '4 / 3', marginTop: 4 }}>
      <video ref={ref as React.RefObject<HTMLVideoElement>} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {flash && <div style={{ position: 'absolute', inset: 0, background: 'rgba(217,245,78,.40)', pointerEvents: 'none' }} />}
      {permission === 'pending' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.65)', color: '#fff', fontSize: 13, fontWeight: 600 }}>starting camera…</div>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ width: '72%', height: '46%', border: `2px solid ${P.lime}`, borderRadius: 12, boxShadow: '0 0 0 2000px rgba(0,0,0,.34)' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,.85)', fontSize: 11, fontWeight: 600, pointerEvents: 'none' }}>point at a barcode</div>
    </div>
  )
}
