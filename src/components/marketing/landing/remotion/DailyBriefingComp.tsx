'use client'
import React from 'react'

const LINES = [
  { text: 'Revenue up 18% — $2,847 so far today', accent: '#7FB897', delay: '0.3s' },
  { text: 'Acai Bowl is your top product this week', accent: '#D4A95E', delay: '0.7s' },
  { text: 'Low oat milk stock — 2 units remaining', accent: '#60A5FA', delay: '1.1s' },
  { text: 'BAS due in 14 days — $4,320 set aside', accent: '#F87171', delay: '1.5s' },
]

export function DailyBriefingComp() {
  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <style>{`
        @keyframes slideInLeft { from { opacity:0; transform:translateX(-16px); } to { opacity:1; transform:translateX(0); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .bf-line { display:flex; align-items:center; gap:12px; animation:slideInLeft 0.5s ease both; }
        .bf-aria { display:flex; align-items:center; gap:10px; background:rgba(127,184,151,0.07); border:1px solid rgba(127,184,151,0.18); border-radius:10px; padding:10px 14px; margin-top:16px; animation:fadeIn 0.5s ease 2.2s both; opacity:0; }
      `}</style>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 20, opacity: 0.8 }}>Morning Briefing</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {LINES.map((line, i) => (
          <div key={i} className="bf-line" style={{ animationDelay: line.delay }}>
            <div style={{ width: 3, height: 36, borderRadius: 2, background: line.accent, flexShrink: 0 }} />
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '10px 14px', flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e8ede9', lineHeight: 1.4 }}>{line.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="bf-aria">
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7FB897,#2D5240)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>A</div>
        <div style={{ fontSize: 12, color: 'rgba(155,168,160,0.85)', lineHeight: 1.5 }}>Focus on BAS and win-back messages today. Everything else is running well.</div>
      </div>
    </div>
  )
}
