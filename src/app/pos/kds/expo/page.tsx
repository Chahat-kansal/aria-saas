'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import AllDayCounter from '@/components/pos/kds/AllDayCounter'
import type { KdsTicket } from '@/lib/pos/kds-types'

interface TicketWithProduct extends KdsTicket { product_name?: string }

interface KdsOrderItem { name: string; qty: number; modifiers?: string[] }
interface KdsOrder {
  id: string; table_label: string | null; items: KdsOrderItem[]
  status: string; created_at: string; ticket_number?: number | null
}

export default function ExpoPage() {
  const [tickets, setTickets] = useState<TicketWithProduct[]>([])
  const [readyOrders, setReadyOrders] = useState<KdsOrder[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    // pos_kds_tickets (new station KDS) — show fired + in_progress
    const [r1, r2] = await Promise.all([
      fetch('/api/pos/kds/tickets/active'),
      fetch('/api/pos/kds'),  // pos_kds_orders (kitchen page)
    ])
    if (r1.ok) { const j = await r1.json(); setTickets((j.tickets ?? []) as TicketWithProduct[]) }
    if (r2.ok) {
      const j = await r2.json()
      // Show only 'ready' orders on expo (cooked, waiting to be served)
      setReadyOrders(((j.orders ?? []) as KdsOrder[]).filter(o => o.status === 'ready'))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    if (!supabase) return
    const channel = supabase
      .channel('kds:expo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_kds_tickets' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_kds_orders' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [reload])

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
          {/* Ready orders from /pos/kitchen (pos_kds_orders) */}
          {readyOrders.map(order => (
            <div key={order.id} className="rounded-lg p-4" style={{ border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.05)' }}>
              <h2 className="text-lg font-medium mb-1 flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>READY</span>
                {order.table_label ?? 'No table'}
                {order.ticket_number && <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>#{order.ticket_number}</span>}
              </h2>
              <div className="space-y-1">
                {(order.items ?? []).map((item, i) => (
                  <div key={i} className="text-sm">
                    {item.qty > 1 ? `${item.qty}× ` : ''}{item.name}
                    {item.modifiers?.length ? <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}> · {item.modifiers.join(', ')}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {/* Station KDS tickets from pos_kds_tickets */}
          {Object.entries(byTable).map(([table, ts]) => (
            <div key={table} className="rounded-lg p-4" style={{ border: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
              <h2 className="text-lg font-medium mb-2">{table} <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>({ts.length})</span></h2>
              <div className="space-y-1">
                {ts.map(t => (
                  <div key={t.id} className="flex justify-between text-sm">
                    <span>{t.quantity > 1 ? `${t.quantity}× ` : ''}{t.product_name} <span style={{ color: 'var(--text-secondary, #A8B5A8)' }}>[{t.station}]</span></span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {readyOrders.length === 0 && Object.keys(byTable).length === 0 && <div className="text-center py-12" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All caught up.</div>}
        </div>
        <div>
          <h3 className="text-sm uppercase tracking-wide mb-2" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All-day</h3>
          <AllDayCounter tickets={tickets} />
        </div>
      </div>
    </div>
  )
}
