'use client'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const ITEMS = [
  { name: 'Flat white', price: 4.50 },
  { name: 'Acai Bowl', price: 14.00 },
  { name: 'Cold brew', price: 6.50 },
]
const MAX_TOTAL = 25.00

export function POSCheckoutComp() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const total = interpolate(frame, [55, 85], [0, MAX_TOTAL], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  const btnScale = spring({ frame: frame - 95, fps, config: { damping: 12, stiffness: 180 } })
  const btnOpacity = interpolate(frame, [95, 108], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>
        POS Checkout
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
        {ITEMS.map((item, i) => {
          const delay = 8 + i * 16
          const sp = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 110 } })
          const opacity = interpolate(sp, [0, 1], [0, 1])
          const y = interpolate(sp, [0, 1], [16, 0])
          return (
            <div key={i} style={{ opacity, transform: 'translateY(' + y + 'px)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '11px 14px' }}>
              <span style={{ fontSize: 13, color: '#e8ede9' }}>{item.name}</span>
              <span style={{ fontSize: 13, color: '#9BA8A0', fontFamily: "'JetBrains Mono', monospace" }}>${item.price.toFixed(2)}</span>
            </div>
          )
        })}
      </div>

      <div style={{ borderTop: '1px solid rgba(127,184,151,0.12)', paddingTop: 14, marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: '#9BA8A0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total</span>
          <span style={{ fontFamily: "'Cormorant', Georgia, serif", fontStyle: 'italic', fontSize: 28, fontWeight: 600, color: '#7FB897' }}>${total.toFixed(2)}</span>
        </div>
        <div style={{ opacity: btnOpacity, transform: 'scale(' + btnScale + ')', background: 'linear-gradient(135deg, #7FB897, #2D5240)', borderRadius: 10, padding: '13px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#fff', boxShadow: '0 4px 16px rgba(127,184,151,0.35)' }}>
          Charge $25.00
        </div>
      </div>
    </AbsoluteFill>
  )
}
