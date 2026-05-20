'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { routeForInsight } from '@/lib/aria/insight-route'

interface Insight {
  id: string
  category: string
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  estimated_impact: string
  status: string
  source?: string | null
  payload?: Record<string, unknown> | null
  created_at: string
}

const PRIORITY_COLOR: Record<string, string> = {
  high:   '#EF4444',
  medium: '#F59E0B',
  low:    '#7FB897',
}

export default function AriaBrainPanel({ businessId }: { businessId?: string }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing]   = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    try {
      const res = await fetch('/api/aria/pending-insights')
      const d   = await res.json()
      setInsights(d.insights ?? [])
    } catch { /* best-effort */ }
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    // Load on mount AND when opened to keep badge count accurate
    load()
  }, [load])

  async function approve(id: string) {
    setActing(id)
    await fetch(`/api/aria/insights/${id}/approve`, { method: 'POST' }).catch(() => {})
    setInsights(i => i.filter(x => x.id !== id))
    setActing(null)
  }

  async function dismiss(id: string) {
    setActing(id)
    await fetch(`/api/aria/insights/${id}/dismiss`, { method: 'POST' }).catch(() => {})
    setInsights(i => i.filter(x => x.id !== id))
    setActing(null)
  }

  const pendingCount = insights.filter(i => i.status === 'pending').length

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Aria Brain Insights"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1200,
          width: 48, height: 48, borderRadius: '50%',
          background: 'var(--violet)', border: 'none',
          boxShadow: '0 4px 20px rgba(139,92,246,0.4)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
        }}
      >
        🧠
        {pendingCount > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: '#EF4444', color: '#fff',
            fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 84, right: 24, zIndex: 1200,
          width: 360, maxHeight: '70vh',
          background: 'var(--bg-surface)', border: '1px solid var(--divider)',
          borderRadius: 16, boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
          display: 'flex', flexDirection: 'column',
          fontFamily: "'Manrope',sans-serif",
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px', borderBottom: '1px solid var(--divider)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>Aria Brain</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                {loading ? 'Loading…' : `${pendingCount} pending insight${pendingCount !== 1 ? 's' : ''}`}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 18, padding: 4 }}
            >×</button>
          </div>

          {/* Insights list */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
            ) : insights.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>✨</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>All caught up</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>No pending insights right now.</div>
              </div>
            ) : insights.map(insight => (
              <div key={insight.id} style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--divider)',
                borderRadius: 12, padding: '14px 16px',
                borderLeft: `3px solid ${PRIORITY_COLOR[insight.priority] ?? '#7FB897'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 99,
                    background: `${PRIORITY_COLOR[insight.priority]}20`,
                    color: PRIORITY_COLOR[insight.priority],
                    flexShrink: 0, marginTop: 1,
                  }}>
                    {insight.priority.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{insight.title}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', lineHeight: 1.5 }}>{insight.description}</p>
                {insight.estimated_impact && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 10px' }}>
                    Impact: {insight.estimated_impact}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => { setOpen(false); router.push(routeForInsight(insight)) }}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8,
                      border: '1px solid rgba(127,184,151,.4)', background: 'transparent',
                      color: '#7FB897',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => approve(insight.id)}
                    disabled={acting === insight.id}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8, border: 'none',
                      background: 'var(--violet)', color: '#fff',
                      fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      opacity: acting === insight.id ? 0.6 : 1,
                    }}
                  >
                    {acting === insight.id ? '…' : 'Approve'}
                  </button>
                  <button
                    onClick={() => dismiss(insight.id)}
                    disabled={acting === insight.id}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8,
                      border: '1px solid var(--divider)', background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                      opacity: acting === insight.id ? 0.6 : 1,
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--divider)' }}>
            <a
              href="/pos/settings/aria-controls"
              style={{ fontSize: 11, color: 'var(--text-tertiary)', textDecoration: 'none' }}
            >
              ⚙️ Manage Aria tracking preferences
            </a>
          </div>
        </div>
      )}
    </>
  )
}