'use client'
import React, { useState, useEffect } from 'react'

const STEPS = [
  { num: '1', title: "Emma K. hasn't visited in 68 days", sub: 'Last order: Acai Bowl + Oat Latte · $24.50 · loyalty member', tag: 'At risk', tagColor: '#f09595', tagBg: 'rgba(248,113,113,0.12)' },
  { num: '2', title: 'Aria drafts a personalised win-back', sub: `"Hey Emma! Your fave Acai Bowl is waiting — here's 15% off just for you this week 🌿"`, tag: 'AI drafted', tagColor: '#85b7eb', tagBg: 'rgba(96,165,250,0.12)' },
  { num: '3', title: 'You approve in one tap → SMS sent', sub: 'Emma returned 3 days later · spent $28.50 · loyalty streak restarted', tag: 'Returned ✓', tagColor: '#7FB897', tagBg: 'rgba(127,184,151,0.12)' },
]

export function WinbackComp() {
  const [cycle, setCycle] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setCycle(c => c + 1), 5500)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', borderRadius: 16 }}>
      <style>{`@keyframes slideInX { from { opacity:0; transform:translateX(-14px); } to { opacity:1; transform:translateX(0); } }`}</style>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 6, opacity: 0.8 }}>Customer Win-back</div>
      <div key={cycle} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {STEPS.map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, animation: `slideInX 0.45s ease ${0.1 + i * 0.35}s both` }}>
            <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7FB897', fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{step.num}</div>
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '11px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ede9', marginBottom: 4 }}>{step.title}</div>
              <div style={{ fontSize: 10, color: '#9BA8A0', lineHeight: 1.5, marginBottom: 8 }}>{step.sub}</div>
              <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: step.tagBg, color: step.tagColor, fontFamily: "'JetBrains Mono',monospace" }}>{step.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
