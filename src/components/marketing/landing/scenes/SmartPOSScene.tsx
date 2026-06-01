'use client'
import { POSCheckoutComp } from '../remotion/POSCheckoutComp'
import { RemotionPlayer } from '../remotion/RemotionPlayer'

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
      <div className="scene-label" style={{ textAlign: 'center' }}>Point of sale</div>
      <h2 dangerouslySetInnerHTML={{ __html: 'The only POS that gets <em>smarter every day</em>' }} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2.5rem',
        width: '100%',
        maxWidth: 860,
        alignItems: 'center',
      }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {CHECKS.map(c => (
            <li key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '0.9rem', color: '#cdd6cf' }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>✓</span>
              {c}
            </li>
          ))}
        </ul>
        <RemotionPlayer
          component={POSCheckoutComp}
          durationInFrames={150}
          fps={30}
          compositionWidth={400}
          compositionHeight={340}
          style={{ width: '100%', borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.18)' }}
          loop
          autoPlay
        />
      </div>
    </>
  )
}
