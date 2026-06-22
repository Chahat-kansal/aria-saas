export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { getLoyaltyMembership } from '@/lib/loyalty/auth'
import { getTierConfig, tierForBalance, getActivePerks } from '@/lib/loyalty/tiers'

// LOY-TIER-PERKS — owner CRUD for per-tier perks (getBid-scoped) and a customer view of their OWN tier +
// perks (identity+business scoped; tier derived from real points_balance).

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// CUSTOMER: GET ?business_id=… → my tier + the perks for my tier.
async function customerView(bidParam: string) {
  const realId = await resolveBusinessId(supabaseAdmin, bidParam)
  if (!realId) return NextResponse.json({ tier: null, perks: [] })
  const m = await getLoyaltyMembership(realId)
  if (!m) return NextResponse.json({ tier: null, perks: [] })
  const { data: cust } = await supabaseAdmin.from('pos_customers').select('points_balance').eq('id', m.customer_id).maybeSingle()
  const cfg = await getTierConfig(realId)
  const balance = Number(cust?.points_balance ?? 0)
  const tier = tierForBalance(balance, cfg)
  const perks = tier ? await getActivePerks(realId, tier) : []
  const nextTier = tier === 'silver' ? 'gold' : tier === 'gold' ? 'platinum' : tier === null ? 'silver' : null
  const nextThreshold = nextTier === 'silver' ? cfg.silver : nextTier === 'gold' ? cfg.gold : nextTier === 'platinum' ? cfg.platinum : null
  return NextResponse.json({
    tier, balance, next_tier: nextTier, to_next: nextThreshold != null ? Math.max(0, nextThreshold - balance) : null,
    perks: perks.map(p => ({ perk_type: p.perk_type, perk_value: p.perk_value, config: p.config })),
  })
}

async function _GET(req: Request) {
  const url = new URL(req.url)
  const owner = url.searchParams.get('owner') === '1'
  const bidParam = url.searchParams.get('business_id')

  if (!owner && bidParam) return customerView(bidParam)

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ perks: [], thresholds: null })
  const { data: perks } = await supabaseAdmin.from('loyalty_tier_perks').select('*').eq('business_id', bid).order('tier')
  const cfg = await getTierConfig(bid)
  return NextResponse.json({ perks: perks ?? [], thresholds: { silver: cfg.silver, gold: cfg.gold, platinum: cfg.platinum } })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json().catch(() => ({})) as { tier?: string; perk_type?: string; perk_value?: number; config?: Record<string, unknown>; is_active?: boolean }
  if (!['silver', 'gold', 'platinum'].includes(String(body.tier))) return NextResponse.json({ error: 'invalid tier' }, { status: 400 })
  if (!['points_multiplier', 'priority'].includes(String(body.perk_type))) return NextResponse.json({ error: 'invalid perk_type' }, { status: 400 })

  const row = {
    business_id: bid, tier: body.tier, perk_type: body.perk_type,
    perk_value: body.perk_value != null ? Number(body.perk_value) : null,
    config: body.config && typeof body.config === 'object' ? body.config : {},
    is_active: body.is_active ?? true,
  }
  const { data, error } = await supabaseAdmin.from('loyalty_tier_perks')
    .upsert(row, { onConflict: 'business_id,tier,perk_type' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, perk: data })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // Scope the delete to the owner's business (no cross-business deletes).
  await supabaseAdmin.from('loyalty_tier_perks').delete().eq('id', id).eq('business_id', bid)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('loyalty/tier-perks:get', _GET)
export const POST = withErrorCapture('loyalty/tier-perks:post', _POST)
export const DELETE = withErrorCapture('loyalty/tier-perks:delete', _DELETE)
