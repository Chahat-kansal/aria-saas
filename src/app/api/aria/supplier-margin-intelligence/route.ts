export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Anthropic from '@anthropic-ai/sdk'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackAICall } from '@/lib/aria/ai-telemetry'
import { guardOutput } from '@/lib/aria/ground-guard'

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

  const body = await req.json()
  const products: Array<{ name: string; new_cost: number; sell_price: number; current_cost: number | null }> = body.products ?? []

  if (products.length === 0) return NextResponse.json({ recommendations: [] })

  // Get business info for competitor search context
  const { data: biz } = await supabase.from('businesses').select('name, city, industry').eq('id', bid).maybeSingle()

  // Identify margin-at-risk products (margin drops > 3pp OR margin falls below 25%)
  const atRisk = products
    .filter(p => p.sell_price > 0 && p.new_cost > 0)
    .map(p => {
      const oldMargin = p.current_cost != null && p.sell_price > 0
        ? ((p.sell_price - p.current_cost) / p.sell_price) * 100 : null
      const newMargin = ((p.sell_price - p.new_cost) / p.sell_price) * 100
      const marginDrop = oldMargin != null ? oldMargin - newMargin : 0
      return { ...p, oldMargin, newMargin, marginDrop }
    })
    .filter(p => p.newMargin < 30 || p.marginDrop > 3)
    .sort((a, b) => b.marginDrop - a.marginDrop)
    .slice(0, 3) // Only top 3 to avoid too many API calls

  if (atRisk.length === 0) {
    return NextResponse.json({ recommendations: [], message: 'All margins remain healthy after this import.' })
  }

  // For each at-risk product, check what the market charges
  // We use web search through Claude directly (faster than hitting the competitor API separately)
  const city = biz?.city ?? 'Australia'

  try {
    const response = await trackAICall(
      { route: 'aria/supplier-margin-intelligence', model: 'claude-haiku-4-5-20251001', businessId: bid, purpose: 'supplier-margin-analysis' },
      () => anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        tools: [{ type: 'web_search_20250305' as const, name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are Aria, an AI advisor for an Australian ${biz?.industry ?? 'retail'} store in ${city}.

A supplier has sent a new price list. These products now have lower margins and need urgent attention:

${atRisk.map(p => `- ${p.name}: cost now A$${p.new_cost.toFixed(2)}, selling at A$${p.sell_price.toFixed(2)}, margin drops from ${p.oldMargin != null ? p.oldMargin.toFixed(1) + '%' : 'unknown'} to ${p.newMargin.toFixed(1)}%`).join('\n')}

Search the web for current retail prices of these specific products at Australian retailers (Dan Murphy's, BWS, First Choice, IGA, Coles, Woolworths). Find the ACTUAL retail prices, not just the store website.

Then respond ONLY in this JSON format:
{
  "recommendations": [
    {
      "product_name": "Exact product name",
      "current_sell_price": 25.99,
      "new_cost": 18.00,
      "current_margin_pct": 28.5,
      "competitor_prices": [
        { "retailer": "Dan Murphy's", "price": 28.99 },
        { "retailer": "BWS", "price": 27.50 }
      ],
      "market_avg_price": 28.24,
      "recommended_sell_price": 27.99,
      "recommended_margin_pct": 35.7,
      "action": "You can raise price to A$27.99 — still A$0.25 below Dan Murphy's and your margin recovers to 35.7%.",
      "confidence": "high|medium|low"
    }
  ],
  "summary": "2 sentence overall summary of what the owner should do right now."
}`,
        }],
      })
    )

    const text = response.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned)

    // BUGFIX-FAB-3 — competitor prices come from web_search (the structured recommendations keep them); the
    // owner-facing `summary` prose is FLAG-guarded against the REAL margin/cost/price figures (flag, not strip,
    // because a legit summary may reference a searched competitor price — we log drift rather than gut it).
    if (typeof parsed.summary === 'string') {
      const allowed: number[] = []
      for (const p of atRisk) { allowed.push(Math.round(p.new_cost * 100) / 100, Math.round(p.sell_price * 100) / 100, Math.round(p.newMargin * 10) / 10); if (p.oldMargin != null) allowed.push(Math.round(p.oldMargin * 10) / 10) }
      await guardOutput(parsed.summary, allowed, { mode: 'flag', businessId: bid, surface: 'supplier-margin-intelligence' })
    }

    // Write a combined recommendation to autopilot
    if (parsed.recommendations?.length > 0) {
      const totalRecoverable = parsed.recommendations.reduce((s: number, r: { recommended_sell_price: number; current_sell_price: number }) => {
        const priceDiff = (r.recommended_sell_price ?? 0) - (r.current_sell_price ?? 0)
        return s + Math.max(0, Math.round(priceDiff * 100))
      }, 0)

      await supabase.from('aria_autopilot_actions').insert({
        business_id: bid,
        category: 'pricing',
        priority: totalRecoverable > 5000 ? 'urgent' : 'important',
        title: 'Supplier price increase — pricing adjustment needed',
        description: parsed.summary ?? `${atRisk.length} products need sell price review after supplier cost increase.`,
        action_data: {
          type: 'supplier_margin_analysis',
          at_risk_count: atRisk.length,
          recommendations: parsed.recommendations,
        },
        estimated_impact: totalRecoverable > 0
          ? 'A$' + Math.round(totalRecoverable/100).toLocaleString() + '/unit uplift available'
          : null,
        status: 'pending',
      })
    }

    return NextResponse.json(parsed)
  } catch {
    // Fallback without web search
    const recs = atRisk.map(p => ({
      product_name: p.name,
      current_sell_price: p.sell_price,
      new_cost: p.new_cost,
      current_margin_pct: Math.round(p.newMargin * 10) / 10,
      action: p.newMargin < 20
        ? `Margin is critically low at ${p.newMargin.toFixed(1)}%. Consider raising sell price by A$${(p.new_cost * 0.4 - (p.sell_price - p.new_cost)).toFixed(2)} to restore 30% margin, or contact supplier to negotiate.`
        : `Margin has dropped to ${p.newMargin.toFixed(1)}%. Check competitor prices before deciding to absorb the cost increase.`,
      confidence: 'low' as const,
    }))
    return NextResponse.json({ recommendations: recs, summary: `${atRisk.length} products have margin below 30% after this supplier price increase.` })
  }
}

export const POST = withErrorCapture('aria/supplier-margin-intelligence', _POST)
