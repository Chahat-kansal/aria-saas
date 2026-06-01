'use client'
import { useState, useEffect } from 'react'

const QA = [
  {
    label: '📈 Revenue?',
    q: "How's my revenue this week?",
    a: "Up 18% on last week — $2,847 so far. Tuesday was your strongest day. Acai Bowl is your top earner. At this pace you'll finish around $4,200 — your best week this month.",
    chips: ['↑ 18% week-on-week', '$4,200 projected', 'Acai Bowl leading'],
    chipColors: ['#7FB897', '#85b7eb', '#fbbf24'],
  },
  {
    label: '👥 Top customers?',
    q: "Who are my top customers?",
    a: "Your top 5 regulars represent 12% of total revenue. Emma K. is your highest spender but hasn't visited in 68 days — I've drafted a win-back message ready for your approval.",
    chips: ['Top 5 = 12% revenue', 'Emma K. at risk', 'Win-back drafted'],
    chipColors: ['#7FB897', '#f09595', '#85b7eb'],
  },
  {
    label: '⚠️ Any risks?',
    q: "Any risks I should know about?",
    a: "3 things need attention: oat milk is critically low (2 units), BAS is due in 14 days, and Bench Coffee just dropped their flat white below yours.",
    chips: ['3 active risks', 'Stock critical', 'BAS due soon'],
    chipColors: ['#f09595', '#f59e0b', '#f59e0b'],
  },
  {
    label: '💡 Increase profit?',
    q: "How can I increase profit?",
    a: "Biggest opportunity: bundle Flat White + food item. Cafés using bundle pricing see 15–22% higher ticket sizes. Also, Acai Bowl can absorb a $1 price rise — competitors charge $19.50.",
    chips: ['+$340/week possible', 'Bundle pricing', '3 margin leaks'],
    chipColors: ['#7FB897', '#85b7eb', '#f59e0b'],
  },
]

const STYLE = `
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes chipIn {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: scale(1); }
}
`

export function AskAriaComp() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [displayA, setDisplayA] = useState('')
  const [showChips, setShowChips] = useState(false)
  const [typing, setTyping] = useState(false)
  const [key, setKey] = useState(0)

  useEffect(() => {
    const qa = QA[activeIdx]
    setDisplayA('')
    setShowChips(false)
    setTyping(true)

    let i = 0
    const timer = setInterval(() => {
      i++
      setDisplayA(qa.a.slice(0, i))
      if (i >= qa.a.length) {
        clearInterval(timer)
        setTyping(false)
        setTimeout(() => setShowChips(true), 200)
      }
    }, 18)
    return () => clearInterval(timer)
  }, [activeIdx, key])

  const qa = QA[activeIdx]

  const selectQ = (idx: number) => {
    setActiveIdx(idx)
    setKey(prev => prev + 1)
  }

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '20px 24px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16, gap: 14 }}>
      <style>{STYLE}</style>

      {/* Question tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {QA.map((item, i) => (
          <button
            key={i}
            onClick={() => selectQ(i)}
            style={{
              fontSize: 11,
              padding: '5px 12px',
              borderRadius: 99,
              border: `1px solid ${i === activeIdx ? 'rgba(127,184,151,0.4)' : 'rgba(255,255,255,0.1)'}`,
              background: i === activeIdx ? 'rgba(127,184,151,0.15)' : 'rgba(255,255,255,0.04)',
              color: i === activeIdx ? '#7FB897' : 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontFamily: "'Outfit', system-ui",
              transition: 'all 0.15s',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* User bubble */}
        <div style={{
          alignSelf: 'flex-end',
          maxWidth: '80%',
          background: 'rgba(127,184,151,0.12)',
          border: '1px solid rgba(127,184,151,0.22)',
          borderRadius: '14px 14px 4px 14px',
          padding: '10px 14px',
          fontSize: 12,
          color: '#e8ede9',
          lineHeight: 1.5,
          animation: 'fadeSlideUp 0.25s ease',
        }}>
          {qa.q}
        </div>

        {/* Aria bubble */}
        <div style={{
          alignSelf: 'flex-start',
          maxWidth: '88%',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px 14px 14px 14px',
          padding: '10px 14px',
          animation: 'fadeSlideUp 0.3s ease 0.1s both',
        }}>
          <div style={{ fontSize: 9, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'linear-gradient(135deg,#7FB897,#2D5240)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>A</div>
            Aria
          </div>
          <div style={{ fontSize: 12, color: '#cdd6cf', lineHeight: 1.6, minHeight: 40 }}>
            {displayA}
            {typing && <span style={{ borderRight: '2px solid rgba(127,184,151,0.7)', marginLeft: 1 }}>&nbsp;</span>}
          </div>
        </div>

        {/* Chips */}
        {showChips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, paddingLeft: 4 }}>
            {qa.chips.map((chip, i) => (
              <span key={i} style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 99,
                background: qa.chipColors[i] + '1a',
                color: qa.chipColors[i],
                fontFamily: "'JetBrains Mono', monospace",
                animation: `chipIn 0.25s ease ${i * 0.08}s both`,
              }}>{chip}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
