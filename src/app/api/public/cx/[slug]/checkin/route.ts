export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getCxSession } from '@/lib/cx/get-cx-session'
import { resolveCxCustomer } from '@/lib/cx/resolve-cx-customer'
import { limit } from '@/lib/rate-limit'

// POST /api/public/cx/[slug]/checkin
// Body: { outlet_id: string }
// Auth: cx_session cookie (loyalty identity)
// Creates a check-in row that appears in the POS "Here now" list.
// Rate-limit: cancels any existing unexpired+unconsumed check-in for this identity first.
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const bid = await resolveBusinessId(supabaseAdmin, params.slug)
  if (!bid) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getCxSession(req, bid)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await limit('cx-checkin:identity:' + session.identity_id, { requests: 3, window: '15 m' })
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many check-ins. Please wait 15 minutes.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  let body: { outlet_id?: string } = {}
  try { body = await req.json() } catch { /* ok — outlet_id optional */ }

  const outletId = body.outlet_id ?? null

  // Validate outlet belongs to this business if provided
  if (outletId) {
    const { data: outlet } = await supabaseAdmin
      .from('pos_outlets')
      .select('id')
      .eq('id', outletId)
      .eq('business_id', bid)
      .maybeSingle()
    if (!outlet) return NextResponse.json({ error: 'Outlet not found' }, { status: 400 })
  }

  // Resolve customer for this business
  const customer = await resolveCxCustomer<{ id: string }>(session.identity_id, bid, 'id')

  // Expire any existing active check-ins for this identity (rate-limit: 1 active per identity)
  await supabaseAdmin
    .from('loyalty_checkins')
    .update({ consumed_at: new Date().toISOString() })
    .eq('loyalty_identity_id', session.identity_id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())

  // Insert new check-in
  const { data: checkin, error } = await supabaseAdmin
    .from('loyalty_checkins')
    .insert({
      business_id: bid,
      outlet_id: outletId,
      loyalty_identity_id: session.identity_id,
      customer_id: customer?.id ?? null,
    })
    .select('id, expires_at')
    .single()

  if (error) {
    console.error('[cx/checkin] insert error:', error.message)
    return NextResponse.json({ error: 'Check-in failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    checkin_id: checkin.id,
    expires_at: checkin.expires_at,
  })
}