'use client'
import React from 'react'

const ITEMS = [
  { name: 'Flat White', mod: 'Large · Oat milk', price: '$6.50', delay: '0.2s' },
  { name: 'Acai Bowl', mod: '+ Granola · + Honey', price: '$18.00', delay: '0.5s' },
  { name: 'Banana Bread', mod: 'Toasted · Butter', price: '$7.50', delay: '0.8s' },
]

export function POSCheckoutComp() {
  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '20px', display: 'flex', gap: 14, height: '100%', borderRadius: 16 }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { from { opacity:0; transform:scale(0.88); } to { opacity:1; transform:scale(1); } }
        .pos-item { background:rgba(255,255,255,0.05); border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:7px; animation:slideUp 0.4s ease both; }
        .pos-pay { background:#7FB897; color:#0E1411; border:none; border-radius:8px; padding:10px; font-size:13px; font-weight:700; text-align:center; animation:popIn 0.35s ease 1.8s both; opacity:0; }
      `}</style>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
          Order #2841 · Table 4
        </div>
        {ITEMS.map((item, i) => (
          <div key={i} className="pos-item" style={{ animationDelay: item.delay }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#e8ede9' }}>{item.name}</div>
              <div style={{ fontSize: 10, color: '#9BA8A0' }}>{item.mod}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#7FB897' }}>{item.price}</div>
          </div>
        ))}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 4, paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          <span>GST included</span><span>$2.91</span>
        </div>
      </div>
      <div style={{ width: 130, background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em' }}>$32.00</div>
        </div>
        <div style={{ fontSize: 9, color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '4px 8px', borderRadius: 6, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace" }}>+32 loyalty pts</div>
        <div className="pos-pay">Pay now →</div>
      </div>
    </div>
  )
}
