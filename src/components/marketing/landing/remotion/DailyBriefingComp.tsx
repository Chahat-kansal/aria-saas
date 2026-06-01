'use client'
import React, { useState, useEffect, useRef } from 'react'

const LINES = [
  { text: 'Revenue up 18% — $2,847 so far today', accent: '#7FB897' },
  { text: 'Acai Bowl is your #1 product this week', accent: '#D4A95E' },
  { text: 'Oat milk critically low — 2 bags left', accent: '#60A5FA' },
  { text: 'BAS due in 14 days — $4,320 set aside', accent: '#F87171' },
]

export function DailyBriefingComp() {
  const [cycle, setCycle] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Restart animation every 5 seconds so it loops
  useEffect(() => {
    const t = setInterval(() => setCycle(c => c + 1), 5000)
    return () => clearInterval(t)
  }, [])

  return (
    <div ref={ref} style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <style>{`
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeInUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>Morning Briefing</div>
      <div key={cycle} style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {LINES.map((line, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, animation: `slideInLeft 0.45s ease ${0.15 + i * 0.18}s both` }}>
            <div style={{ width: 3, height: 36, borderRadius: 2, background: line.accent, flexShrink: 0 }} />
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e8ede9', lineHeight: 1.4 }}>{line.text}</div>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: 'rgba(127,184,151,0.07)', border: '1px solid rgba(127,184,151,0.18)', borderRadius: 10, padding: '10px 14px', marginTop: 6, animation: 'fadeInUp 0.4s ease 0.9s both' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7FB897,#2D5240)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>A</div>
          <div style={{ fontSize: 12, color: 'rgba(155,168,160,0.85)', lineHeight: 1.5 }}>Focus on BAS and the 3 win-back messages today. Tuesday is tracking above last week.</div>
        </div>
      </div>
    </div>
  )
}
