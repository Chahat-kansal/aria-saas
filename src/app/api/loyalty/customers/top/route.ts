export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { getTier } from '@/lib/loyalty'

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data } = await supabaseAdmin
    .from('pos_customers')
    .select('id, name, email, points_balance, loyalty_points, stamps_count, total_spent, total_spend, visit_count, last_visit, last_visit_at')
    .eq('business_id', business_id)
    .order('points_balance', { ascending: false, nullsFirst: false })
    .limit(10)

  // Get last redemption per customer
  const customerIds = (data ?? []).map((c: { id: string }) => c.id)
  const { data: redemptions } = customerIds.length > 0
    ? await supabaseAdmin
        .from('pos_loyalty_transactions')
        .select('customer_id, created_at')
        .eq('business_id', business_id)
        .eq('type', 'redeem')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  const lastRedemption: Record<string, string> = {}
  for (const r of redemptions ?? []) {
    if (!lastRedemption[r.customer_id]) lastRedemption[r.customer_id] = r.created_at
  }

  const customers = (data ?? []).map(c => {
    const spend = Number(c.total_spent ?? c.total_spend ?? 0)
    const visits = Number(c.visit_count ?? 0)
    return {
      ...c,
      tier: getTier(spend, visits),
      last_redemption: lastRedemption[c.id] ?? null,
    }
  })

  return NextResponse.json({ customers })
}

export const GET = withErrorCapture('loyalty/customers/top', _GET)
