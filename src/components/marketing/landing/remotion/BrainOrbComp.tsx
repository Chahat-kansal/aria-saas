'use client'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

const ORB_LABELS = ['Briefing', 'Ask Aria', 'Customers', 'POS', 'Marketing', 'Compliance', 'Bookings', 'Stock']
const RX = 140
const RY = 80

export function BrainOrbComp() {
  const frame = useCurrentFrame()
  const activeIdx = Math.floor(frame / 20) % 8

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="100%" height="100%" viewBox="-220 -140 440 280" style={{ overflow: 'visible' }}>
        {/* Central core */}
        <defs>
          <radialGradient id="coreGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7FB897" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#2D5240" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#0E1411" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <circle cx="0" cy="0" r="52" fill="url(#coreGrad)" opacity={0.85 + Math.sin(frame * 0.06) * 0.1} />
        <circle cx="0" cy="0" r="52" fill="none" stroke="#7FB897" strokeWidth="1" opacity={0.4 + Math.sin(frame * 0.06) * 0.2} />
        <text x="0" y="5" textAnchor="middle" fontSize="16" fontFamily="'Cormorant', Georgia, serif" fontStyle="italic" fill="#e8ede9" opacity="0.95">Aria</text>

        {/* Orbit path (visual) */}
        <ellipse cx="0" cy="0" rx={RX} ry={RY} fill="none" stroke="rgba(127,184,151,0.1)" strokeWidth="1" strokeDasharray="4 6" />

        {/* Orbiting nodes */}
        {ORB_LABELS.map((label, i) => {
          const angle = (i / 8) * Math.PI * 2 + frame * 0.012
          const x = Math.cos(angle) * RX
          const y = Math.sin(angle) * RY
          const isActive = i === activeIdx
          return (
            <g key={i} transform={'translate(' + x + ',' + y + ')'} filter={isActive ? 'url(#glow)' : undefined}>
              <circle r="26" fill={isActive ? 'rgba(127,184,151,0.22)' : 'rgba(14,20,17,0.9)'} stroke={isActive ? '#7FB897' : 'rgba(127,184,151,0.25)'} strokeWidth={isActive ? 1.5 : 1} />
              <text y="4" textAnchor="middle" fontSize="8.5" fontFamily="'Outfit', system-ui, sans-serif" fill={isActive ? '#7FB897' : 'rgba(155,168,160,0.75)'} fontWeight={isActive ? '600' : '400'}>{label}</text>
            </g>
          )
        })}
      </svg>
    </AbsoluteFill>
  )
}
