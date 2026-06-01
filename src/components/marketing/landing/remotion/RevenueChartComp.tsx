'use client'
import React, { useEffect, useState } from 'react'

const BARS = [
  { day: 'Mon', val: 1820, label: '$1.8k' },
  { day: 'Tue', val: 2340, label: '$2.3k' },
  { day: 'Wed', val: 1980, label: '$2.0k' },
  { day: 'Thu', val: 2650, label: '$2.7k' },
  { day: 'Fri', val: 3100, label: '$3.1k' },
  { day: 'Sat', val: 2847, label: '$2.8k' },
  { day: 'Sun', val: 1400, label: '$1.4k' },
]
const MAX = 3100
const MAX_H = 150

export function RevenueChartComp() {
  const [heights, setHeights] = useState(BARS.map(() => 0))
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    // Animate bars in
    const timers = BARS.map((bar, i) =>
      setTimeout(() => {
        setHeights(prev => { const n = [...prev]; n[i] = (bar.val / MAX) * MAX_H; return n })
      }, i * 70 + 150)
    )
    return () => timers.forEach(clearTimeout)
  }, [cycle])

  // Loop every 5s
  useEffect(() => {
    const t = setInterval(() => {
      setHeights(BARS.map(() => 0))
      setTimeout(() => setCycle(c => c + 1), 80)
    }, 5000)
    return () => clearInterval(t)
  }, [])

  const lastAvg = 2240
  const refY = (1 - lastAvg / MAX) * MAX_H

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '24px 28px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', opacity: 0.8 }}>Revenue this week</div>
        <div style={{ fontSize: 11, color: '#e8ede9', fontFamily: "'JetBrains Mono',monospace" }}>↑ 18% <span style={{ color: 'rgba(155,168,160,0.5)' }}>vs last wk</span></div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', height: MAX_H + 32, display: 'flex', alignItems: 'flex-end', gap: 5 }}>
          <div style={{ position: 'absolute', left: 0, right: 0, top: refY, borderTop: '1px dashed rgba(127,184,151,0.25)' }} />
          <span style={{ position: 'absolute', right: 0, top: refY - 15, fontSize: 9, color: 'rgba(127,184,151,0.55)', fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'nowrap' }}>last wk avg $2.2k</span>
          {BARS.map((bar, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              {heights[i] > 0 && (
                <span style={{ fontSize: 8, color: 'rgba(127,184,151,0.7)', fontFamily: "'JetBrains Mono',monospace" }}>{bar.label}</span>
              )}
              <div style={{ width: '100%', height: heights[i], borderRadius: '4px 4px 0 0', background: bar.day === 'Fri' ? 'linear-gradient(to top,#3d7055,#90c9a3)' : 'linear-gradient(to top,#2D5240,#7FB897)', transition: 'height 0.55s cubic-bezier(0.16,1,0.3,1)', boxShadow: bar.day === 'Fri' ? '0 0 12px rgba(127,184,151,0.3)' : 'none' }} />
              <span style={{ fontSize: 9, color: 'rgba(155,168,160,0.6)', fontFamily: "'JetBrains Mono',monospace" }}>{bar.day}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 14, padding: '10px 12px', background: 'rgba(127,184,151,0.06)', borderRadius: 8, border: '1px solid rgba(127,184,151,0.12)' }}>
        <div style={{ fontSize: 10, color: '#9BA8A0' }}>🏆 <span style={{ color: '#e8ede9', fontWeight: 500 }}>Acai Bowl</span> — $847 this week</div>
        <div style={{ fontSize: 10, color: '#9BA8A0', marginLeft: 'auto' }}>Fri is your peak day</div>
      </div>
    </div>
  )
}
