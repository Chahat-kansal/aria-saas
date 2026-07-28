export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { QUIET_HOURS_LABEL } from '@/lib/push/notifyOwner'

// OWNER-APP PH-4 — subscription management for owner push. Method-switched (GET status,
// POST subscribe, DELETE disable) to stay inside the Vercel fn budget.

// GET /api/owner/push?business_id=X — status for the settings/enable UI
async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  const { count } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', business_id).eq('user_id', user.id).eq('disabled', false)

  return NextResponse.json({
    devices: count ?? 0,
    // The public key is safe to ship to the browser by design (the private half stays server-side).
    // Null when VAPID isn't configured — the UI then explains push is unavailable rather than
    // throwing an opaque browser error.
    vapid_public_key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY ?? null,
    quiet_hours: QUIET_HOURS_LABEL,
  })
}

// POST /api/owner/push { business_id, subscription } — register this device
async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    business_id?: string
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  }
  const { business_id, subscription } = body
  if (!business_id || !subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json({ error: 'business_id and a complete subscription are required' }, { status: 400 })
  }

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  // Upsert on the unique endpoint — re-subscribing the same device (or re-enabling a previously
  // disabled one) updates in place rather than accumulating duplicate rows.
  const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
    business_id,
    user_id: user.id,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    user_agent: req.headers.get('user-agent') ?? null,
    last_seen_at: new Date().toISOString(),
    disabled: false,
  }, { onConflict: 'endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/owner/push { business_id, endpoint? } — turn push off (all devices, or just this one)
async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { business_id?: string; endpoint?: string }
  const { business_id, endpoint } = body
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const denied = await verifyBusinessAccess(user.id, business_id)
  if (denied) return denied

  // Disable rather than delete — keeps the device row so re-enabling is one tap, and preserves the
  // history of which devices were ever registered (RULE0: never destroy what can be reversed).
  let q = supabaseAdmin.from('push_subscriptions').update({ disabled: true })
    .eq('business_id', business_id).eq('user_id', user.id)
  if (endpoint) q = q.eq('endpoint', endpoint)
  const { error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('owner/push', _GET)
export const POST = withErrorCapture('owner/push', _POST)
export const DELETE = withErrorCapture('owner/push', _DELETE)
