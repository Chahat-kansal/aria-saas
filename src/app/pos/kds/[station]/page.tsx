'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import TicketCard from '@/components/pos/kds/TicketCard'
import type { KdsStation, KdsTicket } from '@/lib/pos/kds-types'

interface TicketWithProduct extends KdsTicket {
  product_name?: string
  allergens?: string[] | null
}

export default function StationPage() {
  const params = useParams() as { station: string }
  const stationKey = params.station

  const [station, setStation] = useState<KdsStation | null>(null)
  const [tickets, setTickets] = useState<TicketWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const loadTickets = useCallback(async () => {
    const r = await fetch(`/api/pos/kds/tickets/active?station=${encodeURIComponent(stationKey)}`)
    if (!r.ok) return
    const j = await r.json()
    setTickets((j.tickets ?? []) as TicketWithProduct[])
  }, [stationKey])

  const loadInitial = useCallback(async () => {
    const r1 = await fetch('/api/pos/kds/stations')
    const j1 = await r1.json()
    const found: KdsStation | undefined = (j1.stations ?? []).find((s: KdsStation) => s.station_key === stationKey)
    if (!found) { setNotFound(true); setLoading(false); return }
    setStation(found)
    await loadTickets()
    setLoading(false)
  }, [stationKey, loadTickets])

  useEffect(() => { loadInitial() }, [loadInitial])

  useEffect(() => {
    if (!supabase) return
    const channel = supabase
      .channel(`kds:${stationKey}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'pos_kds_tickets',
        filter: `station=eq.${stationKey}`,
      }, async (payload: { eventType: string }) => {
        await loadTickets()
        if (payload.eventType === 'INSERT' && station?.sound_enabled) {
          try {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain); gain.connect(ctx.destination)
            osc.frequency.value = 880; gain.gain.value = 0.1
            osc.start(); osc.stop(ctx.currentTime + 0.15)
          } catch {}
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [stationKey, station?.sound_enabled, loadTickets])

  const action = async (id: string, act: string) => {
    await fetch(`/api/pos/kds/tickets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: act }),
    })
    await loadTickets()
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>Loading…</div>
  if (notFound) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>Station not found: {stationKey}</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-page, #0E1411)', color: 'var(--text-primary, #E8EDE7)' }}>
      <div className="px-6 py-3 flex justify-between items-center" style={{ borderBottom: '1px solid var(--divider, rgba(232,237,231,0.04))' }}>
        <h1 className="text-xl font-medium">{station?.display_name ?? stationKey}</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>{tickets.length} active</span>
          <a href="/pos/kds/expo" className="text-sm" style={{ color: '#7FB897' }}>Expo →</a>
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {tickets.map(t => (
          <TicketCard
            key={t.id} ticket={t}
            show_modifiers={station?.show_modifiers ?? true}
            show_allergens={station?.show_allergens ?? true}
            onBump={() => action(t.id, 'bump')}
            onUnfire={() => action(t.id, 'unfire')}
            onExpedite={() => action(t.id, 'expedite')}
          />
        ))}
      </div>
      {tickets.length === 0 && <div className="px-6 py-12 text-center" style={{ color: 'var(--text-secondary, #A8B5A8)' }}>All caught up.</div>}
    </div>
  )
}
