'use client'
import { Player } from '@remotion/player'
import { BrainOrbComp } from '../remotion/BrainOrbComp'

const CAPABILITIES = [
  { label: 'Daily Briefings',       icon: '☀' },
  { label: 'Customer Win-back',     icon: '↩' },
  { label: 'Reviews & Reputation',  icon: '★' },
  { label: 'Profit-Leak Analysis',  icon: '⚡' },
  { label: 'Bookings',              icon: '📅' },
  { label: 'Compliance',            icon: '✓' },
  { label: 'Competitor Tracking',   icon: '◎' },
  { label: 'Marketing',             icon: '◈' },
  { label: 'Point-of-Sale',         icon: '⊞' },
  { label: 'Inventory & Stock',     icon: '▦' },
]

export default function BrainScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>02 · One operating system</div>
      <h2 style={{ textAlign: 'center' }}>Ten dashboards. <em>One brain. Yours.</em></h2>
      <Player
        component={BrainOrbComp}
        durationInFrames={200}
        fps={30}
        compositionWidth={560}
        compositionHeight={280}
        style={{ width: '100%', maxWidth: 500, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(127,184,151,0.15)', marginInline: 'auto' }}
        loop
        autoPlay
      />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.625rem',
        marginTop: '1.5rem',
        width: '100%',
        maxWidth: 520,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}>
        {CAPABILITIES.map(c => (
          <div key={c.label} style={{
            background: '#1A2620',
            border: '1px solid rgba(127,184,151,0.15)',
            borderRadius: 8,
            padding: '0.625rem 0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8rem',
            color: '#9BA8A0',
          }}>
            <span style={{ fontSize: '0.875rem', opacity: 0.7 }}>{c.icon}</span>
            {c.label}
          </div>
        ))}
      </div>
    </>
  )
}
