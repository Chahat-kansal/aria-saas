export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { customer_id, sale_id, type, points_delta, stamps_delta, reward_redeemed } = await req.json() as {
    customer_id: string; sale_id?: string; type: string;
    points_delta?: number; stamps_delta?: number; reward_redeemed?: string
  }

  if (!customer_id || !type) return NextResponse.json({ error: 'customer_id and type required' }, { status: 400 })

  // Fetch customer + loyalty config
  const [{ data: customer }, { data: config }] = await Promise.all([
    supabase.from('pos_customers').select('id, points_balance, stamps_count').eq('id', customer_id).eq('business_id', bid).maybeSingle(),
    supabase.from('pos_loyalty_config').select('program_type, point_value_cents, stamp_reward_text, stamps_to_reward').eq('business_id', bid).maybeSingle(),
  ])

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const pointsDelta = points_delta ?? 0
  const stampsDelta = stamps_delta ?? 0

  // Validate redeem
  if (type === 'redeem' && pointsDelta < 0) {
    const needed = Math.abs(pointsDelta)
    if ((customer.points_balance ?? 0) < needed) {
      return NextResponse.json({ error: `Customer only has ${customer.points_balance} points` }, { status: 400 })
    }
  }

  // Validate stamp reward
  if (type === 'redeem' && stampsDelta < 0) {
    const cfg = config?.stamps_to_reward ?? 10
    if ((customer.stamps_count ?? 0) < cfg) {
      return NextResponse.json({ error: 'Not enough stamps for reward' }, { status: 400 })
    }
  }

  const newPoints = Math.max(0, (customer.points_balance ?? 0) + pointsDelta)
  const newStamps = Math.max(0, (customer.stamps_count ?? 0) + stampsDelta)

  // Update customer balances
  await supabase.from('pos_customers').update({
    points_balance: newPoints,
    stamps_count: newStamps,
    loyalty_points: newPoints, // keep legacy column in sync
    updated_at: new Date().toISOString(),
  }).eq('id', customer_id).eq('business_id', bid)

  // Write transaction record
  await supabase.from('pos_loyalty_transactions').insert({
    business_id: bid,
    customer_id,
    sale_id: sale_id ?? null,
    type,
    points_delta: pointsDelta,
    stamps_delta: stampsDelta,
    reward_redeemed: reward_redeemed ?? null,
    created_at: new Date().toISOString(),
  })

  // Compute discount if redeeming points
  const pointValueCents = config?.point_value_cents ?? 1
  const discountCents = type === 'redeem' && pointsDelta < 0
    ? Math.abs(pointsDelta) * pointValueCents
    : 0

  return NextResponse.json({
    ok: true,
    new_points_balance: newPoints,
    new_stamps_count: newStamps,
    discount_cents: discountCents,
    discount_dollars: discountCents / 100,
    stamp_reward_earned: stampsDelta > 0 && newStamps >= (config?.stamps_to_reward ?? 10)
      ? (config?.stamp_reward_text ?? 'Free coffee')
      : null,
  })
}

export const POST = withErrorCapture('pos/loyalty/redeem', _POST)