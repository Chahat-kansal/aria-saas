'use client'
import { useEffect, useRef, useState } from 'react'

const TOTAL = 24
const SENSITIVITY = TOTAL / 280  // full rotation ≈ 280px drag
const DAMPING = 0.82

export interface Spin360ViewerProps {
  slug: string
  bgMode?: 'transparent' | 'grey'  // transparent = rembg'd vessel on #fafafa; grey = baked #c8c8c4 bg
  sizeScale?: number                // 0.9 = Regular, 1.0 = Large
  size?: number                     // canvas side px (default 320)
}

export function Spin360Viewer({ slug, bgMode = 'transparent', sizeScale = 1.0, size = 320 }: Spin360ViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loadedCount, setLoadedCount] = useState(0)
  const [hintVisible, setHintVisible] = useState(true)

  const imagesRef = useRef<HTMLImageElement[]>([])
  const frameRef = useRef(0)
  const isDraggingRef = useRef(false)
  const lastXRef = useRef(0)
  const velRef = useRef(0)
  const sizeScaleRef = useRef(sizeScale)
  const sizeRef = useRef(size)
  const bgModeRef = useRef(bgMode)
  const rafRef = useRef(0)

  useEffect(() => { sizeScaleRef.current = sizeScale }, [sizeScale])
  useEffect(() => { sizeRef.current = size }, [size])
  useEffect(() => { bgModeRef.current = bgMode }, [bgMode])

  // Preload 24 frames on slug change
  useEffect(() => {
    imagesRef.current = []
    setLoadedCount(0)
    setHintVisible(true)
    frameRef.current = 0
    let loaded = 0
    for (let i = 0; i < TOTAL; i++) {
      const img = new Image()
      img.onload = () => { loaded++; setLoadedCount(loaded) }
      img.src = '/menu/_lib/spin/' + slug + '/' + String(i).padStart(3, '0') + '.webp'
      imagesRef.current[i] = img
    }
  }, [slug])

  // Animation loop + pointer drag
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function draw() {
      rafRef.current = requestAnimationFrame(draw)
      const s = sizeRef.current
      const sc = sizeScaleRef.current

      // Decay momentum only — no auto-advance, at rest = frozen on frame 000
      if (!isDraggingRef.current && Math.abs(velRef.current) > 0.04) {
        velRef.current *= DAMPING
        frameRef.current = ((frameRef.current - velRef.current) % TOTAL + TOTAL) % TOTAL
      }

      const idx = Math.round(frameRef.current) % TOTAL
      const img = imagesRef.current[idx]
      if (!img || !img.complete || !img.naturalWidth) return

      ctx!.clearRect(0, 0, s, s)

      if (bgModeRef.current === 'grey') {
        // Baked grey-bg frame: fill canvas with exact #c8c8c4 then draw edge-to-edge.
        // No offset, no sizeScale — eliminates the inner-rectangle artefact caused by
        // clearRect transparency or WebP compression drift at the frame boundary.
        ctx!.fillStyle = '#c8c8c4'
        ctx!.fillRect(0, 0, s, s)
        ctx!.drawImage(img, 0, 0, s, s)
      } else {
        // Transparent rembg vessel: #fafafa fill + soft contact shadow + sizeScale draw
        ctx!.fillStyle = '#fafafa'
        ctx!.fillRect(0, 0, s, s)

        ctx!.save()
        ctx!.globalAlpha = 0.18
        ctx!.filter = 'blur(12px)'
        ctx!.beginPath()
        ctx!.ellipse(s / 2, s * 0.875, s * 0.26, s * 0.045, 0, 0, Math.PI * 2)
        ctx!.fillStyle = '#1a1a1a'
        ctx!.fill()
        ctx!.restore()
        ctx!.filter = 'none'

        const dw = s * sc
        const dh = s * sc
        ctx!.drawImage(img, (s - dw) / 2, (s - dh) / 2, dw, dh)
      }
    }

    rafRef.current = requestAnimationFrame(draw)

    function onDown(e: PointerEvent) {
      isDraggingRef.current = true
      lastXRef.current = e.clientX
      velRef.current = 0
      canvas!.setPointerCapture(e.pointerId)
      setHintVisible(false)
    }
    function onMove(e: PointerEvent) {
      if (!isDraggingRef.current) return
      const dx = e.clientX - lastXRef.current
      const delta = dx * SENSITIVITY
      frameRef.current = ((frameRef.current - delta) % TOTAL + TOTAL) % TOTAL
      velRef.current = delta
      lastXRef.current = e.clientX
    }
    function onUp() { isDraggingRef.current = false }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointerleave', onUp)

    return () => {
      cancelAnimationFrame(rafRef.current)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointerleave', onUp)
    }
  }, [])

  const allLoaded = loadedCount >= TOTAL
  const cardBg = bgMode === 'grey' ? '#c8c8c4' : '#fafafa'

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 24,
        background: cardBg,
        boxShadow: '0 8px 32px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none' as React.CSSProperties['WebkitUserSelect'],
      }}
    >
      {!allLoaded && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <div style={{ width: 120, height: 3, background: '#e5e7eb', borderRadius: 2 }}>
            <div
              style={{
                height: '100%',
                width: (loadedCount / TOTAL * 100) + '%',
                background: '#0a0a0a',
                borderRadius: 2,
                transition: 'width 0.08s',
              }}
            />
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: "'Inter', system-ui, sans-serif" }}>
            {loadedCount}/{TOTAL}
          </div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          display: 'block',
          cursor: 'grab',
          opacity: allLoaded ? 1 : 0,
          transition: 'opacity 0.25s',
        }}
      />

      {allLoaded && hintVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.42)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.03em',
            padding: '4px 10px',
            borderRadius: 20,
            pointerEvents: 'none',
            fontFamily: "'Inter', system-ui, sans-serif",
            whiteSpace: 'nowrap',
          }}
        >
          360° drag
        </div>
      )}
    </div>
  )
}