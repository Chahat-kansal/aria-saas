export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

// GET /api/pos/loyalty/customer-detail?customer_id=xxx
// Owner/cashier authenticated. Returns rich loyalty panel data for the owner dashboard.
async function _GET(req: Request, _context: unknown, { businessId: bid }: BusinessContext) {
  const customerId = new URL(req.url).searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id required' }, { status: 400 })

  const [custRes, txnsRes, cfgRes] = await Promise.all([
    supabaseAdmin
      .from('pos_customers')
      .select('id, points_balance, stamps_count, loyalty_tier, loyalty_identity_id')
      .eq('id', customerId)
      .eq('business_id', bid)   // cross-business guard
      .maybeSingle(),
    supabaseAdmin
      .from('pos_loyalty_transactions')
      .select('id, type, points_delta, stamps_delta, reward_redeemed, created_at, sale_id')
      .eq('business_id', bid)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('pos_loyalty_config')
      .select('program_type, points_per_dollar, stamps_to_reward, stamp_reward_text, point_value_cents')
      .eq('business_id', bid)
      .maybeSingle(),
  ])

  if (!custRes.data) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const cust = custRes.data as {
    id: string; points_balance: number | null; stamps_count: number | null
    loyalty_tier: string | null; loyalty_identity_id: string | null
  }

  // Resolve short_code + preload balance in parallel now we have the identity
  const [identRes, preloadRes] = await Promise.all([
    cust.loyalty_identity_id
      ? supabaseAdmin.from('loyalty_identity').select('short_code').eq('id', cust.loyalty_identity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('loyalty_preload_accounts').select('balance').eq('business_id', bid).eq('customer_id', customerId).maybeSingle(),
  ])

  const shortCode = (identRes.data as { short_code?: string | null } | null)?.short_code ?? null
  const preloadBalance = Number((preloadRes.data as { balance?: number | null } | null)?.balance ?? 0)
  const cfg = cfgRes.data as {
    program_type?: string | null; points_per_dollar?: number | null
    stamps_to_reward?: number | null; stamp_reward_text?: string | null
    point_value_cents?: number | null
  } | null

  return NextResponse.json({
    points_balance: Number(cust.points_balance ?? 0),
    stamps_count: Number(cust.stamps_count ?? 0),
    loyalty_tier: cust.loyalty_tier ?? null,
    loyalty_identity_id: cust.loyalty_identity_id ?? null,
    short_code: shortCode,
    preload_balance: preloadBalance,
    transactions: txnsRes.data ?? [],
    loyalty_config: cfg ? {
      program_type: cfg.program_type ?? 'points',
      points_per_dollar: Number(cfg.points_per_dollar ?? 1),
      stamps_to_reward: Number(cfg.stamps_to_reward ?? 10),
      stamp_reward_text: cfg.stamp_reward_text ?? 'Free item',
      point_value_cents: Number(cfg.point_value_cents ?? 1),
    } : null,
  })
}

export const GET = withBusinessContext('pos/loyalty/customer-detail', _GET)