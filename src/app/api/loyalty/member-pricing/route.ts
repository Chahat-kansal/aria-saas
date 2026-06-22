export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

// LOY-MEMBER-PRICING (owner config) — reuses the EXISTING discount machinery: a "Members" customer
// group + an auto `pos_promotions` row scoped to it. The POS discount engine (calculateApplicableDiscounts)
// already auto-applies group-scoped promotions to an attached customer in that group, so loyalty members
// get the member price instantly at checkout with ZERO changes to the terminal/sale path. Owner-scoped.

const GROUP_NAME = 'Members'
const PROMO_NAME = 'Member pricing'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function requireOwner(): Promise<{ bid: string } | { error: NextResponse }> {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const bid = await getBid(supabase, user.id)
  if (!bid) return { error: NextResponse.json({ error: 'No business' }, { status: 400 }) }
  return { bid }
}

async function _GET() {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const { data: promo } = await supabaseAdmin.from('pos_promotions')
    .select('discount_percent, active').eq('business_id', r.bid).eq('name', PROMO_NAME).maybeSingle()
  return NextResponse.json({ enabled: !!promo?.active, percent: Number(promo?.discount_percent ?? 0) })
}

async function _POST(req: Request) {
  const r = await requireOwner()
  if ('error' in r) return r.error
  const body = await req.json().catch(() => ({})) as { enabled?: boolean; percent?: number }
  const enabled = !!body.enabled
  const percent = Math.max(0, Math.min(90, Math.round(Number(body.percent) || 0)))
  if (enabled && percent <= 0) return NextResponse.json({ error: 'Set a member discount above 0%.' }, { status: 400 })

  // 1) The "Members" group holds the configured % (the owner-facing value).
  const { data: existingGroup } = await supabaseAdmin.from('pos_customer_groups')
    .select('id').eq('business_id', r.bid).eq('name', GROUP_NAME).maybeSingle()
  let groupId = existingGroup?.id as string | undefined
  if (groupId) {
    await supabaseAdmin.from('pos_customer_groups').update({ discount_percent: percent }).eq('id', groupId)
  } else {
    const { data: created } = await supabaseAdmin.from('pos_customer_groups')
      .insert({ business_id: r.bid, name: GROUP_NAME, discount_percent: percent }).select('id').single()
    groupId = created?.id as string
  }

  // 2) An AUTO-applied promotion scoped to that group — what the existing engine applies at checkout.
  //    The engine only auto-applies AUTO_TYPES (combo/happy_hour/bogo/bogo_half/free_item); a plain
  //    'percent_off' is cashier-picked (manual). 'happy_hour' computes the same % off AND auto-applies,
  //    so with no hour/day restriction it's an all-day automatic member % off. stacks_with_others=false
  //    → member pricing never double-discounts with another promotion (the safe stacking rule).
  const promoFields = {
    business_id: r.bid, name: PROMO_NAME, promotion_type: 'happy_hour', applies_to: 'all',
    discount_percent: percent, active: enabled, requires_code: null,
    active_hour_start: null, active_hour_end: null, active_days: null,
    stacks_with_others: false, stack_priority: 100, customer_group_id: groupId,
  }
  const { data: existingPromo } = await supabaseAdmin.from('pos_promotions')
    .select('id').eq('business_id', r.bid).eq('name', PROMO_NAME).maybeSingle()
  if (existingPromo) {
    await supabaseAdmin.from('pos_promotions').update(promoFields).eq('id', existingPromo.id)
  } else {
    await supabaseAdmin.from('pos_promotions').insert(promoFields)
  }

  // 3) On enable, put existing loyalty members of THIS business into the Members group (only if they
  //    have no group yet — never clobber an owner-assigned group).
  if (enabled && groupId) {
    await supabaseAdmin.from('pos_customers')
      .update({ customer_group_id: groupId })
      .eq('business_id', r.bid).not('loyalty_identity_id', 'is', null).is('customer_group_id', null)
  }

  return NextResponse.json({ ok: true, enabled, percent })
}

export const GET = withErrorCapture('loyalty/member-pricing:get', _GET)
export const POST = withErrorCapture('loyalty/member-pricing:post', _POST)
