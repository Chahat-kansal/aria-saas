'use client'
import { useEffect, useState } from 'react'

const QA = [
  { q: "How's my revenue?", a: "Up 18% — $2,847 so far. Acai Bowl is leading. Best week this month." },
  { q: "Any risks I should know?", a: "3 items: oat milk critically low, BAS due 14 days, competitor undercut flat white." },
  { q: "How to increase profit?", a: "Bundle Flat White + food. Cafés using bundles see 15-22% higher ticket sizes." },
]

const style = `
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
`

export function AskAriaComp() {
  const [phase, setPhase] = useState(0)
  const [qIdx, setQIdx] = useState(0)
  const [displayQ, setDisplayQ] = useState('')
  const [displayA, setDisplayA] = useState('')
  const [showA, setShowA] = useState(false)

  useEffect(() => {
    const qa = QA[qIdx]
    setDisplayQ('')
    setDisplayA('')
    setShowA(false)

    // Type question
    let qi = 0
    const qTimer = setInterval(() => {
      qi++
      setDisplayQ(qa.q.slice(0, qi))
      if (qi >= qa.q.length) {
        clearInterval(qTimer)
        // Pause then show answer
        setTimeout(() => {
          setShowA(true)
          let ai = 0
          const aTimer = setInterval(() => {
            ai++
            setDisplayA(qa.a.slice(0, ai))
            if (ai >= qa.a.length) {
              clearInterval(aTimer)
              // Pause then next question
              setTimeout(() => {
                setQIdx(prev => (prev + 1) % QA.length)
              }, 2500)
            }
          }, 22)
        }, 600)
      }
    }, 38)

    return () => clearInterval(qTimer)
  }, [qIdx])

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '28px 32px', display: 'flex', flexDirection: 'column', height: '100%', borderRadius: 16 }}>
      <style>{style}</style>
      <div style={{ fontSize: 11, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: 24, opacity: 0.8 }}>Ask Aria</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
        <div style={{ alignSelf: 'flex-end', maxWidth: '80%', background: 'rgba(127,184,151,0.1)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: '14px 14px 4px 14px', padding: '11px 14px', fontSize: 13, color: '#e8ede9', lineHeight: 1.45, minHeight: 44 }}>
          {displayQ}<span style={{ opacity: displayQ.length < QA[qIdx].q.length ? 1 : 0, borderRight: '2px solid #7FB897' }}>&nbsp;</span>
        </div>
        {showA && (
          <div style={{ alignSelf: 'flex-start', maxWidth: '85%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px 14px 14px 14px', padding: '11px 14px', animation: 'fadeSlideUp 0.3s ease' }}>
            <div style={{ fontSize: 10, color: '#7FB897', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 6 }}>Aria</div>
            <div style={{ fontSize: 13, color: '#cdd6cf', lineHeight: 1.5 }}>
              {displayA}<span style={{ opacity: displayA.length < QA[qIdx].a.length ? 1 : 0, borderRight: '2px solid rgba(127,184,151,0.6)' }}>&nbsp;</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
