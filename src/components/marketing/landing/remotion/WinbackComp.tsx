'use client'
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion'

const STEPS = [
  { num: '1', title: 'At-risk customer detected', sub: 'Emma has not visited in 68 days', tag: 'At risk', tagColor: '#F87171', tagBg: 'rgba(248,113,113,0.12)' },
  { num: '2', title: 'Aria drafts a win-back', sub: '"Hey Emma, we miss you! Free coffee on us this week."', tag: 'AI drafted', tagColor: '#60A5FA', tagBg: 'rgba(96,165,250,0.12)' },
  { num: '3', title: 'Emma returns', sub: 'Spent $24.50 — loyalty streak restarted', tag: 'Returned', tagColor: '#7FB897', tagBg: 'rgba(127,184,151,0.12)' },
]

export function WinbackComp() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>
        Win-back Flow
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {STEPS.map((step, i) => {
          const delay = 10 + i * 30
          const sp = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 110 } })
          const opacity = interpolate(sp, [0, 1], [0, 1])
          const x = interpolate(sp, [0, 1], [-24, 0])
          return (
            <div key={i} style={{ opacity, transform: 'translateX(' + x + 'px)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#7FB897', flexShrink: 0, marginTop: 2 }}>
                {step.num}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#e8ede9' }}>{step.title}</span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: step.tagBg, color: step.tagColor, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{step.tag}</span>
                </div>
                <div style={{ fontSize: 12, color: '#9BA8A0', lineHeight: 1.45 }}>{step.sub}</div>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}
