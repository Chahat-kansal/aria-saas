'use client'
import React, { useState, useEffect, useCallback } from 'react'

const QA = [
  {
    label: '📈 Revenue?',
    q: "How's my revenue this week?",
    a: "You're at $2,847 by Tuesday — up 18% on last week. Friday is still your biggest day ($3,100 average). At this pace you'll hit $6,400 for the week. Acai Bowl alone is responsible for 31% of that.",
    chips: ['↑ 18% vs last week', '$6,400 projected', 'Fri = peak day'],
    chipColors: ['#7FB897', '#85b7eb', '#fbbf24'],
  },
  {
    label: '⚠️ Any risks?',
    q: "Any risks I need to act on today?",
    a: "Three things: (1) Oat milk has 2 bags left — you'll run out by Thursday based on usage. (2) BAS is due in 14 days — $4,320 set aside so far, need $1,200 more. (3) Bench Coffee on Chapel St dropped their flat white to $5.50 — you're at $6.00.",
    chips: ['Stock out Thu', 'BAS gap $1.2k', 'Competitor -$0.50'],
    chipColors: ['#f09595', '#f59e0b', '#f59e0b'],
  },
  {
    label: '👥 Win-backs?',
    q: "Who should I try to win back?",
    a: "Emma K. spent $847 with you in 6 months but hasn't been in since April 25th — 38 days. Marcus T. and Sarah L. are also lapsing. I've drafted personalised SMS messages for all three. Combined lifetime value: $2,100.",
    chips: ['3 lapsed regulars', '$2,100 at stake', 'SMS drafts ready'],
    chipColors: ['#f09595', '#fbbf24', '#7FB897'],
  },
  {
    label: '💡 Profit?',
    q: "Where's my biggest profit leak?",
    a: "Your coffee COGS went up 12% last month but you haven't adjusted prices. Acai Bowl has a 74% margin — you could charge $19 instead of $18, matching Prahran Market. That's +$340/week at current volume.",
    chips: ['Coffee COGS +12%', 'Acai Bowl gap $1', '+$340/wk possible'],
    chipColors: ['#f09595', '#fbbf24', '#7FB897'],
  },
]

export function AskAriaComp() {
  const [activeIdx, setActiveIdx] = useState(0)
  const [displayA, setDisplayA] = useState('')
  const [showChips, setShowChips] = useState(false)
  const [typing, setTyping] = useState(false)
  const [animKey, setAnimKey] = useState(0)

  const startAnswer = useCallback((idx: number) => {
    const qa = QA[idx]
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
        setTimeout(() => setShowChips(true), 250)
      }
    }, 14)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const cleanup = startAnswer(activeIdx)
    return cleanup
  }, [activeIdx, animKey, startAnswer])

  // Auto-cycle through questions every 9s
  useEffect(() => {
    const t = setInterval(() => {
      setActiveIdx(prev => (prev + 1) % QA.length)
    }, 9000)
    return () => clearInterval(t)
  }, [])

  const qa = QA[activeIdx]

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '18px 22px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16, gap: 12 }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes chipIn { from{opacity:0;transform:scale(0.88)} to{opacity:1;transform:scale(1)} }
        .qa-tab { font-size:11px; padding:5px 11px; border-radius:99px; cursor:pointer; font-family:'Outfit',system-ui; transition:all 0.18s; white-space:nowrap; }
        .qa-tab:hover { opacity:0.9; }
      `}</style>

      {/* Question tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {QA.map((item, i) => (
          <button key={i} className="qa-tab"
            onClick={() => { setActiveIdx(i); setAnimKey(k => k + 1) }}
            style={{
              border: `1px solid ${i === activeIdx ? 'rgba(127,184,151,0.5)' : 'rgba(255,255,255,0.1)'}`,
              background: i === activeIdx ? 'rgba(127,184,151,0.18)' : 'rgba(255,255,255,0.04)',
              color: i === activeIdx ? '#7FB897' : 'rgba(255,255,255,0.45)',
              fontWeight: i === activeIdx ? 500 : 400,
            }}>
            {item.label}
          </button>
        ))}
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'hidden' }}>
        {/* User bubble */}
        <div key={`q-${activeIdx}`} style={{
          alignSelf: 'flex-end', maxWidth: '78%',
          background: 'rgba(127,184,151,0.12)', border: '1px solid rgba(127,184,151,0.22)',
          borderRadius: '14px 14px 4px 14px', padding: '10px 13px',
          fontSize: 12, color: '#e8ede9', lineHeight: 1.5,
          animation: 'fadeUp 0.22s ease',
        }}>
          {qa.q}
        </div>

        {/* Aria bubble */}
        <div style={{
          alignSelf: 'flex-start', maxWidth: '90%',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
          borderRadius: '4px 14px 14px 14px', padding: '10px 13px',
        }}>
          <div style={{ fontSize: 9, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 15, height: 15, borderRadius: '50%', background: 'linear-gradient(135deg,#7FB897,#2D5240)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>A</div>
            Aria
          </div>
          <div style={{ fontSize: 12, color: '#cdd6cf', lineHeight: 1.6, minHeight: 44 }}>
            {displayA}
            {typing && <span style={{ borderRight: '2px solid rgba(127,184,151,0.8)', marginLeft: 1 }}>&nbsp;</span>}
          </div>
        </div>

        {/* Data chips */}
        {showChips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {qa.chips.map((chip, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 600, padding: '3px 9px', borderRadius: 99,
                background: qa.chipColors[i] + '18', color: qa.chipColors[i],
                fontFamily: "'JetBrains Mono',monospace",
                animation: `chipIn 0.2s ease ${i * 0.07}s both`,
              }}>{chip}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
