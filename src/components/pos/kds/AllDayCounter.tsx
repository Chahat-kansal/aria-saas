'use client'
import { useMemo } from 'react'
import type { KdsTicket } from '@/lib/pos/kds-types'

interface AllDayProps {
  tickets: Array<KdsTicket & { product_name?: string }>
}

export default function AllDayCounter({ tickets }: AllDayProps) {
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tickets) {
      if (t.status !== 'fired' && t.status !== 'preparing') continue
      const name = t.product_name ?? 'Unknown'
      m.set(name, (m.get(name) ?? 0) + (Number(t.quantity) || 1))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [tickets])

  if (counts.length === 0) {
    return <div className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>No active items.</div>
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {counts.map(([name, count]) => (
        <div key={name} className="rounded px-3 py-2 flex justify-between items-baseline" style={{ background: 'var(--bg-elevated, #1A2620)', border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
          <span className="text-sm truncate" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{name}</span>
          <span className="text-lg font-medium ml-2" style={{ color: 'var(--text-primary, #E8EDE7)' }}>{count}</span>
        </div>
      ))}
    </div>
  )
}
