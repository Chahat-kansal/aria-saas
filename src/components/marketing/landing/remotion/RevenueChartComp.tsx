'use client'
import { useEffect, useState } from 'react'

const BARS = [
  { day: 'Mon', val: 1820, last: 1650 },
  { day: 'Tue', val: 2340, last: 2100 },
  { day: 'Wed', val: 1980, last: 2200 },
  { day: 'Thu', val: 2650, last: 2400 },
  { day: 'Fri', val: 3100, last: 2800 },
  { day: 'Sat', val: 2847, last: 2400 },
  { day: 'Sun', val: 1400, last: 1320 },
]
const MAX = 3100

export function RevenueChartComp() {
  const [heights, setHeights] = useState(BARS.map(() => 0))
  const MAX_H = 160

  useEffect(() => {
    const timers = BARS.map((bar, i) =>
      setTimeout(() => {
        setHeights(prev => {
          const next = [...prev]
          next[i] = (bar.val / MAX) * MAX_H
          return next
        })
      }, i * 80 + 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const lastAvg = BARS.reduce((s, b) => s + b.last, 0) / BARS.length
  const refY = (1 - lastAvg / MAX) * MAX_H

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>Revenue this week</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', height: MAX_H + 28, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: refY, borderTop: '1px dashed rgba(127,184,151,0.3)', pointerEvents: 'none' }} />
          <span style={{ position: 'absolute', right: 0, top: refY - 14, fontSize: 9, color: 'rgba(127,184,151,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>last wk avg</span>
          {BARS.map((bar, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ width: '100%', height: heights[i], borderRadius: '4px 4px 0 0', background: 'linear-gradient(to top, #2D5240, #7FB897)', transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)', boxShadow: '0 0 8px rgba(127,184,151,0.2)' }} />
              <span style={{ fontSize: 10, color: 'rgba(155,168,160,0.7)', fontFamily: "'JetBrains Mono', monospace" }}>{bar.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
