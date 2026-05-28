const INDUSTRIES = ['Café', 'Bakery', 'Liquor', 'Retail', 'Restaurant', 'Hospitality']

export default function AustraliaWideScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Industries</div>
      <h2 style={{ textAlign: 'center' }}>Built for <em>Australian retail</em> and hospitality</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.7rem', justifyContent: 'center', maxWidth: 640, marginInline: 'auto', marginTop: '1.75rem' }}>
        {INDUSTRIES.map(label => (
          <span key={label} style={{
            padding: '0.6rem 1.2rem', borderRadius: 999, fontSize: '0.95rem', color: '#cdd6cf',
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(127,184,151,0.25)',
          }}>{label}</span>
        ))}
      </div>
      <div style={{
        marginTop: '2rem', marginInline: 'auto', maxWidth: 460, textAlign: 'center',
        background: '#1A2620', border: '1px solid rgba(127,184,151,0.18)', borderRadius: 16, padding: '1.5rem 1.4rem',
      }}>
        <div style={{ fontSize: '0.95rem', color: '#cdd6cf', lineHeight: 1.5 }}>
          Trusted by Australian small business — from corner cafés to bottle shops, built and run in Melbourne.
        </div>
      </div>
    </>
  )
}
