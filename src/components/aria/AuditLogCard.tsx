'use client'
import { useEffect, useState, useCallback } from 'react'

interface LogEntry {
  id: string
  action_type: string
  entity_type: string
  entity_ids: string[]
  after_state: Record<string, unknown>
  triggered_by: string
  executed_at: string
  rolled_back_at: string | null
  message_excerpt: string | null
}

export default function AuditLogCard() {
  const [log, setLog] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [rollingBack, setRollingBack] = useState<string | null>(null)

  const refresh = useCallback(() => {
    fetch('/api/aria/ask/audit')
      .then(r => r.json())
      .then((j: { log?: LogEntry[] }) => { setLog(j.log ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const rollback = async (id: string) => {
    if (!confirm('Undo this action? This will revert the changes.')) return
    setRollingBack(id)
    try {
      const r = await fetch('/api/aria/ask/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ log_id: id }),
      })
      const j = await r.json() as { ok?: boolean; error?: string }
      if (j.ok) {
        setLog(prev => prev.map(e => e.id === id ? { ...e, rolled_back_at: new Date().toISOString() } : e))
      } else {
        alert(j.error ?? 'Rollback failed')
      }
    } finally {
      setRollingBack(null)
    }
  }

  if (loading) {
    return <p className="text-xs p-3" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading audit log…</p>
  }
  if (!log.length) {
    return <p className="text-xs p-3" style={{ color: 'rgba(255,255,255,0.3)' }}>No actions yet.</p>
  }

  return (
    <div className="space-y-2">
      {log.map(entry => {
        const withinWindow = !entry.rolled_back_at &&
          new Date(entry.executed_at).getTime() > Date.now() - 3600_000
        return (
          <div key={entry.id}
            className="p-3 rounded-xl"
            style={{
              border: '1px solid rgba(255,255,255,0.08)',
              background: entry.rolled_back_at ? 'transparent' : 'rgba(255,255,255,0.03)',
              opacity: entry.rolled_back_at ? 0.5 : 1,
            }}>
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-xs font-medium text-white capitalize">
                {entry.action_type.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {new Date(entry.executed_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            {entry.message_excerpt && (
              <p className="text-[11px] mt-0.5 italic truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                "{entry.message_excerpt}"
              </p>
            )}
            <div className="flex justify-between items-center mt-1">
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {entry.entity_ids.length} item{entry.entity_ids.length !== 1 ? 's' : ''}
                {entry.rolled_back_at ? ' — rolled back' : ''}
              </span>
              {withinWindow && (
                <button
                  onClick={() => rollback(entry.id)}
                  disabled={rollingBack === entry.id}
                  className="text-[10px] transition-opacity disabled:opacity-50 hover:underline"
                  style={{ color: '#f59e0b' }}
                >
                  {rollingBack === entry.id ? 'Undoing…' : 'Undo'}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
