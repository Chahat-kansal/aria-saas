'use client'
import { AbsoluteFill, useCurrentFrame, spring, useVideoConfig } from 'remotion'

const BARS = [
  { day: 'Mon', val: 1820, lastWeek: 1650 },
  { day: 'Tue', val: 2340, lastWeek: 2100 },
  { day: 'Wed', val: 1980, lastWeek: 2200 },
  { day: 'Thu', val: 2650, lastWeek: 2400 },
  { day: 'Fri', val: 3100, lastWeek: 2800 },
  { day: 'Sat', val: 2847, lastWeek: 2400 },
  { day: 'Sun', val: 1400, lastWeek: 1320 },
]
const MAX_VAL = 3100
const MAX_H = 160

export function RevenueChartComp() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const lastWeekAvg = BARS.reduce((s, b) => s + b.lastWeek, 0) / BARS.length
  const refLineY = (1 - lastWeekAvg / MAX_VAL) * MAX_H

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>
        Revenue this week
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        <div style={{ position: 'relative', height: MAX_H + 28, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          {/* Last-week reference line */}
          <div style={{ position: 'absolute', left: 0, right: 0, top: refLineY, borderTop: '1px dashed rgba(127,184,151,0.3)', pointerEvents: 'none' }} />
          <span style={{ position: 'absolute', right: 0, top: refLineY - 14, fontSize: 9, color: 'rgba(127,184,151,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>last wk avg</span>

          {BARS.map((bar, i) => {
            const sp = spring({ frame: frame - i * 5, fps, config: { damping: 18, stiffness: 120 } })
            const barH = sp * (bar.val / MAX_VAL) * MAX_H
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: '100%',
                  height: barH,
                  borderRadius: '4px 4px 0 0',
                  background: 'linear-gradient(to top, #2D5240, #7FB897)',
                  boxShadow: '0 0 8px rgba(127,184,151,0.25)',
                  transition: 'none',
                }} />
                <span style={{ fontSize: 10, color: 'rgba(155,168,160,0.7)', fontFamily: "'JetBrains Mono', monospace" }}>{bar.day}</span>
              </div>
            )
          })}
        </div>
      </div>
    </AbsoluteFill>
  )
}
