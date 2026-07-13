export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { rateLimit, tooManyRequests, clientIp } from '@/lib/security/rate-limit'
import { requireTurnstile } from '@/lib/security/turnstile'

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const realId = await resolveBusinessId(db, business_id)
  if (!realId) return NextResponse.json({ services: [], hours: [] })
  const { data: services } = await db.from('booking_services')
    .select('id,name,description,duration_minutes,price,max_party_size,color')
    .eq('business_id', realId).eq('is_active', true).order('name')
  const { data: hours } = await db.from('business_hours')
    .select('day_of_week,open_time,close_time,is_closed')
    .eq('business_id', realId).order('day_of_week')
  return NextResponse.json({ services: services ?? [], hours: hours ?? [] })
}

export async function POST(req: Request, { params }: Params) {
  // SECURITY-P1 (H-03) — this route had no rate limit at all: unlimited bookings + Resend email
  // pumping for any business. 5 bookings / 15 min per IP+business (a genuine customer books once,
  // not repeatedly within minutes).
  const ip = clientIp(req)
  const { business_id } = 'then' in params ? await params : params
  const rl = await rateLimit(`public-booking:${ip}:${business_id}`, 5, 900)
  if (!rl.allowed) return tooManyRequests(rl.retryAfter)

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const realId = await resolveBusinessId(db, business_id)
  if (!realId) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  const { data: biz } = await db.from('businesses').select('id,name').eq('id', realId).eq('is_active', true).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })
  const body = await req.json() as Record<string, unknown>

  const turnstileDenied = await requireTurnstile(body.turnstile_token as string | undefined, ip)
  if (turnstileDenied) return turnstileDenied

  const { service_id, customer_name, customer_email, customer_phone, booking_date, booking_time, party_size, notes } = body
  if (!customer_name || !booking_date) return NextResponse.json({ error: 'customer_name and booking_date required' }, { status: 400 })
  const { data, error } = await db.from('bookings').insert({
    business_id: realId, service_id: service_id || null, customer_name,
    customer_email: customer_email || null, customer_phone: customer_phone || null,
    booking_date, booking_time: booking_time || null, party_size: party_size || 1,
    status: 'confirmed', source: 'public_form', notes: notes || null,
    confirmed_at: new Date().toISOString(),
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data, business_name: (biz as Record<string,unknown>).name })
}
