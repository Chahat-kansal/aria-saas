'use client'

const STEPS = [
  { num: '1', title: "Emma K. hasn't visited in 68 days", sub: 'Last order: Acai Bowl + Oat Latte · $24.50', tag: 'At risk', tagColor: '#f09595', tagBg: 'rgba(248,113,113,0.12)', delay: 0.2 },
  { num: '2', title: 'Aria drafts a personalised message', sub: '"Hey Emma, we miss you! Your Acai Bowl is waiting — 15% off this week 🌿"', tag: 'AI drafted', tagColor: '#85b7eb', tagBg: 'rgba(96,165,250,0.12)', delay: 0.8 },
  { num: '3', title: 'You approve → sent via SMS', sub: 'Emma visited 3 days later · $28.50 spent', tag: 'Returned ✓', tagColor: '#7FB897', tagBg: 'rgba(127,184,151,0.12)', delay: 1.5 },
]

const style = `
@keyframes slideInX {
  from { opacity: 0; transform: translateX(-12px); }
  to { opacity: 1; transform: translateX(0); }
}
`

export function WinbackComp() {
  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 10, height: '100%', borderRadius: 16 }}>
      <style>{style}</style>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 10, opacity: 0.8 }}>Customer Win-back</div>
      {STEPS.map((step, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, animation: `slideInX 0.5s ease ${step.delay}s both` }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#7FB897', fontWeight: 600, flexShrink: 0, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{step.num}</div>
          <div style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e8ede9', marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: 10, color: '#9BA8A0', lineHeight: 1.5, marginBottom: 8 }}>{step.sub}</div>
            <span style={{ fontSize: 9, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: step.tagBg, color: step.tagColor, fontFamily: "'JetBrains Mono', monospace" }}>{step.tag}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
