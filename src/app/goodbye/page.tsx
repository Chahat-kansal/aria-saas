export default function GoodbyePage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0E1611', color: '#F5F3EC', fontFamily: "system-ui,-apple-system,sans-serif", textAlign: 'center', padding: '32px' }}>
      <p style={{ fontFamily: 'Georgia,serif', fontStyle: 'italic', fontSize: 22, color: '#7FB897', marginBottom: 16 }}>Aria OS</p>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>Your account has been deleted.</h1>
      <p style={{ fontSize: 16, color: '#9ca3af', marginBottom: 32 }}>Thank you for using Aria OS. All your data has been permanently removed.</p>
      <a href="https://ariaos.site" style={{ color: '#7FB897', fontSize: 14, textDecoration: 'none', borderBottom: '1px solid rgba(127,184,151,0.4)' }}>
        Return to ariaos.site
      </a>
    </div>
  )
}
