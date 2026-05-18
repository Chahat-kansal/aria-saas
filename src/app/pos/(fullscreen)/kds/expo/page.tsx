'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import AllDayCounter from '@/components/pos/kds/AllDayCounter'
import type { KdsTicket } from '@/lib/pos/kds-types'

interface TicketWithProduct extends KdsTicket {
  product_name?: string
}

export default function ExpoPage() {
  const [tickets, setTickets] = useState<TicketWithProduct[]>([])
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    const r = await fetch('/api/pos/kds/tickets/active')
    if (r.ok) {
      const j = await r.json()
      setTickets((j.tickets ?? []) as TicketWithProduct[])
    }
    setLoading(false)
  }

  useEffect(() => {
    reload()
    if (!supabase) return
    const channel = supabase
      .channel('kds:expo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_kds_tickets' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const byTable = tickets.reduce((acc, t) => {
    const key = t.table_label ?? 'No table'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {} as Record<string, TicketWithProduct[]>)

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>Loading…</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <h1 className="text-xl font-medium">Expo</h1>
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {Object.entries(byTable).map(([table, ts]) => (
            <div key={table} className="rounded-lg p-4" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
              <h2 className="text-lg font-medium mb-2">
                {table} <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>({ts.length})</span>
              </h2>
              <div className="space-y-1">
                {ts.map(t => (
                  <div key={t.id} className="flex justify-between items-baseline text-sm">
                    <span>
                      {t.quantity > 1 ? `${t.quantity}× ` : ''}{t.product_name}
                      {' '}<span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>[{t.station}]</span>
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {Object.keys(byTable).length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All caught up.</div>
          )}
        </div>

        <div>
          <h3 className="text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All-day</h3>
          <AllDayCounter tickets={tickets} />
        </div>
      </div>
    </div>
  )
}
