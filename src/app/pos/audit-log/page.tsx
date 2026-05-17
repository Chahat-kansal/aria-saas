'use client'
import { useState, useEffect, useCallback } from 'react'

interface AuditEntry {
  id: string
  action_type: string
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

const ACTION_COLORS: Record<string, string> = {
  sale:       '#7FB897',
  refund:     '#F59E0B',
  void:       '#EF4444',
  discount:   '#8B5CF6',
  staff:      '#6B96B0',
  register:   '#94A3B8',
  product:    '#10B981',
  settings:   '#6B7280',
}

function actionColor(type: string) {
  const key = Object.keys(ACTION_COLORS).find(k => type?.toLowerCase().includes(k))
  return key ? ACTION_COLORS[key] : '#94A3B8'
}

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}

export default function AuditLogPage() {
  const [entries, setEntries]   = useState<AuditEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState('')
  const [actionFilter, setActionFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/pos/audit-log')
      const json = await res.json()
      setEntries(json.entries ?? [])
    } catch {
      setEntries([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const actionTypes = ['all', ...Array.from(new Set(entries.map(e => e.action_type))).sort()]

  const filtered = entries.filter(e => {
    const matchesAction = actionFilter === 'all' || e.action_type === actionFilter
    const matchesSearch = !filter || e.description.toLowerCase().includes(filter.toLowerCase()) || e.action_type.toLowerCase().includes(filter.toLowerCase())
    return matchesAction && matchesSearch
  })

  function exportCSV() {
    const header = 'Date,Action,Description'
    const rows = filtered.map(e => `"${fmtDate(e.created_at)}","${e.action_type}","${e.description.replace(/"/g, '""')}"`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const inp: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 8, padding: '7px 11px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none' }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Audit Log</h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Track all actions performed in your POS.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input placeholder="Search…" value={filter} onChange={e => setFilter(e.target.value)}
            style={{ ...inp, width: 180 }} />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={{ ...inp }}>
            {actionTypes.map(t => <option key={t} value={t}>{t === 'all' ? 'All actions' : t}</option>)}
          </select>
          <button onClick={exportCSV} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--divider)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Export CSV
          </button>
          <button onClick={load} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--violet)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No audit entries found.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--bg-surface)', border: '1px solid var(--divider)', borderRadius: 10, padding: '12px 16px' }}>
              <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${actionColor(e.action_type)}18`, color: actionColor(e.action_type), flexShrink: 0, marginTop: 1 }}>
                {e.action_type}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{e.description}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }}>{fmtDate(e.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}