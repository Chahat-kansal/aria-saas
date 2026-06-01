'use client'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const LINES = [
  { text: 'Revenue up 18% — $2,847 so far today', accent: '#7FB897' },
  { text: 'Acai Bowl is your top product this week', accent: '#D4A95E' },
  { text: 'Low oat milk stock — 2 bags remaining', accent: '#60A5FA' },
  { text: 'BAS due in 14 days — $4,320 set aside', accent: '#F87171' },
]

export function DailyBriefingComp() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const ariaOpacity = interpolate(frame, [90, 110], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const ariaY = interpolate(frame, [90, 110], [12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>
        Morning Briefing
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {LINES.map((line, i) => {
          const delay = 18 + i * 16
          const sp = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120 } })
          const opacity = interpolate(frame, [delay, delay + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
          const x = interpolate(sp, [0, 1], [-20, 0])
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, opacity, transform: 'translateX(' + x + 'px)' }}>
              <div style={{ width: 3, height: 36, borderRadius: 2, background: line.accent, flexShrink: 0 }} />
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e8ede9', lineHeight: 1.4 }}>{line.text}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ opacity: ariaOpacity, transform: 'translateY(' + ariaY + 'px)', marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(127,184,151,0.07)', border: '1px solid rgba(127,184,151,0.18)', borderRadius: 10, padding: '10px 14px' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg, #7FB897, #2D5240)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>A</div>
        <div style={{ fontSize: 12, color: 'rgba(155,168,160,0.85)', lineHeight: 1.5 }}>Focus on the BAS and the win-back messages today. Everything else is running well.</div>
      </div>
    </AbsoluteFill>
  )
}
