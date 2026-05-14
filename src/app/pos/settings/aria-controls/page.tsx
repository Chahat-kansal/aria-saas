'use client'
import { useState, useEffect } from 'react'

const CATEGORIES = [
  { key: 'sales',       label: 'Sales',       description: 'Large transactions, unusual patterns' },
  { key: 'inventory',   label: 'Inventory',   description: 'Low stock, out-of-stock alerts' },
  { key: 'staffing',    label: 'Staffing',    description: 'Shift patterns, staff performance' },
  { key: 'compliance',  label: 'Compliance',  description: 'Overdue checklist items, certificate expiry' },
  { key: 'operations',  label: 'Operations',  description: 'Register variances, session anomalies' },
  { key: 'customer',    label: 'Customer',    description: 'Win-back opportunities, repeat visitors' },
]

interface Pref { category: string; is_tracking: boolean; paused_reason?: string }

export default function AriaControlsPage() {
  const [prefs, setPrefs]     = useState<Record<string, Pref>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/aria/tracking-preferences')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, Pref> = {}
        for (const p of d.preferences ?? []) map[p.category] = p
        setPrefs(map)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  async function toggle(category: string) {
    const current = prefs[category]?.is_tracking ?? true
    const next    = !current
    setSaving(category)
    setPrefs(p => ({ ...p, [category]: { ...p[category], category, is_tracking: next } }))
    await fetch('/api/aria/tracking-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, is_tracking: next }),
    }).catch(() => {})
    setSaving(null)
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: "'Manrope',sans-serif", padding: '24px 28px', maxWidth: 680 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Aria Brain Controls</h1>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 24px' }}>
        Choose which categories Aria monitors and surfaces insights for.
      </p>

      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {CATEGORIES.map(cat => {
            const pref    = prefs[cat.key]
            const tracked = pref?.is_tracking ?? true
            return (
              <div
                key={cat.key}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--divider)',
                  borderRadius: 12, padding: '16px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                  opacity: saving === cat.key ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{cat.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{cat.description}</div>
                </div>
                <button
                  onClick={() => toggle(cat.key)}
                  disabled={saving === cat.key}
                  style={{
                    width: 44, height: 24, borderRadius: 99, border: 'none',
                    background: tracked ? 'var(--violet)' : 'var(--bg-elevated)',
                    cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    boxShadow: 'inset 0 0 0 1px var(--divider)',
                  }}
                  aria-label={`${tracked ? 'Disable' : 'Enable'} ${cat.label} tracking`}
                >
                  <span style={{
                    position: 'absolute', top: 2, left: tracked ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%',
                    background: tracked ? '#fff' : 'var(--text-tertiary)',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 24 }}>
        Aria Brain runs daily at 2 AM AEST. Changes take effect on the next run.
      </p>
    </div>
  )
}