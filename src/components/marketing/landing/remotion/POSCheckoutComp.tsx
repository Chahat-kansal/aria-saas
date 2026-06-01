'use client'

const ITEMS = [
  { name: 'Flat White', mod: 'Large · Oat milk', price: '$6.50', delay: 0.2 },
  { name: 'Acai Bowl', mod: '+ Granola · + Honey', price: '$18.00', delay: 0.5 },
  { name: 'Banana Bread', mod: 'Toasted · Butter', price: '$7.50', delay: 0.8 },
]

const style = `
@keyframes slideUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes countUp {
  from { opacity: 0; } to { opacity: 1; }
}
@keyframes popIn {
  from { opacity: 0; transform: scale(0.88); }
  to { opacity: 1; transform: scale(1); }
}
`

export function POSCheckoutComp() {
  return (
    <div style={{ background: '#0E1411', fontFamily: "'Outfit', system-ui, sans-serif", padding: '20px', display: 'flex', gap: 14, height: '100%', borderRadius: 16 }}>
      <style>{style}</style>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 10 }}>
          Order #2841 · Table 4
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {ITEMS.map((item, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', animation: `slideUp 0.4s ease ${item.delay}s both` }}>
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
      </div>
      <div style={{ width: 130, background: 'rgba(0,0,0,0.3)', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: '#fff', letterSpacing: '-0.02em', animation: 'countUp 0.4s ease 1.2s both' }}>$32.00</div>
        </div>
        <div style={{ fontSize: 9, color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '4px 8px', borderRadius: 6, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace' }}>+32 loyalty pts</div>
        <div style={{ background: '#7FB897', color: '#0E1411', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 700, textAlign: 'center', animation: 'popIn 0.35s ease 1.8s both', opacity: 0 }}>Pay now →</div>
      </div>
    </div>
  )
}
