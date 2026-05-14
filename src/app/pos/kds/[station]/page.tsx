'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'

interface KdsMod { name: string; kds_color?: string }
interface KdsSaleItem {
  product_name: string | null
  variant_label: string | null
  quantity: number | null
  modifiers: KdsMod[] | null
  item_notes: string | null
  seat_number: number | null
  course: number | null
}
interface KdsSale {
  sale_number: number | null
  order_type: string | null
  customer_name: string | null
  cover_count: number | null
  notes: string | null
}
interface KdsTicket {
  id: string
  station: string
  course: number | null
  seat_number: number | null
  status: string
  fired_at: string
  bumped_at: string | null
  pos_sales: KdsSale | null
  pos_sale_items: KdsSaleItem | null
}
interface AllDayItem { name: string; count: number }

const STATION_LABELS: Record<string, string> = {
  barista: '☕ Barista', kitchen_hot: '🔥 Kitchen Hot', kitchen_cold: '🥗 Kitchen Cold',
  pastry: '🥐 Pastry', bar: '🍸 Bar', expo: '📋 Expo',
}

const ALLERGY_KEYWORDS = ['allergy', 'allergen', 'nut', 'gluten', 'dairy', 'vegan', 'halal', 'kosher', 'shellfish', 'egg']

function hasAllergy(mods: KdsMod[] | null): string[] {
  if (!mods) return []
  return mods.filter(m => ALLERGY_KEYWORDS.some(k => m.name.toLowerCase().includes(k)) || m.kds_color === '#e07b6c').map(m => m.name)
}

function elapsed(firedAt: string): number {
  return Math.floor((Date.now() - new Date(firedAt).getTime()) / 1000)
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function TimerBadge({ firedAt }: { firedAt: string }) {
  const [secs, setSecs] = useState(() => elapsed(firedAt))
  useEffect(() => {
    const t = setInterval(() => setSecs(elapsed(firedAt)), 1000)
    return () => clearInterval(t)
  }, [firedAt])
  const color = secs >= 600 ? '#EF4444' : secs >= 300 ? '#F59E0B' : 'rgba(255,255,255,0.45)'
  return <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: 'monospace' }}>{fmtTime(secs)}</span>
}

export default function KdsStationPage() {
  const { station } = useParams<{ station: string }>()
  const [tickets, setTickets] = useState<KdsTicket[]>([])
  const [allDay, setAllDay] = useState<AllDayItem[]>([])
  const [loading, setLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    const [ticketsRes, allDayRes] = await Promise.all([
      fetch(`/api/pos/kds/${station}`).then(r => r.json()).catch(() => ({ tickets: [] })),
      fetch(`/api/pos/kds/all-day?station=${station}`).then(r => r.json()).catch(() => ({ counts: [] })),
    ])
    setTickets(ticketsRes.tickets ?? [])
    setAllDay(allDayRes.counts ?? [])
    setLoading(false)
  }, [station])

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, 3000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [load])

  async function bump(id: string) {
    await fetch(`/api/pos/kds/tickets/${id}/bump`, { method: 'POST' })
    setTickets(ts => ts.filter(t => t.id !== id))
  }

  async function recall(id: string) {
    await fetch(`/api/pos/kds/tickets/${id}/recall`, { method: 'POST' })
    load()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d0b', color: '#fff',
      fontFamily: "'Manrope',system-ui,sans-serif", display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ background: '#0f1410', borderBottom: '1px solid rgba(127,184,151,0.15)',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#7FB897' }}>
          {STATION_LABELS[station] ?? station.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
        </span>
        <div style={{ flex: 1, display: 'flex', gap: 10, flexWrap: 'wrap', overflow: 'hidden' }}>
          {allDay.slice(0, 12).map(({ name, count }) => (
            <span key={name} style={{ fontSize: 11, background: 'rgba(127,184,151,0.1)',
              border: '1px solid rgba(127,184,151,0.2)', borderRadius: 6, padding: '2px 8px',
              color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>
              {count}× {name}
            </span>
          ))}
        </div>
      </div>

      {/* Ticket grid */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>
          Loading…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 48, opacity: 0.2 }}>✓</div>
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 14 }}>All clear — no open tickets</div>
        </div>
      ) : (
        <div style={{ flex: 1, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
          {tickets.map(ticket => {
            const item = ticket.pos_sale_items
            const sale = ticket.pos_sales
            const allergies = hasAllergy(item?.modifiers ?? null)
            const mods = (item?.modifiers ?? []) as KdsMod[]
            const isInProgress = ticket.status === 'in_progress'
            return (
              <div key={ticket.id}
                style={{ width: 240, background: '#131c15',
                  border: `2px solid ${isInProgress ? '#F59E0B' : 'rgba(127,184,151,0.2)'}`,
                  borderRadius: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                  boxShadow: isInProgress ? '0 0 16px rgba(245,158,11,0.2)' : 'none' }}>

                {/* Allergy banner */}
                {allergies.length > 0 && (
                  <div style={{ background: '#7F1D1D', padding: '5px 12px', fontSize: 11,
                    fontWeight: 900, color: '#FCA5A5', letterSpacing: '0.06em' }}>
                    ⚠ ALLERGY: {allergies.map(a => a.toUpperCase()).join(' · ')}
                  </div>
                )}

                {/* Header */}
                <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#7FB897' }}>
                      #{sale?.sale_number ?? '—'}
                    </span>
                    <TimerBadge firedAt={ticket.fired_at} />
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    {sale?.order_type && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                        {sale.order_type.replace(/_/g, ' ')}
                      </span>
                    )}
                    {(ticket.seat_number ?? item?.seat_number) && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(91,157,212,0.15)', color: '#93C5FD' }}>
                        Seat {ticket.seat_number ?? item?.seat_number}
                      </span>
                    )}
                    {(ticket.course ?? item?.course) && (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4,
                        background: 'rgba(167,139,250,0.15)', color: '#C4B5FD' }}>
                        Course {ticket.course ?? item?.course}
                      </span>
                    )}
                    {sale?.customer_name && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                        {sale.customer_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Item */}
                <div style={{ padding: '10px 12px', flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 4 }}>
                    {item?.quantity && item.quantity > 1 && (
                      <span style={{ color: '#7FB897', marginRight: 4 }}>{item.quantity}×</span>
                    )}
                    {item?.product_name ?? 'Item'}
                  </div>
                  {item?.variant_label && (
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                      {item.variant_label}
                    </div>
                  )}
                  {mods.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                      {mods.map((mod, i) => (
                        <span key={i} style={{
                          fontSize: 11, padding: '2px 7px', borderRadius: 5, fontWeight: 600,
                          background: mod.kds_color ? `${mod.kds_color}22` : 'rgba(255,255,255,0.06)',
                          color: mod.kds_color ?? 'rgba(255,255,255,0.65)',
                          border: `1px solid ${mod.kds_color ? `${mod.kds_color}55` : 'rgba(255,255,255,0.08)'}`,
                        }}>
                          {mod.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {item?.item_notes && (
                    <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4, fontStyle: 'italic' }}>
                      {item.item_notes}
                    </div>
                  )}
                  {sale?.notes && (
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                      {sale.notes}
                    </div>
                  )}
                </div>

                {/* BUMP button */}
                <button onClick={() => bump(ticket.id)}
                  style={{ margin: '0 12px 12px', padding: '12px 0', borderRadius: 10, border: 'none',
                    background: '#7FB897', color: '#0f1410', fontSize: 16, fontWeight: 900,
                    cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.04em' }}>
                  BUMP ✓
                </button>
                <button onClick={() => recall(ticket.id)}
                  style={{ margin: '-4px 12px 12px', padding: '6px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                    background: 'transparent', color: 'rgba(255,255,255,0.25)', fontSize: 11,
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  Recall
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}