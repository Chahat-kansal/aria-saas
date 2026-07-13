export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getAdminClient, isAdminEmail, logAdminAction } from '@/lib/admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// COST-LEDGER-1 — CRUD for fixed/recurring costs (cost_subscriptions). Founder-maintained by design:
// no provider-dashboard scraping, the admin enters/updates real figures here.

const CATEGORIES = new Set(['ai', 'sms', 'email', 'payment_fee', 'infra', 'other'])
const CADENCES = new Set(['monthly', 'yearly', 'one_time'])

async function requireAdmin() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

async function _GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = getAdminClient()
  const { data, error } = await db.from('cost_subscriptions').select('*').order('active', { ascending: false }).order('renewal_date', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subscriptions: data ?? [] })
}

async function _POST(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const provider = typeof body.provider === 'string' ? body.provider.trim() : ''
  const planName = typeof body.plan_name === 'string' ? body.plan_name.trim() : ''
  const amountUsdCents = Number(body.amount_usd_cents)
  const billingCadence = typeof body.billing_cadence === 'string' ? body.billing_cadence : ''
  const category = typeof body.category === 'string' ? body.category : ''

  if (!provider || !planName) return NextResponse.json({ error: 'provider and plan_name required' }, { status: 400 })
  if (!Number.isFinite(amountUsdCents) || amountUsdCents < 0) return NextResponse.json({ error: 'amount_usd_cents must be a non-negative number' }, { status: 400 })
  if (!CADENCES.has(billingCadence)) return NextResponse.json({ error: `billing_cadence must be one of ${[...CADENCES].join(', ')}` }, { status: 400 })
  if (!CATEGORIES.has(category)) return NextResponse.json({ error: `category must be one of ${[...CATEGORIES].join(', ')}` }, { status: 400 })

  const db = getAdminClient()
  const { data, error } = await db.from('cost_subscriptions').insert({
    provider, plan_name: planName, amount_usd_cents: Math.round(amountUsdCents), billing_cadence: billingCadence, category,
    renewal_date: typeof body.renewal_date === 'string' && body.renewal_date ? body.renewal_date : null,
    notes: typeof body.notes === 'string' ? body.notes : null,
    active: body.active !== false,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ admin_email: user.email!, action: 'create_cost_subscription', target_type: 'cost_subscription', target_id: data.id, details: { provider, plan_name: planName } })
  return NextResponse.json({ subscription: data })
}

async function _PATCH(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.provider === 'string') updates.provider = body.provider.trim()
  if (typeof body.plan_name === 'string') updates.plan_name = body.plan_name.trim()
  if (body.amount_usd_cents !== undefined) {
    const n = Number(body.amount_usd_cents)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'amount_usd_cents must be a non-negative number' }, { status: 400 })
    updates.amount_usd_cents = Math.round(n)
  }
  if (typeof body.billing_cadence === 'string') {
    if (!CADENCES.has(body.billing_cadence)) return NextResponse.json({ error: `billing_cadence must be one of ${[...CADENCES].join(', ')}` }, { status: 400 })
    updates.billing_cadence = body.billing_cadence
  }
  if (typeof body.category === 'string') {
    if (!CATEGORIES.has(body.category)) return NextResponse.json({ error: `category must be one of ${[...CATEGORIES].join(', ')}` }, { status: 400 })
    updates.category = body.category
  }
  if ('renewal_date' in body) updates.renewal_date = typeof body.renewal_date === 'string' && body.renewal_date ? body.renewal_date : null
  if ('notes' in body) updates.notes = typeof body.notes === 'string' ? body.notes : null
  if ('active' in body) updates.active = body.active === true

  const db = getAdminClient()
  const { data, error } = await db.from('cost_subscriptions').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ admin_email: user.email!, action: 'update_cost_subscription', target_type: 'cost_subscription', target_id: id, details: updates })
  return NextResponse.json({ subscription: data })
}

async function _DELETE(req: Request) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const db = getAdminClient()
  // Soft delete (active=false) rather than a hard DELETE — keeps the fixed-cost history intact
  // for any month that already included this subscription in its allocation.
  const { error } = await db.from('cost_subscriptions').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction({ admin_email: user.email!, action: 'deactivate_cost_subscription', target_type: 'cost_subscription', target_id: id, details: {} })
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('admin/cost-subscriptions', _GET)
export const POST = withErrorCapture('admin/cost-subscriptions', _POST)
export const PATCH = withErrorCapture('admin/cost-subscriptions', _PATCH)
export const DELETE = withErrorCapture('admin/cost-subscriptions', _DELETE)
