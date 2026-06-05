'use client'

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0d1117', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', padding: 24,
    }}>
      <div style={{ fontSize: 56, marginBottom: 24 }}>📡</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f0f0f4', marginBottom: 12, textAlign: 'center' }}>
        You&apos;re offline
      </h1>
      <p style={{ fontSize: 15, color: '#7FB897', textAlign: 'center', maxWidth: 360, lineHeight: 1.6, marginBottom: 8 }}>
        Aria needs a connection for live business data.
      </p>
      <p style={{ fontSize: 14, color: '#6b7280', textAlign: 'center', maxWidth: 360, lineHeight: 1.6, marginBottom: 32 }}>
        Reconnect to the internet to continue using your dashboard, POS, and AI features.
      </p>
      <button
        onClick={() => location.reload()}
        style={{
          background: '#7FB897', color: '#0d1117', border: 'none', borderRadius: 10,
          padding: '12px 28px', fontSize: 15, fontWeight: 600, cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  )
}
