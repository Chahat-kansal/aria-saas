'use client'

import { useEffect, useState, useCallback } from 'react'

interface DepCheck { ok: boolean; ms: number; note?: string }
interface DeepHealth {
  status: string
  timestamp: string
  checks: { supabase: DepCheck; anthropic: DepCheck; redis: DepCheck }
}
interface CronRun {
  id: string
  cron_name: string
  started_at: string
  completed_at: string | null
  status: 'running' | 'completed' | 'failed'
  duration_ms: number | null
  rows_affected: number | null
  error: string | null
}
interface Integration { connected: boolean; sync_status?: string | null; last_synced_at?: string | null; sync_error?: string | null }
interface Integrations { xero?: Integration; basiq?: Integration; square?: Integration; stripe?: Integration }

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#16a34a' : '#dc2626', flexShrink: 0,
    }} />
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
      padding: 20, marginBottom: 20,
    }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', margin: '0 0 16px' }}>{title}</h2>
      {children}
    </div>
  )
}

function fmtAge(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3600_000) return Math.floor(ms / 60_000) + 'm ago'
  if (ms < 86_400_000) return Math.floor(ms / 3600_000) + 'h ago'
  return Math.floor(ms / 86_400_000) + 'd ago'
}

function fmtDur(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return ms + 'ms'
  return (ms / 1000).toFixed(1) + 's'
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<DeepHealth | null>(null)
  const [healthErr, setHealthErr] = useState<string | null>(null)
  const [crons, setCrons] = useState<CronRun[]>([])
  const [integrations, setIntegrations] = useState<Integrations>({})
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [healthRes, cronsRes, intRes] = await Promise.allSettled([
        fetch('/api/health/deep'),
        fetch('/api/cron-runs?limit=20'),
        fetch('/api/integrations/status'),
      ])

      if (healthRes.status === 'fulfilled') {
        const d = await healthRes.value.json()
        setHealth(d)
        setHealthErr(null)
      } else {
        setHealthErr('Could not reach /api/health/deep')
      }

      if (cronsRes.status === 'fulfilled' && cronsRes.value.ok) {
        const d = await cronsRes.value.json()
        setCrons(d.runs ?? [])
      }

      if (intRes.status === 'fulfilled' && intRes.value.ok) {
        const d = await intRes.value.json()
        setIntegrations(d)
      }
    } catch { /* handled per-request above */ }
    setLoading(false)
    setLastRefresh(new Date())
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const checks = health?.checks
  const overallOk = health?.status === 'ok'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>System Health</h1>
          {lastRefresh && <p style={{ fontSize: 11, color: '#9ca3af', margin: '4px 0 0' }}>Last refreshed {fmtAge(lastRefresh.toISOString())}</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {health && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20,
              background: overallOk ? '#dcfce7' : '#fee2e2',
              color: overallOk ? '#15803d' : '#b91c1c',
              fontSize: 13, fontWeight: 700,
            }}>
              <StatusDot ok={overallOk} /> {overallOk ? 'All systems operational' : 'Degraded'}
            </span>
          )}
          <button
            onClick={() => { void refresh() }}
            disabled={loading}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              minHeight: 44, opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {healthErr && (
        <div style={{ background: '#fee2e2', borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13, color: '#b91c1c' }}>
          {healthErr}
        </div>
      )}

      {/* Dependencies */}
      <Card title="Dependencies">
        {checks ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {([
              ['Supabase', checks.supabase],
              ['Anthropic API Key', checks.anthropic],
              ['Upstash Redis', checks.redis],
            ] as [string, DepCheck][]).map(([name, c]) => (
              <div key={name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', borderRadius: 8,
                background: c.ok ? '#f0fdf4' : '#fef2f2',
                border: '1px solid ' + (c.ok ? '#bbf7d0' : '#fecaca'),
              }}>
                <StatusDot ok={c.ok} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#1f2937' }}>{name}</p>
                  <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
                    {c.ok ? (c.ms > 0 ? c.ms + 'ms' : 'OK') : (c.note ?? 'Unavailable')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af' }}>Loading…</p>
        )}
      </Card>

      {/* Integration status */}
      <Card title="Integration Connections">
        {Object.keys(integrations).length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {Object.entries(integrations).map(([name, int]) => {
              const i = int as Integration
              if (!i) return null
              return (
                <div key={name} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 16px', borderRadius: 8,
                  background: i.connected ? '#f0fdf4' : '#fafafa',
                  border: '1px solid ' + (i.connected ? '#bbf7d0' : '#e5e7eb'),
                }}>
                  <StatusDot ok={!!i.connected} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: '#1f2937', textTransform: 'capitalize' }}>{name}</p>
                    <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>
                      {i.connected
                        ? 'Connected · last sync ' + fmtAge(i.last_synced_at)
                        : 'Not connected'}
                    </p>
                    {i.sync_error && <p style={{ fontSize: 11, color: '#dc2626', margin: '2px 0 0' }}>{i.sync_error}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af' }}>No integration data available</p>
        )}
      </Card>

      {/* Recent cron runs */}
      <Card title="Recent Cron Runs">
        {crons.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['Cron', 'Status', 'Duration', 'Rows', 'Started'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: '#6b7280', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crons.map(r => (
                <tr key={r.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 500 }}>{r.cron_name}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                      background: r.status === 'completed' ? '#dcfce7' : r.status === 'failed' ? '#fee2e2' : '#fef9c3',
                      color: r.status === 'completed' ? '#15803d' : r.status === 'failed' ? '#b91c1c' : '#a16207',
                    }}>{r.status}</span>
                  </td>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>{fmtDur(r.duration_ms)}</td>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>{r.rows_affected ?? '—'}</td>
                  <td style={{ padding: '6px 8px', color: '#6b7280' }}>{fmtAge(r.started_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ fontSize: 13, color: '#9ca3af' }}>
            No cron run history yet. Cron tracking covers: daily-briefing-submit, xero-sync,
            marketing-automations, nightly-sync, run-scheduled-reorders.
          </p>
        )}
      </Card>

      {/* Rate limiting */}
      <Card title="Rate Limiting">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {[
            { tier: 'AI routes', limit: '20/hour per IP' },
            { tier: 'Messaging routes', limit: '10/hour per IP' },
            { tier: 'Standard API', limit: '100/minute per IP' },
            { tier: 'Public routes', limit: '30/minute per IP' },
          ].map(({ tier, limit }) => (
            <div key={tier} style={{ padding: '10px 14px', borderRadius: 8, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{tier}</p>
              <p style={{ fontSize: 11, color: '#6b7280', margin: '2px 0 0' }}>{limit} · via Upstash Redis</p>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: '#9ca3af', margin: '12px 0 0' }}>
          Rate limiting is gracefully disabled when UPSTASH_REDIS_REST_URL/TOKEN are not set.
        </p>
      </Card>

      <p style={{ fontSize: 11, color: '#d1d5db', marginTop: 8 }}>
        System health is owner-only. Full docs: OBSERVABILITY.md in the project root.
      </p>
    </div>
  )
}
