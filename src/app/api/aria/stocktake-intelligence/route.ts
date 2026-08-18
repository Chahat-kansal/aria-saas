export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { guardOutput } from '@/lib/aria/ground-guard'
import { createDecision } from '@/lib/decisions/createDecision'
import { resolveCostFor } from '@/lib/inventory/resolve-cost'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function _POST(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
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
    // FAB-FIX-1 — stock_quantity removed (it was selected but unused; variance is sourced from
    // pos_stock_take_items.system_qty, not the demoted cache).
    supabase.from('pos_products')
      .select('id, name, category, cost_price, price')
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

  // INV-BASELINE-1 PHASE 3 - cost impact routes through resolveCostFor, and UNKNOWN STAYS UNKNOWN.
  //
  // This used to read `prod?.cost_price ?? 0` directly, which was wrong twice: it consulted only
  // tier 5 of the resolver's five-tier chain, and its `?? 0` turned "no cost recorded" into a
  // confident cost impact of A$0.00 - a fabricated money figure fed to Claude, written into
  // aria_autopilot_actions as "A$0 cost exposure", and used to sort which items the model sees.
  const outletIdForCost = (stockTake as { outlet_id?: string | null }).outlet_id ?? null
  const costCents = new Map<string, number | null>()
  await Promise.all([...new Set(productIds)].map(async pid => {
    try {
      const rc = await resolveCostFor(supabase, bid, pid, outletIdForCost)
      costCents.set(pid, rc.cost != null ? Math.round(rc.cost * 100) : null)
    } catch { costCents.set(pid, null) }
  }))

  // Build enriched variance data
  const enriched = varianceItems.map(item => {
    const prod = productMap[item.product_id!]
    const variance = (item.counted_qty ?? 0) - (item.system_qty ?? 0)
    const velocity30d = velocityMap[item.product_id!] ?? 0
    const velocity_per_day = velocity30d / 30
    const unitCents = costCents.get(item.product_id!) ?? null
    const cost_impact_cents: number | null = unitCents == null ? null : Math.abs(variance) * unitCents
    const days_to_explain = velocity_per_day > 0 ? Math.abs(variance) / velocity_per_day : null

    return {
      product_id: item.product_id,
      name: prod?.name ?? 'Unknown',
      category: prod?.category ?? null,
      variance,
      system_qty: item.system_qty,
      counted_qty: item.counted_qty,
      // INV-BASELINE-1 PHASE 3 - report the cost the calculation ACTUALLY used, from the full
      // resolver chain, and null when none resolved. This previously read prod?.cost_price ?? 0,
      // publishing "this product costs $0.00" for any product without a catalogue price.
      cost_price: unitCents == null ? null : unitCents / 100,
      sell_price: prod?.price ?? 0,
      velocity_30d: velocity30d,
      velocity_per_day: Math.round(velocity_per_day * 10) / 10,
      cost_impact_cents,
      days_to_explain,
    }
  }).sort((a, b) => (b.cost_impact_cents ?? -1) - (a.cost_impact_cents ?? -1))

  // Sum only what is priced; count what is not. An unvalued item is not a zero-impact item.
  const unknownCostItems = enriched.filter(i => i.cost_impact_cents == null).length
  const totalCostImpact = enriched.reduce((s, i) => s + (i.cost_impact_cents ?? 0), 0)
  const costImpactKnown = unknownCostItems === 0
  const plural = unknownCostItems === 1 ? '' : 's'
  const impactLabel = costImpactKnown
    ? 'A$' + (totalCostImpact / 100).toFixed(2)
    : (totalCostImpact > 0
        ? 'A$' + (totalCostImpact / 100).toFixed(2) + ' across the priced items; ' + unknownCostItems + ' item' + plural + ' have no recorded cost so their value is UNKNOWN'
        : 'UNKNOWN - none of the ' + unknownCostItems + ' varying items have a recorded cost')
  const topItems = enriched.slice(0, 10)

  // Run Claude to classify each variance
  let classified: Array<{ name: string; variance: number; classification: string; reason: string; action: string }> = []
  let overallInsight = ''
  // aria_autopilot_actions.priority CHECK: ('urgent','important','routine')
  //
  // INV-BASELINE-1 PHASE 3 - AN UNKNOWN COST IMPACT NO LONGER SORTS AS 'routine'.
  // The money rule only runs when every varying item is priced. Before this, an unpriced count
  // summed to 0 and fell straight through to 'routine' - a confident "nothing to worry about"
  // asserted from an absence of data, and written into aria_autopilot_actions.
  // When the impact is not fully known we cannot say it is small, so it surfaces as 'important'
  // for a human to look at. Claude's own classification can still override this below.
  // TODO(INV-THRESHOLD-ABC): the real answer is a non-monetary ranking (variance magnitude against
  // this product's own ABC tier and velocity). That is a different ranking model needing its own
  // design, and is deliberately NOT substituted here.
  let priority: 'urgent' | 'important' | 'routine' = costImpactKnown
    ? (totalCostImpact > 50000 ? 'urgent' : totalCostImpact > 10000 ? 'important' : 'routine')
    : 'important'

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
${topItems.map(i => `${i.name}: system=${i.system_qty}, counted=${i.counted_qty}, variance=${i.variance > 0 ? '+' : ''}${i.variance}, 30d velocity=${i.velocity_30d} units, cost impact=${i.cost_impact_cents == null ? 'UNKNOWN (no cost recorded)' : 'A$' + (i.cost_impact_cents/100).toFixed(2)}`).join('\n')}

Total cost impact: ${impactLabel}
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
    // BUGFIX-FAB-3 — guard the prose against the REAL variance + cost-impact figures (code-computed).
    if (overallInsight) {
      const allowed: number[] = [Math.round(totalCostImpact / 100), varianceItems.length]
      for (const i of topItems) { allowed.push(i.variance); if (i.cost_impact_cents != null) allowed.push(Math.round(i.cost_impact_cents / 100)) }
      overallInsight = (await guardOutput(overallInsight, allowed, { mode: 'strip', businessId: bid, surface: 'stocktake-intelligence' })).text
    }
    const rawPriority: string = parsed.priority ?? ''
    priority = rawPriority === 'high' || rawPriority === 'urgent' ? 'urgent'
      : rawPriority === 'medium' || rawPriority === 'important' ? 'important'
      : rawPriority === 'routine' ? 'routine'
      : priority

    // Write to autopilot
    if (overallInsight) {
      // SPINE-1 — identical row, now also emitting the 'proposed' moat event + real-time push.
      await createDecision({
        business_id: bid,
        domain: 'supply',
        kind: 'stocktake_variance_analysis',
        category: 'inventory',
        priority,
        title: parsed.overall_title ?? 'Stocktake variance analysis',
        subtitle: overallInsight,
        payload: {
          type: 'stocktake_variance_analysis',
          stock_take_id: stockTake.id,
          total_cost_impact_cents: totalCostImpact,
          items_with_variance: varianceItems.length,
          top_items: topItems.slice(0, 5).map(i => ({ name: i.name, variance: i.variance, cost_impact_cents: i.cost_impact_cents })),
        },
        // Never "A$0 cost exposure" from an unpriced count - null means unknown, not nothing.
        estimated_impact: totalCostImpact > 0
          ? 'A$' + Math.round(totalCostImpact/100).toLocaleString() + ' cost exposure'
            + (costImpactKnown ? '' : ' (+' + unknownCostItems + ' unvalued)')
          : null,
      })
    }
  } catch {
    // Rule-based fallback
    const shrinkageItems = topItems.filter(i => i.variance < 0 && (i.cost_impact_cents ?? 0) > 2000)
    overallInsight = shrinkageItems.length > 0
      ? `${shrinkageItems.length} products are short with significant cost impact. Top concern: ${shrinkageItems[0].name} (${shrinkageItems[0].variance} units, A$${((shrinkageItems[0].cost_impact_cents ?? 0)/100).toFixed(2)} cost). Total exposure: ${impactLabel}.`
      : `${varianceItems.length} items with variance. Total cost impact: ${impactLabel}.`
  }

  return NextResponse.json({
    insight: overallInsight,
    priority,
    classified,
    total_cost_impact_cents: costImpactKnown ? totalCostImpact : null,
    cost_impact_known: costImpactKnown,
    unvalued_items: unknownCostItems,
    items_with_variance: varianceItems.length,
    enriched: topItems,
  })
}

export const POST = withBusinessContext('aria/stocktake-intelligence', _POST)
