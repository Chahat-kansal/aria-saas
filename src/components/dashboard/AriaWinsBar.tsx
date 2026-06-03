'use client'
import { useEffect, useState } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'

interface Win {
  icon: string
  label: string
  value: string
  color: string
}

/**
 * AriaWinsBar — additive surface showing proven value this week.
 * Shows at top of dashboard. Never empty — falls back to motivational state.
 * UPGRADE_ONLY: never remove wins, only add more sources.
 */
export function AriaWinsBar() {
  const { business } = useBusinessContext()
  const [wins, setWins] = useState<Win[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!business?.id) return
    fetch(`/api/aria/wins?businessId=${business.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.wins?.length) setWins(d.wins)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [business?.id])

  if (loading) return null
  if (!wins.length) return null

  return (
    <div style={{
      width: '100%',
      background: 'linear-gradient(135deg, rgba(45,82,64,0.4) 0%, rgba(15,30,20,0.6) 100%)',
      border: '1px solid rgba(127,184,151,0.2)',
      borderRadius: 12,
      padding: '10px 16px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch' as React.CSSProperties['WebkitOverflowScrolling'],
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: '#7FB897', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', flexShrink: 0 }}>
        Aria this week
      </span>
      <div style={{ width: 1, height: 20, background: 'rgba(127,184,151,0.2)', flexShrink: 0 }} />
      {wins.map((w, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 8, padding: '5px 10px',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          <span style={{ fontSize: 14 }}>{w.icon}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{w.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: w.color }}>{w.value}</span>
        </div>
      ))}
    </div>
  )
}
