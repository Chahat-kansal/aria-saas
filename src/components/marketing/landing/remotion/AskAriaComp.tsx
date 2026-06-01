'use client'
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion'

const QA = [
  { q: "How's my revenue?", a: "Up 18% — $2,847 so far. Acai Bowl is leading." },
  { q: "Any risks?", a: "3 items: low oat milk, BAS due, competitor undercut." },
  { q: "How to increase profit?", a: "Bundle Flat White + food. Raise Acai Bowl $1." },
]
const CYCLE = 180

function typeText(text: string, frame: number, startFrame: number, endFrame: number): string {
  const progress = interpolate(frame, [startFrame, endFrame], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return text.slice(0, Math.floor(progress * text.length))
}

export function AskAriaComp() {
  const frame = useCurrentFrame()
  const cycleIdx = Math.floor(frame / CYCLE) % QA.length
  const cycleFrame = frame % CYCLE
  const { q, a } = QA[cycleIdx]

  const qText = typeText(q, cycleFrame, 0, 40)
  const aText = typeText(a, cycleFrame, 45, 160)
  const qOpacity = interpolate(cycleFrame, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const aOpacity = interpolate(cycleFrame, [44, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 24, opacity: 0.8 }}>
        Ask Aria
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        {/* User question bubble */}
        <div style={{ opacity: qOpacity, alignSelf: 'flex-end', maxWidth: '80%', background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: '14px 14px 4px 14px', padding: '11px 14px', fontSize: 13, color: '#e8ede9', lineHeight: 1.45 }}>
          {qText}<span style={{ opacity: cycleFrame < 40 && qText.length < q.length ? 1 : 0 }}>|</span>
        </div>
        {/* Aria answer bubble */}
        <div style={{ opacity: aOpacity, alignSelf: 'flex-start', maxWidth: '85%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px 14px 14px 14px', padding: '11px 14px' }}>
          <div style={{ fontSize: 10, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>Aria</div>
          <div style={{ fontSize: 13, color: '#cdd6cf', lineHeight: 1.5 }}>
            {aText}<span style={{ opacity: cycleFrame >= 45 && aText.length < a.length ? 1 : 0 }}>|</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  )
}
