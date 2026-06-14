export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'

function toMin(t: string | null): number | null {
  if (!t) return null
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + (parts[1] ?? 0)
}

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().slice(0, 10)
  const nowMin = now.getHours() * 60 + now.getMinutes()

  let sent24h = 0, sent24hEmail = 0, sent2h = 0, noShows = 0

  // 24h SMS reminders — tomorrow, confirmed, has phone
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
      await supabaseAdmin.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id)
      sent24h++
    }
  }

  // 24h email fallback — tomorrow, confirmed, no phone but has email, reminder_sent_at IS NULL
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const { data: emailBookings } = await supabaseAdmin
      .from('bookings')
      .select('id,customer_name,customer_email,booking_time,business_id,booking_token')
      .eq('booking_date', tomorrowStr)
      .eq('status', 'confirmed')
      .is('customer_phone', null)
      .not('customer_email', 'is', null)
      .is('reminder_sent_at', null)

    for (const b of emailBookings ?? []) {
      const { data: already } = await supabaseAdmin
        .from('booking_reminder_log')
        .select('id')
        .eq('booking_id', b.id)
        .eq('reminder_type', '24h')
        .maybeSingle()
      if (already) continue

      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', b.business_id as string).maybeSingle()
      const bizName = (biz as { name?: string } | null)?.name ?? 'your provider'
      const timeStr = b.booking_time ? ' at ' + String(b.booking_time).slice(0, 5) : ''
      const cancelUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site') + '/book/cancel/' + b.booking_token
      const html = '<p>Hi ' + b.customer_name + ',</p><p>Reminder: you have a booking at <strong>' + bizName + '</strong> tomorrow' + timeStr + '.</p><p><a href="' + cancelUrl + '">Cancel your booking</a></p>'

      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Bookings <bookings@' + (process.env.RESEND_FROM_DOMAIN ?? 'ariaos.site') + '>',
          to: b.customer_email as string,
          subject: 'Reminder: your booking tomorrow at ' + bizName,
          html,
        }),
      }).catch(() => null)

      if (emailRes?.ok) {
        await supabaseAdmin.from('booking_reminder_log').insert({
          booking_id: b.id, reminder_type: '24h', channel: 'email', sent_at: new Date().toISOString(),
        })
        await supabaseAdmin.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id)
        sent24hEmail++
      }
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

  return NextResponse.json({ sent24h, sent24hEmail, sent2h, noShows })
}
