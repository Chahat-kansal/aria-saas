export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const stockTakeId: string | null = body.stock_take_id ?? null

  // Get stocktake header
  let stockTake: { id: string; items_counted?: number; items_with_variance?: number; completed_at?: string } | null = null
  if (stockTakeId) {
    const { data } = await supabase.from('pos_stock_takes').select('*').eq('id', stockTakeId).eq('business_id', bid).maybeSingle()
    stockTake = data
  } else {
    // Use most recent
    const { data } = await supabase.from('pos_stock_takes').select('*').eq('business_id', bid).eq('status', 'committed').order('completed_at', { ascending: false }).limit(1).maybeSingle()
    stockTake = data
  }

  if (!stockTake) return NextResponse.json({ error: 'No stocktake found' }, { status: 404 })

  // Get the variance items
  const { data: items } = await supabase
    .from('pos_stock_take_items')
    .select('product_id, system_qty, counted_qty')
    .eq('stock_take_id', stockTake.id)

  const varianceItems = (items ?? []).filter(i => i.counted_qty !== i.system_qty && i.product_id)
  if (varianceItems.length === 0) {
    return NextResponse.json({ insight: 'Perfect stocktake — all counts match system quantities. No variances found.', classified: [], priority: 'routine' })
  }

  // Fetch product details + 30-day sales velocity for each variant product
  const productIds = varianceItems.map(i => i.product_id!)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: products }, { data: salesItems }] = await Promise.all([
    supabase.from('pos_products')
      .select('id, name, category, cost_price, price, stock_quantity')
      .in('id', productIds)
      .eq('business_id', bid),
    supabase.from('pos_sale_items')
      .select('product_id, quantity')
      .in('product_id', productIds)
      .gte('created_at', thirtyDaysAgo),
  ])

  const productMap = Object.fromEntries((products ?? []).map(p => [p.id, p]))

  // Calculate 30d sales velocity per product
  const velocityMap: Record<string, number> = {}
  for (const si of (salesItems ?? [])) {
    if (!si.product_id) continue
    velocityMap[si.product_id] = (velocityMap[si.product_id] ?? 0) + (si.quantity ?? 1)
  }

  // Build enriched variance data
  const enriched = varianceItems.map(item => {
    const prod = productMap[item.product_id!]
    const variance = (item.counted_qty ?? 0) - (item.system_qty ?? 0)
    const velocity30d = velocityMap[item.product_id!] ?? 0
    const velocity_per_day = velocity30d / 30
    const cost_impact_cents = Math.abs(variance) * Math.round((prod?.cost_price ?? 0) * 100)
    const days_to_explain = velocity_per_day > 0 ? Math.abs(variance) / velocity_per_day : null

    return {
      product_id: item.product_id,
      name: prod?.name ?? 'Unknown',
      category: prod?.category ?? null,
      variance,
      system_qty: item.system_qty,
      counted_qty: item.counted_qty,
      cost_price: prod?.cost_price ?? 0,
      sell_price: prod?.price ?? 0,
      velocity_30d: velocity30d,
      velocity_per_day: Math.round(velocity_per_day * 10) / 10,
      cost_impact_cents,
      days_to_explain,
    }
  }).sort((a, b) => b.cost_impact_cents - a.cost_impact_cents)

  const totalCostImpact = enriched.reduce((s, i) => s + i.cost_impact_cents, 0)
  const topItems = enriched.slice(0, 10)

  // Run Claude to classify each variance
  let classified: Array<{ name: string; variance: number; classification: string; reason: string; action: string }> = []
  let overallInsight = ''
  // aria_autopilot_actions.priority CHECK: ('urgent','important','routine')
  let priority: 'urgent' | 'important' | 'routine' = totalCostImpact > 50000 ? 'urgent' : totalCostImpact > 10000 ? 'important' : 'routine'

  try {
    const response = await trackAICall(
      { route: 'aria/stocktake-intelligence', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'stocktake-variance-analysis' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        messages: [{
          role: 'user',
          content: `You are Aria, an AI advisor for an Australian retail/liquor store. Analyse this stocktake variance data.

VARIANCE ITEMS (sorted by cost impact):
${topItems.map(i => `${i.name}: system=${i.system_qty}, counted=${i.counted_qty}, variance=${i.variance > 0 ? '+' : ''}${i.variance}, 30d velocity=${i.velocity_30d} units, cost impact=A$${(i.cost_impact_cents/100).toFixed(2)}`).join('\n')}

Total cost impact: A$${(totalCostImpact/100).toFixed(2)}
Total variance items: ${varianceItems.length}

For EACH item, classify the variance as one of:
- "shrinkage" — likely theft, breakage, or unrecorded use (negative variance, high-value, low velocity relative to shortage)
- "counting_error" — likely miscounted (variance is small, or matches rounding)
- "supplier_short" — likely received less than invoiced (negative variance on received goods)
- "data_entry" — likely system entry error (large discrepancy with high confidence)
- "waste" — used in production/demos but not recorded

Then write an overall diagnosis.

Respond ONLY in this JSON format:
{
  "classified": [
    { "name": "Product Name", "variance": -5, "classification": "shrinkage", "reason": "High-value spirit, 5 units missing exceeds 2 weeks sales — unlikely counting error.", "action": "Check CCTV for that section. Consider locked cabinet." }
  ],
  "overall_title": "Short title (max 8 words)",
  "overall_insight": "2-3 sentences summarising the pattern and what to do.",
  "priority": "high|medium|routine"
}`,
        }],
      })
    )

    const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    classified = parsed.classified ?? []
    overallInsight = parsed.overall_insight ?? ''
    const rawPriority: string = parsed.priority ?? ''
    priority = rawPriority === 'high' || rawPriority === 'urgent' ? 'urgent'
      : rawPriority === 'medium' || rawPriority === 'important' ? 'important'
      : rawPriority === 'routine' ? 'routine'
      : priority

    // Write to autopilot
    if (overallInsight) {
      await supabase.from('aria_autopilot_actions').insert({
        business_id: bid,
        category: 'inventory',
        priority,
        title: parsed.overall_title ?? 'Stocktake variance analysis',
        description: overallInsight,
        action_data: {
          type: 'stocktake_variance_analysis',
          stock_take_id: stockTake.id,
          total_cost_impact_cents: totalCostImpact,
          items_with_variance: varianceItems.length,
          top_items: topItems.slice(0, 5).map(i => ({ name: i.name, variance: i.variance, cost_impact_cents: i.cost_impact_cents })),
        },
        estimated_impact: totalCostImpact > 0
          ? 'A$' + Math.round(totalCostImpact/100).toLocaleString() + ' cost exposure'
          : null,
        status: 'pending',
      })
    }
  } catch {
    // Rule-based fallback
    const shrinkageItems = topItems.filter(i => i.variance < 0 && i.cost_impact_cents > 2000)
    overallInsight = shrinkageItems.length > 0
      ? `${shrinkageItems.length} products are short with significant cost impact. Top concern: ${shrinkageItems[0].name} (${shrinkageItems[0].variance} units, A$${(shrinkageItems[0].cost_impact_cents/100).toFixed(2)} cost). Total exposure: A$${(totalCostImpact/100).toFixed(2)}.`
      : `${varianceItems.length} items with variance. Total cost impact: A$${(totalCostImpact/100).toFixed(2)}.`
  }

  return NextResponse.json({
    insight: overallInsight,
    priority,
    classified,
    total_cost_impact_cents: totalCostImpact,
    items_with_variance: varianceItems.length,
    enriched: topItems,
  })
}

export const POST = withErrorCapture('aria/stocktake-intelligence', _POST)
