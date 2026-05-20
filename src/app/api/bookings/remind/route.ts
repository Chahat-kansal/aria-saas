export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id, business_id } = await req.json()
  if (!booking_id || !business_id) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data: booking } = await supabaseAdmin.from('bookings')
    .select('*, businesses(name, phone)')
    .eq('id', booking_id).eq('business_id', business_id).maybeSingle()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!booking.customer_phone) return NextResponse.json({ error: 'No phone number' }, { status: 400 })

  const bizName = (booking.businesses as Record<string,unknown>)?.name ?? 'Your booking'
  const date = new Date(booking.booking_date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = booking.booking_time ? (() => {
    const [h, m] = booking.booking_time.split(':')
    const hr = parseInt(h)
    return `${hr > 12 ? hr - 12 : hr || 12}:${m}${hr >= 12 ? 'pm' : 'am'}`
  })() : ''

  const message = `Hi ${booking.customer_name}! Just a reminder about your booking at ${bizName} tomorrow — ${date}${time ? ` at ${time}` : ''}${booking.party_size > 1 ? ` for ${booking.party_size} people` : ''}. See you then! 😊`

  // Send via Twilio
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !from) {
    return NextResponse.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  const phone = booking.customer_phone.replace(/\s/g, '').replace(/^0/, '+61')

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: from, Body: message }).toString(),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: (err as Record<string,unknown>).message ?? 'SMS failed' }, { status: 500 })
  }

  // Mark reminder sent
  await supabaseAdmin.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', booking_id)

  return NextResponse.json({ ok: true, message })
}
