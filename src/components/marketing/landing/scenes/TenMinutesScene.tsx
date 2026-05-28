const STEPS = [
  { title: 'Connect your business', body: 'Add your details — or connect Square or Shopify in a tap.' },
  { title: 'Aria learns your business', body: 'It reads your sales, stock and customers overnight.' },
  { title: 'Get your first briefing', body: 'Wake up to your first daily briefing tomorrow morning.' },
]

export default function TenMinutesScene() {
  return (
    <>
      <div className="scene-label" style={{ textAlign: 'center' }}>Getting started</div>
      <h2 style={{ textAlign: 'center' }}>Up and running in <em>10 minutes</em></h2>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem',
        width: '100%', maxWidth: 900, marginInline: 'auto', marginTop: '2rem',
      }}>
        {STEPS.map((s, i) => (
          <div key={s.title} style={{ textAlign: 'center', animation: `l-cardUp 700ms cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.12}s both` }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 1rem',
              background: '#7FB897', color: '#0a0a0f', fontSize: '1.4rem', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 0 6px rgba(127,184,151,0.12)',
            }}>{i + 1}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', marginBottom: '0.4rem' }}>{s.title}</div>
            <div style={{ fontSize: '0.9rem', color: '#9BA8A0', lineHeight: 1.5, maxWidth: 240, marginInline: 'auto' }}>{s.body}</div>
          </div>
        ))}
      </div>
    </>
  )
}
