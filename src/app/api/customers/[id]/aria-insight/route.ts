export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { calcRFM } from '@/lib/rfm'

const CACHE_KEY = (id: string) => `customer_insight_${id}`
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer } = await supabaseAdmin
    .from('pos_customers')
    .select('id, business_id, name, total_spent, total_spend, visit_count, last_visit, last_visit_at, loyalty_points, points_balance')
    .eq('id', params.id)
    .maybeSingle()
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', customer.business_id).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check cache
  const cacheKey = CACHE_KEY(params.id)
  const { data: cached } = await supabaseAdmin
    .from('aria_signal_cache')
    .select('payload, expires_at')
    .eq('cache_key', cacheKey)
    .maybeSingle()
  if (cached && new Date(cached.expires_at as string) > new Date()) {
    return NextResponse.json({ insight: (cached.payload as Record<string, unknown>).insight, cached: true })
  }

  // Top 3 products from recent sales
  const { data: items } = await supabaseAdmin
    .from('pos_sale_items')
    .select('product_name, quantity')
    .in('sale_id',
      (await supabaseAdmin.from('pos_sales').select('id').eq('customer_id', params.id).eq('business_id', customer.business_id).neq('status', 'voided').limit(50)).data?.map((s: { id: string }) => s.id) ?? []
    )

  const productMap: Record<string, number> = {}
  for (const item of items ?? []) {
    if (item.product_name) productMap[item.product_name] = (productMap[item.product_name] ?? 0) + (item.quantity ?? 1)
  }
  const top3 = Object.entries(productMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name)

  const spend = Number(customer.total_spent ?? customer.total_spend ?? 0)
  const visits = Number(customer.visit_count ?? 0)
  const lv = (customer.last_visit ?? customer.last_visit_at ?? null) as string | null
  const rfm = calcRFM(spend, visits, lv)
  const tier = spend >= 500 || visits >= 10 ? 'VIP' : spend >= 200 ? 'Regular' : 'New'
  const avgBasket = visits > 0 ? (spend / visits).toFixed(2) : '0'

  const userPrompt = `Customer: ${customer.name}
Visits: ${visits}, Lifetime spend: A$${spend.toFixed(2)}, Avg basket: A$${avgBasket}
Last visit: ${rfm.daysSince} days ago
Top products: ${top3.join(', ') || 'unknown'}
RFM score: ${rfm.total}/15 (${rfm.tier}), Loyalty tier: ${tier}
Loyalty points: ${Number(customer.loyalty_points ?? customer.points_balance ?? 0)}`

  const result = await callAnthropic<Record<string, unknown>>(
    {
      model: 'haiku',
      systemPrompt: 'You are Aria, business intelligence for an Australian small business. Write a 3-sentence customer insight for the owner: who this customer is, what they buy, and the single best action to take now. Be specific, use the data. No generic advice.',
      userPrompt,
      maxTokens: 200,
      businessId: customer.business_id,
      agentKey: 'generic',
      role: 'data',
    },
    {}
  )

  const insight = result.raw || 'Insufficient data to generate insight.'

  // Write cache
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
  await supabaseAdmin.from('aria_signal_cache').upsert({
    cache_key: cacheKey,
    payload: { insight },
    expires_at: expiresAt,
  }, { onConflict: 'cache_key' })

  return NextResponse.json({ insight, cached: false })
}

export const POST = withErrorCapture('customers/[id]/aria-insight', _POST)
