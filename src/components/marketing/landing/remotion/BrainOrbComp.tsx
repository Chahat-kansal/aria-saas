'use client'
import { useEffect, useRef, useState } from 'react'

const MODULES = ['Briefing', 'Ask Aria', 'Customers', 'POS', 'Marketing', 'Compliance', 'Bookings', 'Stock']
const RX = 130
const RY = 75

const style = `
@keyframes pulse {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.04); }
}
`

export function BrainOrbComp() {
  const [frame, setFrame] = useState(0)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let f = 0
    const tick = () => {
      f++
      setFrame(f)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const activeIdx = Math.floor(frame / 40) % MODULES.length

  return (
    <div style={{ background: '#0E1411', height: '100%', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <style>{style}</style>
      <svg width="100%" height="100%" viewBox="-200 -130 400 260" style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="coreG" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7FB897" stopOpacity="0.9" />
            <stop offset="60%" stopColor="#2D5240" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#0E1411" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="0" cy="0" rx={RX} ry={RY} fill="none" stroke="rgba(127,184,151,0.1)" strokeWidth="1" strokeDasharray="4 6" />
        <circle cx="0" cy="0" r="48" fill="url(#coreG)" style={{ animation: 'pulse 3s ease-in-out infinite' }} />
        <circle cx="0" cy="0" r="48" fill="none" stroke="#7FB897" strokeWidth="1" opacity="0.4" />
        <text x="0" y="6" textAnchor="middle" fontSize="15" fontFamily="'Cormorant', Georgia, serif" fontStyle="italic" fill="#e8ede9" opacity="0.95">Aria</text>
        {MODULES.map((label, i) => {
          const angle = (i / MODULES.length) * Math.PI * 2 + frame * 0.012
          const x = Math.cos(angle) * RX
          const y = Math.sin(angle) * RY
          const isActive = i === activeIdx
          return (
            <g key={label} transform={`translate(${x},${y})`}>
              <circle r={isActive ? 30 : 26} fill={isActive ? 'rgba(127,184,151,0.18)' : 'rgba(255,255,255,0.04)'} stroke={isActive ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.1)'} strokeWidth="1" />
              <text textAnchor="middle" y="4" fontSize={isActive ? 8 : 7} fill={isActive ? '#7FB897' : 'rgba(255,255,255,0.35)'} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.04em">{label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
