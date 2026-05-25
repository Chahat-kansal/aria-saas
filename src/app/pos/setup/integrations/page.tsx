'use client'
import { useState, useEffect } from 'react'
import { INTEGRATIONS, OFFICIAL, APPROVED } from '@/lib/integrations/directory'
import type { Integration, IntegrationKey } from '@/lib/integrations/types'

interface Connected {
  integration_key: IntegrationKey
  status: string
  external_account_name: string | null
  last_sync_at: string | null
  last_error: string | null
}

const V = 'var(--violet)'

function IntegrationCard({
  integration, conn, isPending, isConnecting,
  onConnect, onRevoke, onInterest,
}: {
  integration: Integration
  conn: Connected | undefined
  isPending: boolean
  isConnecting: boolean
  onConnect: () => void
  onRevoke: () => void
  onInterest: () => void
}) {
  const isConnected = conn?.status === 'connected'
  const shadow = isConnected
    ? 'inset 0 1px 0 rgba(127,184,151,0.18), 0 0 0 1px rgba(127,184,151,0.3)'
    : 'inset 0 1px 0 rgba(127,184,151,0.06), 0 8px 24px rgba(0,0,0,0.2)'

  return (
    <div style={{
      background: 'var(--bg-glass)', backdropFilter: 'blur(28px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
      borderRadius: 14, padding: '22px 20px',
      display: 'flex', flexDirection: 'column', gap: 10,
      position: 'relative', boxShadow: shadow, minHeight: 200,
    }}>
      {/* Ribbon */}
      <span style={{
        position: 'absolute', top: 12, right: 12,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', padding: '3px 8px', borderRadius: 99,
        background: integration.is_official ? 'rgba(59,130,246,0.16)' : 'rgba(249,115,22,0.16)',
        color: integration.is_official ? '#60A5FA' : '#FB923C',
      }}>{integration.is_official ? 'Official' : 'Approved'}</span>

      <div style={{ fontSize: 30 }}>{integration.logo_placeholder}</div>

      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 17, color: 'var(--text-primary)', marginBottom: 4 }}>
          {integration.display_name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {integration.description}
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
        By {integration.developed_by}
      </div>

      {isConnected && conn?.external_account_name && (
        <div style={{ fontSize: 11, color: V, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: V, boxShadow: `0 0 6px ${V}`, display: 'inline-block' }} />
          {conn.external_account_name}
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        {integration.status === 'available' && !isConnected && (
          <button onClick={onConnect} disabled={isConnecting}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none',
              background: isConnecting ? 'var(--bg-elevated)' : `linear-gradient(135deg, ${V}, var(--violet-700, #2D5240))`,
              color: 'white', fontSize: 13, fontWeight: 600,
              cursor: isConnecting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
            {isConnecting ? 'Connecting…' : 'Connect'}
          </button>
        )}

        {isConnected && (
          <>
            <button style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: V, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Settings
            </button>
            <button onClick={onRevoke}
              style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(201,112,112,0.3)', background: 'transparent', color: 'var(--destructive,#C97070)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Disconnect
            </button>
          </>
        )}

        {integration.status === 'partnership_pending' && (
          <button onClick={onInterest}
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.2)', background: 'transparent', color: isPending ? V : 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            {isPending ? '✓ Interest logged' : 'Apply for partnership'}
          </button>
        )}

        {integration.setup_method === 'email_po' && (
          <a href="mailto:hello@ariaos.site?subject=Data%20Migration%20Request"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.2)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, textDecoration: 'none', textAlign: 'center', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Contact us
          </a>
        )}
      </div>
    </div>
  )
}

export default function IntegrationsPage() {
  const [connected, setConnected] = useState<Connected[]>([])
  const [loading, setLoading] = useState(true)
  const [interestModal, setInterestModal] = useState<IntegrationKey | null>(null)
  const [interestLogged, setInterestLogged] = useState<Set<IntegrationKey>>(new Set())
  const [connectingKey, setConnectingKey] = useState<IntegrationKey | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') || params.get('xero') === 'connected') setSuccessMsg('Connected successfully')
    if (params.get('error')) {
      const e = params.get('error')
      setErrorMsg(e === 'oauth_failed' ? 'OAuth connection failed. Check credentials.' : e === 'invalid_state' ? 'Invalid state token. Please try again.' : 'Connection failed.')
    }

    fetch('/api/pos/integrations').then(r => r.json()).then(d => {
      setConnected(d.integrations ?? [])
      setInterestLogged(new Set((d.integrations ?? []).filter((i: Connected) => i.status === 'pending').map((i: Connected) => i.integration_key)))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const getConn = (key: IntegrationKey) => connected.find(c => c.integration_key === key)

  async function handleConnect(key: IntegrationKey) {
    setConnectingKey(key); setErrorMsg(null)
    try {
      if (key === 'xero') { window.location.href = '/api/xero/connect'; return }
      const res = await fetch('/api/pos/integrations?action=start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration_key: key }),
      }).then(r => r.json())
      if (res.unconfigured) { setErrorMsg(res.error); return }
      if (res.authorize_url) { window.location.href = res.authorize_url; return }
      setErrorMsg(res.error ?? 'Failed to start OAuth')
    } catch (e: any) { setErrorMsg(e.message) }
    finally { setConnectingKey(null) }
  }

  async function handleRevoke(key: IntegrationKey) {
    if (!confirm(`Disconnect ${key}? This will stop syncing.`)) return
    if (key === 'xero') {
      await fetch('/api/xero/disconnect', { method: 'POST' })
      setConnected(prev => prev.filter(c => c.integration_key !== key))
      return
    }
    await fetch('/api/pos/integrations?action=revoke', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_key: key }),
    })
    setConnected(prev => prev.filter(c => c.integration_key !== key))
  }

  async function handleLogInterest(key: IntegrationKey) {
    await fetch('/api/pos/integrations?action=log_interest', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration_key: key }),
    })
    setInterestLogged(prev => new Set([...prev, key]))
    setInterestModal(null)
  }

  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }
  const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 16 }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)', fontFamily: "'Manrope',sans-serif" }}>Loading…</div>

  const modal = interestModal ? INTEGRATIONS.find(i => i.key === interestModal) : null

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1280, margin: '0 auto', fontFamily: "'Manrope',sans-serif" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 36, fontWeight: 400, letterSpacing: '-0.025em', color: 'var(--text-primary)', margin: '0 0 8px' }}>Integrations</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Connect Aria to your accounting, supplier, and loyalty systems.</p>
      </div>

      {successMsg && <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 20, background: 'rgba(127,184,151,0.10)', border: '1px solid rgba(127,184,151,0.25)', color: V, fontSize: 14 }}>✓ {successMsg}</div>}
      {errorMsg && <div style={{ padding: '12px 16px', borderRadius: 8, marginBottom: 20, background: 'rgba(201,112,112,0.10)', border: '1px solid rgba(201,112,112,0.25)', color: 'var(--destructive,#C97070)', fontSize: 14 }}>{errorMsg}</div>}

      <div style={{ marginBottom: 40 }}>
        <div style={sectionLabel}>Official Integration</div>
        <div style={grid}>
          {OFFICIAL.map(i => (
            <IntegrationCard key={i.key} integration={i} conn={getConn(i.key)}
              isPending={interestLogged.has(i.key)} isConnecting={connectingKey === i.key}
              onConnect={() => handleConnect(i.key)} onRevoke={() => handleRevoke(i.key)}
              onInterest={() => setInterestModal(i.key)} />
          ))}
        </div>
      </div>

      <div>
        <div style={sectionLabel}>Approved by Aria</div>
        <div style={grid}>
          {APPROVED.map(i => (
            <IntegrationCard key={i.key} integration={i} conn={getConn(i.key)}
              isPending={interestLogged.has(i.key)} isConnecting={connectingKey === i.key}
              onConnect={() => handleConnect(i.key)} onRevoke={() => handleRevoke(i.key)}
              onInterest={() => setInterestModal(i.key)} />
          ))}
        </div>
      </div>

      {/* Partnership interest modal */}
      {modal && (
        <div onClick={() => setInterestModal(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: 'var(--bg-elevated)', borderRadius: 16, padding: 32, maxWidth: 480, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.5)', border: '1px solid rgba(127,184,151,0.12)' }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>{modal.logo_placeholder}</div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 400, fontSize: 24, color: 'var(--text-primary)', margin: '0 0 12px' }}>{modal.display_name}</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Aria is in active partnership conversations with {modal.display_name}. Log your interest and we&apos;ll notify you when this integration is live — and prioritise partnerships that customers want most.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => handleLogInterest(interestModal!)}
                style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: `linear-gradient(135deg, ${V}, var(--violet-700, #2D5240))`, color: 'white', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Log my interest
              </button>
              <button onClick={() => setInterestModal(null)}
                style={{ padding: '12px 16px', borderRadius: 10, background: 'transparent', border: '1px solid rgba(127,184,151,0.2)', color: 'var(--text-secondary)', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
