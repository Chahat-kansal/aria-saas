export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveCustomerCode } from '@/lib/loyalty/resolve-code'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// POST { code: string }
// Accepts: 10-digit numeric short_code OR identity UUID.
// Returns: full customer panel payload + redeemable reward rules.
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found for this account' }, { status: 400 })

  let body: { code?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const code = (body.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const result = await resolveCustomerCode(code, bid)

  if (!result.found) {
    return NextResponse.json({
      found: false,
      identity_found: result.identityFound,
      reason: result.reason,
    }, { status: result.reason === 'invalid_code' ? 400 : 200 })
  }

  const { customer } = result

  // Parallel: config + preload balance + reward rules redeemable by this customer
  const [cfgRes, preloadRes, rulesRes] = await Promise.all([
    supabaseAdmin
      .from('pos_loyalty_config')
      .select('program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, point_value_cents')
      .eq('business_id', bid)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_preload_accounts')
      .select('balance')
      .eq('business_id', bid)
      .eq('customer_id', customer.customerId)
      .maybeSingle(),
    supabaseAdmin
      .from('loyalty_reward_rules')
      .select('id, rule_type, points_value, config')
      .eq('business_id', bid)
      .eq('is_active', true)
      .lte('points_value', customer.pointsBalance),
  ])

  const cfg = cfgRes.data as {
    program_type?: string | null; points_per_dollar?: number | null
    stamps_to_reward?: number | null; stamp_reward_text?: string | null
    point_value_cents?: number | null
  } | null

  const stampsTarget = Number(cfg?.stamps_to_reward ?? 10)
  const stampRewardReady = customer.stampsCount > 0 && customer.stampsCount >= stampsTarget

  type RuleRow = { id: string; rule_type: string | null; points_value: number | null; config: Record<string, unknown> | null }
  const rules = (rulesRes.data ?? []) as RuleRow[]

  const redeemableRules = rules.map(r => ({
    id: r.id,
    rule_type: r.rule_type ?? 'spend_threshold',
    points_cost: Number(r.points_value ?? 0),
    label: ((r.config as Record<string, string> | null)?.label) ?? r.rule_type ?? 'Reward',
    config: r.config ?? {},
  }))

  return NextResponse.json({
    found: true,
    customer_id: customer.customerId,
    name: customer.name,
    points_balance: customer.pointsBalance,
    stamps_count: customer.stampsCount,
    loyalty_tier: customer.loyaltyTier,
    visit_count: customer.visitCount,
    total_spent: customer.totalSpent,
    preload_balance: Number((preloadRes.data as { balance?: number | null } | null)?.balance ?? 0),
    loyalty_config: cfg ? {
      program_type: cfg.program_type ?? 'points',
      points_per_dollar: Number(cfg.points_per_dollar ?? 1),
      stamps_to_reward: stampsTarget,
      stamp_reward_text: cfg.stamp_reward_text ?? 'Free item',
      point_value_cents: Number(cfg.point_value_cents ?? 1),
    } : null,
    stamp_reward_ready: stampRewardReady,
    redeemable_rules: redeemableRules,
  })
}