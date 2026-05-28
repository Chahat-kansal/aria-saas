const CHECKS = [
  'Barcode scanning + product search',
  'Cash, card and split payments',
  'Loyalty points built in',
  'Age verification for liquor',
  'Receipt email + print',
  'Real-time stock updates',
  'Offline mode',
]

const RECEIPT = [
  { name: 'Flat white', price: '4.50' },
  { name: 'Sourdough loaf', price: '7.00' },
  { name: 'Free-range eggs ×6', price: '5.50' },
]

export default function SmartPOSScene() {
  const total = RECEIPT.reduce((n, r) => n + parseFloat(r.price), 0).toFixed(2)
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>POS</div>
      <h2 style={{ textAlign: 'center' }}>The only POS that gets <em>smarter every day</em></h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem',
        width: '100%', maxWidth: 900, marginInline: 'auto', marginTop: '2rem', alignItems: 'center',
      }}>
        {/* Checklist */}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
          {CHECKS.map(c => (
            <li key={c} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', fontSize: '0.95rem', color: '#cdd6cf' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(127,184,151,0.15)', border: '1px solid rgba(127,184,151,0.4)', color: '#7FB897', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>✓</span>
              {c}
            </li>
          ))}
        </ul>
        {/* Receipt mockup */}
        <div style={{ background: '#13131a', border: '1px solid rgba(127,184,151,0.18)', borderRadius: 16, padding: '1.25rem', maxWidth: 320, width: '100%', marginInline: 'auto' }}>
          <div style={{ fontSize: '0.7rem', color: '#9BA8A0', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'center', marginBottom: '0.9rem' }}>Sip · Receipt</div>
          {RECEIPT.map(r => (
            <div key={r.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: '#cdd6cf', padding: '0.4rem 0', borderBottom: '1px dashed rgba(255,255,255,0.08)' }}>
              <span>{r.name}</span><span>${r.price}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', fontWeight: 700, color: '#fff', margin: '0.8rem 0 1rem' }}>
            <span>Total</span><span>${total}</span>
          </div>
          <button style={{ width: '100%', padding: '0.8rem', borderRadius: 10, border: 'none', background: '#7FB897', color: '#0a0a0f', fontSize: '0.95rem', fontWeight: 700 }}>Card</button>
        </div>
      </div>
    </>
  )
}
