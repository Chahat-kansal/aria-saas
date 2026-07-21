export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

function toMin(t: string | null): number | null {
  if (!t) return null
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] ?? 0)
}

function toHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

function nextDay(date: string): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

interface PosTableRow {
  id: string
  name: string | null
  display_name: string | null
  seats: number | null
  shape: string | null
  pos_x: number | null
  pos_y: number | null
  width: number | null
  height: number | null
  rotation: number | null
  seating_area: string | null
  is_guest_selectable: boolean | null
  element_type: string | null
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const date = searchParams.get('date')
  const service_id = searchParams.get('service_id')
  const time = searchParams.get('time') // when set, also return per-table/area breakdown for this exact slot
  const partySize = Math.max(1, parseInt(searchParams.get('party_size') ?? '1') || 1)
  if (!business_id || !date) return NextResponse.json({ error: 'business_id and date required' }, { status: 400 })

  const dow = new Date(date + 'T12:00:00').getDay()

  const [availRes, svcRes, existRes, bizRes, tablesRes] = await Promise.all([
    supabaseAdmin.from('booking_availability').select('start_time,end_time,buffer_minutes,is_available')
      .eq('business_id', business_id).eq('day_of_week', dow).maybeSingle(),
    service_id
      ? supabaseAdmin.from('booking_services').select('duration_minutes').eq('id', service_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('bookings').select('booking_time,duration_minutes,table_id')
      .eq('business_id', business_id)
      .gte('booking_date', date)
      .lt('booking_date', nextDay(date))
      .neq('status', 'cancelled'),
    supabaseAdmin.from('businesses').select('booking_table_mode').eq('id', business_id).maybeSingle(),
    supabaseAdmin.from('pos_tables')
      .select('id,name,display_name,seats,shape,pos_x,pos_y,width,height,rotation,seating_area,is_guest_selectable,element_type')
      .eq('business_id', business_id)
      .is('archived_at', null),
  ])

  if (availRes.error) return NextResponse.json({ error: availRes.error.message, slots: [] }, { status: 500 })
  const avail = availRes.data
  if (!avail?.is_available) return NextResponse.json({ slots: [] })

  const duration = (svcRes?.data as { duration_minutes: number } | null)?.duration_minutes ?? 60
  const buffer = (avail.buffer_minutes as number) ?? 15
  const startMin = toMin(avail.start_time as string) ?? 540
  const endMin = toMin(avail.end_time as string) ?? 1020

  const bookedRaw = (existRes.data ?? []) as Array<{ booking_time: string | null; duration_minutes: number | null; table_id: string | null }>
  const booked = bookedRaw
    .map(b => ({ start: toMin(b.booking_time), dur: b.duration_minutes ?? 60, table_id: b.table_id }))
    .filter((b): b is { start: number; dur: number; table_id: string | null } => b.start !== null)

  const mode = (bizRes.data as { booking_table_mode?: string } | null)?.booking_table_mode ?? 'auto'
  const allRows = (tablesRes.data ?? []) as PosTableRow[]
  const bookableTables = allRows.filter(t => (t.element_type ?? 'table') === 'table')
  const decorativeElements = allRows.filter(t => (t.element_type ?? 'table') !== 'table')
  // FLOOR-1: only tables the mode actually lets a guest reach count toward "table" mode's slot
  // eligibility (a slot the confirm step can't fulfil must never show as bookable). auto/area use
  // any real table with enough seats — the customer never picks a specific one in those modes.
  const eligibleTables = bookableTables.filter(t => (t.seats ?? 0) >= partySize && (mode !== 'table' || t.is_guest_selectable))
  const hasTables = bookableTables.length > 0

  function tableFreeAt(tableId: string, t: number): boolean {
    return !booked.some(b => {
      if (b.table_id !== tableId) return false
      const bEnd = b.start + b.dur + buffer
      return !(t + duration <= b.start || t >= bEnd)
    })
  }

  function slotAvailable(t: number): boolean {
    if (!hasTables) {
      // No floor plan configured for this business at all — fall back to the original
      // business-wide conflict check exactly as before FLOOR-1 (graceful degrade).
      return !booked.some(b => {
        const bEnd = b.start + b.dur + buffer
        return !(t + duration <= b.start || t >= bEnd)
      })
    }
    return eligibleTables.some(tb => tableFreeAt(tb.id, t))
  }

  const slots: string[] = []
  const availability: { time: string; available: boolean }[] = []
  for (let t = startMin; t + duration <= endMin; t += 30) {
    const ok = slotAvailable(t)
    const timeStr = toHHMM(t)
    if (ok) slots.push(timeStr)
    availability.push({ time: timeStr, available: ok })
  }

  const payload: Record<string, unknown> = { slots, availability }

  if (time && hasTables) {
    const t = toMin(time)
    if (t !== null) {
      const freeTables = eligibleTables
        .filter(tb => tableFreeAt(tb.id, t))
        .map(tb => tb.id)

      const toElement = (tb: PosTableRow, free?: boolean) => ({
        id: tb.id,
        element_type: (tb.element_type ?? 'table') as 'table' | 'bar' | 'counter' | 'kitchen' | 'entrance' | 'wall' | 'plant',
        name: tb.name || 'Table',
        display_name: tb.display_name,
        seats: tb.seats ?? 0,
        shape: (tb.shape ?? 'square') as 'square' | 'round' | 'rectangle' | 'booth',
        pos_x: tb.pos_x ?? 0,
        pos_y: tb.pos_y ?? 0,
        width: tb.width ?? 72,
        height: tb.height ?? 72,
        rotation: tb.rotation ?? 0,
        seating_area: tb.seating_area,
        free,
      })

      // Only tables the current mode makes reachable are drawn — a customer in 'table' mode
      // should never see (or be confused by) an owner-only table on the same canvas.
      payload.elements = [
        ...eligibleTables.map(tb => toElement(tb, freeTables.includes(tb.id))),
        ...decorativeElements.map(tb => toElement(tb)),
      ]

      const areaMap = new Map<string, { area: string; free: number; total: number }>()
      for (const tb of eligibleTables) {
        const area = tb.seating_area || 'General'
        const entry = areaMap.get(area) ?? { area, free: 0, total: 0 }
        entry.total += 1
        if (freeTables.includes(tb.id)) entry.free += 1
        areaMap.set(area, entry)
      }
      payload.areas = Array.from(areaMap.values())
      payload.booking_table_mode = mode
    }
  }

  return NextResponse.json(payload)
}
