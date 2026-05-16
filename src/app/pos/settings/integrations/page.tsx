'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Integration { id: string; name: string; description: string; icon: string; status: string; account?: string | null; setup_url: string | null }

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  configured:     { label: 'Configured', color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  connected:      { label: 'Connected',  color: '#22c55e', bg: 'rgba(34,197,94,0.12)' },
  not_configured: { label: 'Not set up', color: '#94a3b8', bg: 'var(--bg-base)' },
  not_connected:  { label: 'Not connected', color: '#94a3b8', bg: 'var(--bg-base)' },
  coming_soon:    { label: 'Coming soon', color: '#F59E0B', bg: 'rgba(245,158,11,0.10)' },
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pos/integrations-status').then(r => r.json()).then(d => { setIntegrations(d.integrations ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: '24px 28px', maxWidth: 760, color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Integrations</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>Connect Aria with your payment processors, accounting tools, and social media platforms.</p>

      {loading ? <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 14 }}>
          {integrations.map(intg => {
            const s = STATUS_STYLE[intg.status] ?? STATUS_STYLE.not_configured
            return (
              <div key={intg.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ fontSize: 28 }}>{intg.icon}</span>
                  <span style={{ fontSize: 11, padding: '3px 9px', borderRadius: 99, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{intg.name}</div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>{intg.description}</p>
                {intg.account && <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 12px' }}>Account: {intg.account}</p>}
                {intg.setup_url && intg.status !== 'coming_soon' && (
                  <Link href={intg.setup_url} style={{ display: 'inline-block', padding: '6px 16px', borderRadius: 8, border: '1px solid var(--violet)', background: intg.status.includes('not') ? 'var(--violet)' : 'transparent', color: intg.status.includes('not') ? '#fff' : 'var(--violet)', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                    {intg.status.includes('not') ? 'Connect' : 'Manage'}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}