export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHORT_CODE_RE = /^\d{10}$/

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

// POST { code: string }
// Accepts: 10-digit numeric short_code (wallet barcode) OR identity UUID (legacy passes).
// Returns the full customer panel payload: identity, points, stamps, config, preload balance.
// Single resolver — every POS/kiosk surface calls this instead of building their own query.
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found for this account' }, { status: 400 })

  let body: { code?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const code = (body.code ?? '').trim()
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 })

  const isShortCode = SHORT_CODE_RE.test(code)
  const isUUID = UUID_RE.test(code)

  if (!isShortCode && !isUUID) {
    return NextResponse.json({ error: 'code must be a 10-digit numeric string or a UUID' }, { status: 400 })
  }

  // Resolve to a loyalty_identity row
  let identityId: string | null = null
  if (isShortCode) {
    const { data: ident } = await supabaseAdmin
      .from('loyalty_identity')
      .select('id')
      .eq('short_code', code)
      .maybeSingle()
    identityId = (ident as { id?: string } | null)?.id ?? null
  } else {
    const { data: ident } = await supabaseAdmin
      .from('loyalty_identity')
      .select('id')
      .eq('id', code)
      .maybeSingle()
    identityId = (ident as { id?: string } | null)?.id ?? null
  }

  if (!identityId) {
    return NextResponse.json({ found: false, reason: 'identity_not_found' }, { status: 404 })
  }

  // Resolve canonical customer + loyalty config in parallel
  const [custRes, cfgRes] = await Promise.all([
    supabaseAdmin
      .from('pos_customers')
      .select('id, name, points_balance, stamps_count, loyalty_tier, visit_count, total_spent')
      .eq('loyalty_identity_id', identityId)
      .eq('business_id', bid)
      .is('deleted_at', null)
      .order('points_balance', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('pos_loyalty_config')
      .select('program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, point_value_cents')
      .eq('business_id', bid)
      .maybeSingle(),
  ])

  if (!custRes.data) {
    return NextResponse.json({ found: false, identity_found: true, reason: 'not_a_customer_here' }, { status: 200 })
  }

  const cust = custRes.data as {
    id: string; name: string | null; points_balance: number | null
    stamps_count: number | null; loyalty_tier: string | null
    visit_count: number | null; total_spent: string | null
  }
  const cfg = cfgRes.data as {
    program_type?: string | null; points_per_dollar?: number | null
    stamps_to_reward?: number | null; stamp_reward_text?: string | null
    point_value_cents?: number | null
  } | null

  // Fetch preload balance now that we have customer_id
  const { data: preloadRow } = await supabaseAdmin
    .from('loyalty_preload_accounts')
    .select('balance')
    .eq('business_id', bid)
    .eq('customer_id', cust.id)
    .maybeSingle()

  const pts = Number(cust.points_balance ?? 0)
  const stamps = Number(cust.stamps_count ?? 0)
  const stampsTarget = Number(cfg?.stamps_to_reward ?? 10)
  const stampRewardReady = stamps > 0 && stamps >= stampsTarget

  return NextResponse.json({
    found: true,
    customer_id: cust.id,
    name: cust.name,
    points_balance: pts,
    stamps_count: stamps,
    loyalty_tier: cust.loyalty_tier,
    visit_count: Number(cust.visit_count ?? 0),
    total_spent: Number(cust.total_spent ?? 0),
    preload_balance: Number((preloadRow as { balance?: number | null } | null)?.balance ?? 0),
    loyalty_config: cfg ? {
      program_type: cfg.program_type ?? 'points',
      points_per_dollar: Number(cfg.points_per_dollar ?? 1),
      stamps_to_reward: stampsTarget,
      stamp_reward_text: cfg.stamp_reward_text ?? 'Free item',
      point_value_cents: Number(cfg.point_value_cents ?? 1),
    } : null,
    stamp_reward_ready: stampRewardReady,
  })
}