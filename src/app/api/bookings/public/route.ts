export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'

async function sendConfirmationEmail(opts: {
  to: string; customerName: string; businessName: string
  bookingDate: string; bookingTime: string | null
  slug: string | null; token: string
}) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const from = process.env.RESEND_FROM_DOMAIN
    ? `${opts.businessName} <bookings@${process.env.RESEND_FROM_DOMAIN}>`
    : `Bookings <bookings@${process.env.RESEND_FROM_DOMAIN ?? 'ariaos.site'}>`
  const manageUrl = opts.slug ? `${APP_URL}/book/${opts.slug}/manage?token=${opts.token}` : null
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: opts.to,
      subject: `Booking confirmed — ${opts.businessName}`,
      html: `<p>Hi ${opts.customerName},</p><p>Your booking at <strong>${opts.businessName}</strong> is confirmed.</p><p>📅 ${opts.bookingDate}${opts.bookingTime ? ` at ${opts.bookingTime}` : ''}</p>${manageUrl ? `<p><a href="${manageUrl}">Cancel or reschedule your booking</a></p>` : ''}<p>See you soon!</p>`,
    }),
  }).catch(() => {})
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')
  const token = searchParams.get('token')

  if (token) {
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*,booking_services(name,duration_minutes,color,price)')
      .eq('booking_token', token)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const cleaned = { ...data, booking_date: data.booking_date ? String(data.booking_date).slice(0, 10) : data.booking_date }
    return NextResponse.json({ booking: cleaned })
  }

  if (slug) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,booking_link_slug')
      .eq('booking_link_slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const { data: services } = await supabaseAdmin
      .from('booking_services')
      .select('id,name,duration_minutes,price,color,description,max_party_size')
      .eq('business_id', (biz as { id: string }).id)
      .eq('is_active', true)
      .order('name')
    return NextResponse.json({ business: biz, services: services ?? [] })
  }

  return NextResponse.json({ error: 'slug or token required' }, { status: 400 })
}

export async function POST(req: Request) {
  const body = await req.json() as Record<string, unknown>
  const { business_id, service_id, customer_name, customer_email, customer_phone, booking_date, booking_time, notes, party_size } = body
  if (!business_id || !booking_date || !customer_name) {
    return NextResponse.json({ error: 'business_id, booking_date, customer_name required' }, { status: 400 })
  }

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id,name,booking_link_slug')
    .eq('id', business_id as string)
    .eq('is_active', true)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  let duration_minutes = 60
  if (service_id) {
    const { data: svc } = await supabaseAdmin
      .from('booking_services')
      .select('duration_minutes')
      .eq('id', service_id as string)
      .maybeSingle()
    if (svc) duration_minutes = (svc as { duration_minutes: number }).duration_minutes
  }

  const { data, error } = await supabaseAdmin.from('bookings').insert({
    business_id, service_id: service_id || null,
    customer_name, customer_email: customer_email || null,
    customer_phone: customer_phone || null,
    booking_date, booking_time: booking_time || null,
    party_size: party_size || 1, duration_minutes,
    notes: notes || null, status: 'confirmed', source: 'online',
    confirmed_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const b = biz as { name: string; booking_link_slug: string | null }
  const cleaned = { ...data, booking_date: data.booking_date ? String(data.booking_date).slice(0, 10) : data.booking_date }

  if (customer_email && data.booking_token) {
    await sendConfirmationEmail({
      to: customer_email as string, customerName: customer_name as string,
      businessName: b.name, bookingDate: String(booking_date),
      bookingTime: booking_time as string | null,
      slug: b.booking_link_slug, token: data.booking_token as string,
    })
  }

  return NextResponse.json({ booking: cleaned })
}

export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const { data: existing } = await supabaseAdmin
    .from('bookings')
    .select('id,status,booking_time')
    .eq('booking_token', token)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ex = existing as { id: string; status: string; booking_time: string | null }
  if (ex.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>
  const { action, booking_date, booking_time, cancellation_reason } = body

  if (action === 'cancel') {
    const { data, error } = await supabaseAdmin.from('bookings').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
      cancellation_reason: cancellation_reason || 'Customer cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', ex.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const cleaned = { ...data, booking_date: data.booking_date ? String(data.booking_date).slice(0, 10) : data.booking_date }
    return NextResponse.json({ booking: cleaned })
  }

  if (action === 'reschedule') {
    if (!booking_date) return NextResponse.json({ error: 'booking_date required' }, { status: 400 })
    const { data, error } = await supabaseAdmin.from('bookings').update({
      booking_date, booking_time: booking_time ?? ex.booking_time,
      updated_at: new Date().toISOString(),
    }).eq('id', ex.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const cleaned = { ...data, booking_date: data.booking_date ? String(data.booking_date).slice(0, 10) : data.booking_date }
    return NextResponse.json({ booking: cleaned })
  }

  return NextResponse.json({ error: 'action must be cancel or reschedule' }, { status: 400 })
}
