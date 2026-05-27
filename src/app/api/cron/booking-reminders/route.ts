export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { NextResponse } from 'next/server'

function toMin(t: string | null): number | null {
  if (!t) return null
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] ?? 0)
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  let sent24h = 0, sent2h = 0, noShows = 0

  // 24h reminders — bookings tomorrow, status confirmed, has phone, not yet sent
  const { data: tomorrowBookings } = await supabaseAdmin
    .from('bookings')
    .select('id,customer_name,customer_phone,booking_time')
    .eq('booking_date', tomorrowStr)
    .eq('status', 'confirmed')
    .not('customer_phone', 'is', null)

  for (const b of tomorrowBookings ?? []) {
    const { data: already } = await supabaseAdmin
      .from('booking_reminder_log')
      .select('id')
      .eq('booking_id', b.id)
      .eq('reminder_type', '24h')
      .maybeSingle()
    if (already) continue

    const timeStr = b.booking_time ? ` at ${String(b.booking_time).slice(0, 5)}` : ''
    const result = await sendSMS(
      b.customer_phone as string,
      `Hi ${b.customer_name}, reminder: you have a booking tomorrow${timeStr}. Reply STOP to opt out.`
    )
    if (result.ok) {
      await supabaseAdmin.from('booking_reminder_log').insert({
        booking_id: b.id, reminder_type: '24h', channel: 'sms', sent_at: new Date().toISOString(),
      })
      sent24h++
    }
  }

  // 2h reminders — bookings today, status confirmed, booking time in 100-140 min from now
  const { data: todayBookings } = await supabaseAdmin
    .from('bookings')
    .select('id,customer_name,customer_phone,booking_time')
    .eq('booking_date', todayStr)
    .eq('status', 'confirmed')
    .not('customer_phone', 'is', null)

  for (const b of todayBookings ?? []) {
    const bookingMin = toMin(b.booking_time as string | null)
    if (bookingMin === null) continue
    const diff = bookingMin - nowMin
    if (diff < 100 || diff > 140) continue

    const { data: already } = await supabaseAdmin
      .from('booking_reminder_log')
      .select('id')
      .eq('booking_id', b.id)
      .eq('reminder_type', '2h')
      .maybeSingle()
    if (already) continue

    const result = await sendSMS(
      b.customer_phone as string,
      `Hi ${b.customer_name}, your booking is in about 2 hours (${String(b.booking_time).slice(0, 5)}). See you soon!`
    )
    if (result.ok) {
      await supabaseAdmin.from('booking_reminder_log').insert({
        booking_id: b.id, reminder_type: '2h', channel: 'sms', sent_at: new Date().toISOString(),
      })
      sent2h++
    }
  }

  // No-show detection — confirmed bookings today that ended 30+ min ago
  const { data: confirmedToday } = await supabaseAdmin
    .from('bookings')
    .select('id,booking_time,duration_minutes')
    .eq('booking_date', todayStr)
    .eq('status', 'confirmed')

  const idsToMark: string[] = []
  for (const b of confirmedToday ?? []) {
    const bookingMin = toMin(b.booking_time as string | null)
    if (bookingMin === null) continue
    const endMin = bookingMin + ((b.duration_minutes as number | null) ?? 60)
    if (nowMin >= endMin + 30) idsToMark.push(b.id as string)
  }

  if (idsToMark.length > 0) {
    await supabaseAdmin.from('bookings')
      .update({ status: 'no_show', updated_at: new Date().toISOString() })
      .in('id', idsToMark)
    noShows = idsToMark.length
  }

  return NextResponse.json({ sent24h, sent2h, noShows })
}
