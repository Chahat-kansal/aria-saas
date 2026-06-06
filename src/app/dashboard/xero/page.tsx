'use client'
import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Preview {
  id: string
  date: string
  status: 'pending' | 'synced' | 'failed' | 'skipped'
  payload: {
    sales_count: number
    total_revenue: number
    total_tax: number
    total_ex_gst: number
    by_method: Record<string, number>
    journal_lines: Array<{ description: string; amount: number; account_code: string; type: string }>
  } | null
  synced_at: string | null
  xero_journal_id: string | null
  created_at: string
}

interface QueueItem {
  id: string
  sync_date: string
  status: string
  total_sales: number
  total_gst: number | null
  sent_at: string | null
  xero_invoice_id: string | null
}

interface StatusData {
  connected: boolean
  token_expired: boolean
  connected_at: string | null
  auto_sync: boolean
  pending: QueueItem[]
  history: QueueItem[]
  previews: Preview[]
}

function fmt(n: number) { return 'A$' + n.toFixed(2) }
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return h + 'h ago'
  return Math.floor(h / 24) + 'd ago'
}

export default function XeroPage() {
  const { business } = useBusinessContext()
  const [status, setStatus] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncDate, setSyncDate] = useState(new Date(Date.now() - 86400000).toISOString().split('T')[0])
  const [preparing, setPreparing] = useState(false)
  const [approving, setApproving] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState('')
  const [togglingAuto, setTogglingAuto] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const loadStatus = useCallback(async () => {
    if (!business?.id) return
    setLoading(true)
    try {
      const d = await fetch('/api/integrations/xero/status?business_id=' + business.id).then(r => r.json())
      setStatus(d)
    } catch (e) { console.warn('[non-fatal]', e) }
    setLoading(false)
  }, [business?.id])

  useEffect(() => { loadStatus() }, [loadStatus])

  async function prepare() {
    if (!business?.id) return
    setPreparing(true); setError(''); setPreview(null)
    try {
      const res = await fetch('/api/pos/xero-sync/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: syncDate }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to prepare sync'); setPreparing(false); return }
      if (d.preview) setPreview(d.preview as Preview)
      else setError(d.message ?? 'No sales found for that date')
    } catch (e: unknown) { setError((e as Error).message) }
    setPreparing(false)
  }

  async function approve(previewId: string) {
    if (!business?.id) return
    setApproving(previewId); setError('')
    try {
      const res = await fetch('/api/integrations/xero/approve-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: previewId }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Approval failed'); setApproving(null); return }
      setPreview(null)
      setSuccessMsg('Synced to Xero. Journal ID: ' + (d.xero_invoice_id ?? '—'))
      setTimeout(() => setSuccessMsg(''), 6000)
      await loadStatus()
    } catch (e: unknown) { setError((e as Error).message) }
    setApproving(null)
  }

  async function toggleAutoSync(val: boolean) {
    if (!business?.id) return
    setTogglingAuto(true)
    try {
      await fetch('/api/integrations/xero/auto-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: business.id, enabled: val }),
      })
      setStatus(prev => prev ? { ...prev, auto_sync: val } : prev)
    } catch (e) { console.warn('[non-fatal]', e) }
    setTogglingAuto(false)
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.ariaos.site'

  if (loading) return (
    <div style={{ padding: '24px 28px', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading Xero status…</div>
  )

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", padding: '24px 28px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Xero Sync</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sync your Aria POS daily sales to Xero as manual journal entries.</p>
      </div>

      {/* Connection status card */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 38, height: 38, borderRadius: '50%', background: status?.connected ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: '1px solid ' + (status?.connected ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {status?.connected ? '✓' : '✗'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: status?.connected ? '#22C55E' : '#EF4444' }}>
            {status?.connected ? 'Connected to Xero' : 'Not connected'}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
            {status?.connected
              ? (status.token_expired ? 'Token expired — reconnect below' : 'Connected ' + (status.connected_at ? timeAgo(status.connected_at) : ''))
              : 'Connect to start syncing sales to your Xero account'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {status?.connected ? (
            <a href={'/api/integrations/xero/connect?business_id=' + business?.id}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 600, textDecoration: 'none', fontFamily: 'inherit', lineHeight: '22px' }}>
              Reconnect
            </a>
          ) : (
            <a href={'/api/integrations/xero/connect?business_id=' + business?.id}
              style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1AB4D7', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit', lineHeight: '22px' }}>
              Connect Xero
            </a>
          )}
        </div>
      </div>

      {status?.connected && (
        <>
          {/* Auto-sync toggle */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '16px 22px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Auto-sync daily</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Automatically push yesterday's sales to Xero at 1am AEST each day.</div>
            </div>
            <button onClick={() => toggleAutoSync(!status?.auto_sync)} disabled={togglingAuto}
              style={{ padding: '7px 18px', borderRadius: 8, border: 'none', background: status?.auto_sync ? '#22C55E' : 'rgba(255,255,255,0.08)', color: status?.auto_sync ? '#fff' : 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: togglingAuto ? 0.6 : 1 }}>
              {status?.auto_sync ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Manual sync section */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '18px 22px', marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Manual sync</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={syncDate} onChange={e => setSyncDate(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={prepare} disabled={preparing || !syncDate}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: preparing ? 'rgba(127,184,151,0.3)' : '#7FB897', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: preparing ? 0.7 : 1 }}>
                {preparing ? 'Preparing…' : 'Preview sync'}
              </button>
            </div>

            {error && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, fontSize: 13, color: '#EF4444' }}>{error}</div>}
            {successMsg && <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, fontSize: 13, color: '#22C55E' }}>{successMsg}</div>}

            {/* Preview panel */}
            {preview && preview.payload && (
              <div style={{ marginTop: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Preview — {preview.date}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{preview.payload.sales_count} sales · {fmt(preview.payload.total_revenue)} total · {fmt(preview.payload.total_tax)} GST</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setPreview(null)}
                      style={{ padding: '6px 14px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                    <button onClick={() => approve(preview.id)} disabled={!!approving}
                      style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: approving ? 'rgba(127,184,151,0.3)' : '#7FB897', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: approving ? 0.7 : 1 }}>
                      {approving === preview.id ? 'Syncing…' : 'Approve & send to Xero'}
                    </button>
                  </div>
                </div>
                <div style={{ padding: '12px 18px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Description', 'Account', 'Amount', 'Type'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.payload.journal_lines.map((l, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.8)' }}>{l.description}</td>
                          <td style={{ padding: '8px 10px', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{l.account_code}</td>
                          <td style={{ padding: '8px 10px', color: '#7FB897', fontFamily: 'monospace' }}>{fmt(l.amount)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: l.type === 'debit' ? 'rgba(59,130,246,0.12)' : 'rgba(34,197,94,0.12)', color: l.type === 'debit' ? '#60A5FA' : '#22C55E', fontWeight: 600, textTransform: 'uppercase' }}>
                              {l.type}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Sync history */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Sync history</h2>
            </div>
            {(status?.previews ?? []).length === 0 ? (
              <div style={{ padding: '40px 22px', textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No syncs yet. Use "Preview sync" above to push your first day.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['Date', 'Sales', 'Revenue', 'GST', 'Status', 'Journal ID'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(status?.previews ?? []).map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '11px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{p.date}</td>
                        <td style={{ padding: '11px 16px', color: 'rgba(255,255,255,0.6)' }}>{p.payload?.sales_count ?? '—'}</td>
                        <td style={{ padding: '11px 16px', color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace' }}>{p.payload ? fmt(p.payload.total_revenue) : '—'}</td>
                        <td style={{ padding: '11px 16px', color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace' }}>{p.payload ? fmt(p.payload.total_tax) : '—'}</td>
                        <td style={{ padding: '11px 16px' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, fontWeight: 700, background: p.status === 'synced' ? 'rgba(34,197,94,0.12)' : p.status === 'failed' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: p.status === 'synced' ? '#22C55E' : p.status === 'failed' ? '#EF4444' : '#F59E0B', textTransform: 'capitalize' }}>
                            {p.status}
                          </span>
                        </td>
                        <td style={{ padding: '11px 16px', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace', fontSize: 11 }}>
                          {p.xero_journal_id ? p.xero_journal_id.slice(0, 12) + '…' : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
