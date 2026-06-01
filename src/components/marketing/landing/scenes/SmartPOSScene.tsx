'use client'
import { Player } from '@remotion/player'
import { POSCheckoutComp } from '../remotion/POSCheckoutComp'

const CHECKS = [
  'Barcode scanning + product search',
  'Cash, card and split payments',
  'Loyalty points built in',
  'Age verification for liquor',
  'Receipt email + print',
  'Real-time stock updates',
  'Offline mode',
]

export default function SmartPOSScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>POS</div>
      <h2 style={{ textAlign: 'center' }}>The only POS that gets <em>smarter every day</em></h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem',
        width: '100%', maxWidth: 900, marginInline: 'auto', marginTop: '2rem', alignItems: 'center',
      }}>
        {/* Checklist */}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {CHECKS.map(c => (
            <li key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '0.95rem', color: '#cdd6cf' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
              {c}
            </li>
          ))}
        </ul>
        {/* Animated POS checkout */}
        <Player
          component={POSCheckoutComp}
          durationInFrames={150}
          fps={30}
          compositionWidth={560}
          compositionHeight={300}
          style={{ width: '100%', maxWidth: 360, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)', marginInline: 'auto' }}
          loop
          autoPlay
        />
      </div>
    </>
  )
}
