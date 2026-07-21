export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { NextResponse } from 'next/server'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'

async function sendResendEmail(to: string, subject: string, html: string, businessName?: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) return
  const from = `${businessName ?? 'Bookings'} <bookings@${process.env.RESEND_FROM_DOMAIN ?? 'ariaos.site'}>`
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  }).catch(() => {})
}

async function sendConfirmationEmail(opts: {
  to: string; customerName: string; businessName: string
  bookingDate: string; bookingTime: string | null
  slug: string | null; token: string
}) {
  const manageUrl = opts.slug ? APP_URL + '/book/' + opts.slug + '/manage?token=' + opts.token : null
  const cancelUrl = APP_URL + '/book/cancel/' + opts.token
  await sendResendEmail(
    opts.to,
    'Booking confirmed — ' + opts.businessName,
    '<p>Hi ' + opts.customerName + ',</p><p>Your booking at <strong>' + opts.businessName + '</strong> is confirmed.</p><p>📅 ' + opts.bookingDate + (opts.bookingTime ? ' at ' + opts.bookingTime : '') + '</p>' + (manageUrl ? '<p><a href="' + manageUrl + '">Reschedule your booking</a></p>' : '') + '<p><a href="' + cancelUrl + '">Cancel your booking</a></p><p>See you soon!</p>',
    opts.businessName
  )
}

async function sendCancellationEmail(to: string, customerName: string, businessName: string, bookingDate: string) {
  await sendResendEmail(
    to,
    'Booking cancelled — ' + businessName,
    '<p>Hi ' + customerName + ',</p><p>Your booking at <strong>' + businessName + '</strong> on ' + bookingDate + ' has been cancelled.</p><p>We hope to see you again soon!</p>',
    businessName
  )
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')
  const token = searchParams.get('token')

  if (token) {
    const { data } = await supabaseAdmin
      .from('bookings')
      .select('*,booking_services(name,duration_minutes,color,price),businesses(name,booking_link_slug)')
      .eq('booking_token', token)
      .maybeSingle()
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const cleaned = { ...data, booking_date: data.booking_date ? String(data.booking_date).slice(0, 10) : data.booking_date }
    return NextResponse.json({ booking: cleaned })
  }

  if (slug) {
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('id,name,industry,booking_link_slug,bookings_enabled')
      .eq('booking_link_slug', slug)
      .eq('is_active', true)
      .eq('bookings_enabled', true)
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

  // BOOKINGS-PUBLIC-PROTECT-1 — this is the route the live booking page (src/app/book/[slug]/
  // page.tsx) actually calls. SECURITY-P1 had shipped this exact rate-limit + Turnstile pattern
  // onto a sibling route (src/app/api/public/bookings/[business_id]/route.ts) that turned out to
  // have zero live callers — this route, the real one, had neither. Reusing the sibling's proven
  // helpers, not a second implementation.
  const ip = clientIp(req)
  const rl = await rateLimit(`public-booking:${ip}:${business_id}`, 5, 900)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const turnstileDenied = await requireTurnstile(body.turnstile_token as string | undefined, ip)
  if (turnstileDenied) return turnstileDenied

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('id,name,booking_link_slug')
    .eq('id', business_id as string)
    .eq('is_active', true)
    .eq('bookings_enabled', true)
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
    notes: notes || null, status: 'confirmed', source: 'public_form',
    confirmed_at: new Date().toISOString(),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Owner-facing audit trail — never surfaced to the public caller.
  void supabaseAdmin.from('activity_log').insert({
    business_id, action_type: 'public_booking_created',
    description: '[bookings/public] public booking form submission',
    metadata: { booking_id: data.id, booking_date, service_id: service_id || null },
    created_at: new Date().toISOString(),
  }).then(({ error: logErr }) => { if (logErr) console.error('[non-fatal] activity_log insert failed', logErr) })

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
    .select('id,status,booking_time,booking_date,business_id,service_id,customer_email,customer_name,businesses(name,booking_link_slug)')
    .eq('booking_token', token)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const ex = existing as unknown as { id: string; status: string; booking_time: string | null; booking_date: string | null; business_id: string; service_id: string | null; customer_email: string | null; customer_name: string; businesses: { name: string; booking_link_slug: string | null } | null }
  if (ex.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })

  const body = await req.json() as Record<string, unknown>
  const { action, booking_date, booking_time, cancellation_reason } = body

  if (action === 'cancel') {
    const { data, error } = await supabaseAdmin.from('bookings').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
      cancellation_reason: (cancellation_reason as string) || 'Customer cancelled',
      updated_at: new Date().toISOString(),
    }).eq('id', ex.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Free the booking slot (best-effort)
    if (ex.service_id && ex.booking_date && ex.booking_time) {
      const slotDate = String(ex.booking_date).slice(0, 10)
      const slotTime = String(ex.booking_time).slice(0, 5)
      const { data: slot } = await supabaseAdmin.from('booking_slots')
        .select('id,current_bookings')
        .eq('business_id', ex.business_id)
        .eq('service_id', ex.service_id)
        .eq('slot_date', slotDate)
        .eq('slot_time', slotTime)
        .maybeSingle()
      if (slot) {
        await supabaseAdmin.from('booking_slots')
          .update({ current_bookings: Math.max(0, Number(slot.current_bookings ?? 1) - 1) })
          .eq('id', (slot as { id: string }).id)
      }
    }

    // Send cancellation email (best-effort)
    if (ex.customer_email) {
      const bizName = ex.businesses?.name ?? 'your provider'
      const bookingDate = ex.booking_date ? String(ex.booking_date).slice(0, 10) : ''
      await sendCancellationEmail(ex.customer_email, ex.customer_name, bizName, bookingDate)
    }

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
