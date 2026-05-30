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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const date = searchParams.get('date')
  const service_id = searchParams.get('service_id')
  if (!business_id || !date) return NextResponse.json({ error: 'business_id and date required' }, { status: 400 })

  const dow = new Date(date + 'T12:00:00').getDay()

  const [availRes, svcRes, existRes] = await Promise.all([
    supabaseAdmin.from('booking_availability').select('start_time,end_time,buffer_minutes,is_available')
      .eq('business_id', business_id).eq('day_of_week', dow).maybeSingle(),
    service_id
      ? supabaseAdmin.from('booking_services').select('duration_minutes').eq('id', service_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('bookings').select('booking_time,duration_minutes')
      .eq('business_id', business_id)
      .gte('booking_date', date)
      .lt('booking_date', nextDay(date))
      .neq('status', 'cancelled'),
  ])

  const avail = availRes.data
  if (!avail?.is_available) return NextResponse.json({ slots: [] })

  const duration = (svcRes?.data as { duration_minutes: number } | null)?.duration_minutes ?? 60
  const buffer = (avail.buffer_minutes as number) ?? 15
  const startMin = toMin(avail.start_time as string) ?? 540
  const endMin = toMin(avail.end_time as string) ?? 1020

  const booked = ((existRes.data ?? []) as Array<{ booking_time: string | null; duration_minutes: number | null }>)
    .map(b => ({ start: toMin(b.booking_time), dur: b.duration_minutes ?? 60 }))
    .filter((b): b is { start: number; dur: number } => b.start !== null)

  const slots: string[] = []
  const availability: { time: string; available: boolean }[] = []
  for (let t = startMin; t + duration <= endMin; t += 30) {
    const conflict = booked.some(b => {
      const bEnd = b.start + b.dur + buffer
      return !(t + duration <= b.start || t >= bEnd)
    })
    const time = toHHMM(t)
    if (!conflict) slots.push(time)
    availability.push({ time, available: !conflict })
  }

  return NextResponse.json({ slots, availability })
}
