'use client'
import React, { useState, useEffect } from 'react'

const ITEMS = [
  { name: 'Flat White', mod: 'Large · Oat milk', price: '$6.50' },
  { name: 'Acai Bowl', mod: '+ Granola · + Honey', price: '$18.00' },
  { name: 'Banana Bread', mod: 'Toasted · Butter', price: '$7.50' },
]

export function POSCheckoutComp() {
  const [cycle, setCycle] = useState(0)
  const [showPay, setShowPay] = useState(false)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    setShowPay(false)
    setPaid(false)
    const t1 = setTimeout(() => setShowPay(true), 1600)
    const t2 = setTimeout(() => setPaid(true), 3200)
    const t3 = setTimeout(() => {
      setShowPay(false)
      setPaid(false)
      setTimeout(() => setCycle(c => c + 1), 100)
    }, 5500)
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [cycle])

  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '18px', display: 'flex', gap: 12, height: '100%', borderRadius: 16 }}>
      <style>{`
        @keyframes slideUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes flashGreen { 0%{background:#7FB897} 100%{background:#5a9e73} }
      `}</style>
      <div key={cycle} style={{ flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
          Order #2841 · Table 4
        </div>
        {ITEMS.map((item, i) => (
          <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, animation: `slideUp 0.35s ease ${0.12 + i * 0.14}s both` }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#e8ede9' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: '#9BA8A0' }}>{item.mod}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#7FB897' }}>{item.price}</div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 4, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          <span>GST incl.</span><span>$2.91</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 9, color: '#7FB897', background: 'rgba(127,184,151,0.08)', padding: '4px 8px', borderRadius: 6, fontFamily: "'JetBrains Mono',monospace", display: 'inline-block' }}>
          Emma K. · 847 loyalty pts
        </div>
      </div>
      <div style={{ width: 120, background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>Total</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>$32.00</div>
        </div>
        <div style={{ fontSize: 9, color: '#7FB897', background: 'rgba(127,184,151,0.1)', padding: '3px 7px', borderRadius: 5, fontFamily: "'JetBrains Mono',monospace" }}>+32 pts</div>
        {showPay && !paid && (
          <div style={{ background: '#7FB897', color: '#0E1411', borderRadius: 7, padding: '9px 8px', fontSize: 12, fontWeight: 700, textAlign: 'center', animation: 'popIn 0.3s ease', cursor: 'pointer' }}>Pay →</div>
        )}
        {paid && (
          <div style={{ background: '#5a9e73', color: '#fff', borderRadius: 7, padding: '9px 8px', fontSize: 12, fontWeight: 700, textAlign: 'center', animation: 'popIn 0.2s ease' }}>✓ Paid</div>
        )}
      </div>
    </div>
  )
}
