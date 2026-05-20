'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Integration { id: string; name: string; description: string; icon: string; status: string; account?: string | null; setup_url: string | null }

function XeroSyncButton() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [date, setDate] = useState(() => new Date(Date.now() - 86400000).toISOString().split('T')[0])

  async function sync() {
    setSyncing(true)
    setResult(null)
    try {
      const res = await fetch('/api/pos/xero-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      const d = await res.json() as { ok?: boolean; message?: string; error?: string; hint?: string; synced?: number }
      setResult(d.ok ? `✅ ${d.message}` : `❌ ${d.error}${d.hint ? '\n💡 ' + d.hint : ''}`)
    } catch (e) { setResult('❌ Network error') }
    setSyncing(false)
  }

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 10, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Push sales to Xero</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--divider)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit' }} />
        <button onClick={sync} disabled={syncing}
          style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: '#22C55E', color: '#fff', fontSize: 12, fontWeight: 700, cursor: syncing ? 'wait' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          {syncing ? 'Syncing…' : 'Sync day'}
        </button>
      </div>
      {result && <pre style={{ marginTop: 8, fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{result}</pre>}
    </div>
  )
}

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
                {intg.id === 'xero' && intg.status === 'connected' && <XeroSyncButton />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}