'use client'
import React, { useEffect, useState } from 'react'

const BARS = [
  { day: 'Mon', val: 1820 }, { day: 'Tue', val: 2340 }, { day: 'Wed', val: 1980 },
  { day: 'Thu', val: 2650 }, { day: 'Fri', val: 3100 }, { day: 'Sat', val: 2847 }, { day: 'Sun', val: 1400 },
]
const MAX = 3100
const MAX_H = 160

export function RevenueChartComp() {
  const [heights, setHeights] = useState(BARS.map(() => 0))

  useEffect(() => {
    const timers = BARS.map((bar, i) =>
      setTimeout(() => {
        setHeights(prev => { const n = [...prev]; n[i] = (bar.val / MAX) * MAX_H; return n })
      }, i * 80 + 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  const lastAvg = 2240
  const refY = (1 - lastAvg / MAX) * MAX_H

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>Revenue this week</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', height: MAX_H + 28, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: refY, borderTop: '1px dashed rgba(127,184,151,0.3)' }} />
          <span style={{ position: 'absolute', right: 0, top: refY - 14, fontSize: 9, color: 'rgba(127,184,151,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>last wk avg</span>
          {BARS.map((bar, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ width: '100%', height: heights[i], borderRadius: '4px 4px 0 0', background: 'linear-gradient(to top,#2D5240,#7FB897)', transition: 'height 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
              <span style={{ fontSize: 10, color: 'rgba(155,168,160,0.7)', fontFamily: "'JetBrains Mono',monospace" }}>{bar.day}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
