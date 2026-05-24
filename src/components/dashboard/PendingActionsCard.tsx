'use client'
import { useState, useEffect, useCallback } from 'react'

type PendingAction = {
  id: string
  agent_name: string
  action_type: string
  action_input: Record<string, unknown>
  action_output: Record<string, unknown>
  risk_level: 'low' | 'medium' | 'high'
  created_at: string
}

function RiskBadge({ level }: { level: string }) {
  if (level === 'high') return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}>High risk</span>
  )
  if (level === 'medium') return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(245,158,11,0.12)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>Medium risk</span>
  )
  return (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600, background: 'rgba(29,158,117,0.12)', color: '#1D9E75', border: '1px solid rgba(29,158,117,0.2)' }}>Low risk</span>
  )
}

function hoursUntilAutoApprove(createdAt: string): number {
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 3600000
  return Math.max(0, 24 - elapsed)
}

function describeAction(action: PendingAction): string {
  const inp = action.action_input
  if (action.agent_name === 'message_agent') {
    const count = Number(inp.customer_count ?? 0)
    const intent = String(inp.intent ?? '')
    return 'Send messages to ' + count + ' customer' + (count !== 1 ? 's' : '') + (intent ? ' — ' + intent : '')
  }
  if (action.agent_name === 'automation_agent') {
    const triggered = (action.action_output?.triggered as Array<{ automation: string; reason: string }>) ?? []
    if (triggered.length > 0) {
      return 'Trigger: ' + triggered.map(t => t.automation.replace('_', ' ')).join(', ')
    }
    return 'Trigger automation'
  }
  return action.action_type.replace('_', ' ')
}

export function PendingActionsCard({ businessId }: { businessId: string }) {
  const [actions, setActions] = useState<PendingAction[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/aria/pending-actions?businessId=' + businessId)
      if (res.ok) {
        const d = await res.json() as { actions: PendingAction[] }
        setActions(d.actions ?? [])
      }
    } catch { /* non-fatal */ } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => { if (businessId) load() }, [businessId, load])

  const decide = async (actionId: string, decision: 'approve' | 'dismiss') => {
    setProcessing(actionId)
    try {
      await fetch('/api/aria/approve-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: actionId, decision }),
      })
      setActions(prev => prev.filter(a => a.id !== actionId))
    } catch { /* non-fatal */ } finally {
      setProcessing(null)
    }
  }

  if (loading || actions.length === 0) return null

  return (
    <div style={{ borderRadius: 12, background: '#13131a', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending Actions</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', marginLeft: 'auto' }}>{actions.length}</span>
      </div>

      <div style={{ padding: '12px 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {actions.map(action => {
          const hoursLeft = action.risk_level === 'medium' ? hoursUntilAutoApprove(action.created_at) : null
          const busy = processing === action.id
          return (
            <div key={action.id} style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.4 }}>{describeAction(action)}</span>
                <RiskBadge level={action.risk_level} />
              </div>

              {hoursLeft !== null && hoursLeft > 0 && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 8px' }}>
                  Auto-approves in {hoursLeft.toFixed(0)}h unless dismissed
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => decide(action.id, 'approve')}
                  disabled={busy}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, background: busy ? 'rgba(29,158,117,0.1)' : 'rgba(29,158,117,0.15)', border: '1px solid rgba(29,158,117,0.3)', color: '#1D9E75', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Manrope',sans-serif" }}
                >
                  {busy ? '...' : 'Approve'}
                </button>
                <button
                  onClick={() => decide(action.id, 'dismiss')}
                  disabled={busy}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 600, cursor: busy ? 'default' : 'pointer', fontFamily: "'Manrope',sans-serif" }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
