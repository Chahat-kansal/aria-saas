'use client'
import dynamic from 'next/dynamic'

// Dynamically imported to prevent SSR — Remotion hooks are browser-only
const RemotionPlayerInner = dynamic(
  () => import('./RemotionPlayerInner'),
  { ssr: false, loading: () => (
    <div style={{ background: '#0E1411', borderRadius: 16, border: '1px solid rgba(127,184,151,0.18)', aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: '2px solid rgba(127,184,151,0.3)', borderTopColor: '#7FB897', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )}
)

export { RemotionPlayerInner as RemotionPlayer }
