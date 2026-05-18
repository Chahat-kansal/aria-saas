export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { ariaInvoke } from '@/lib/aria/invoke'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
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
  let resolvedProductId: string | undefined = body.product_id || body.productId || undefined
  let taskHint: string | undefined

  // Multi-candidate selection when no productId provided
  if (!resolvedProductId) {
    const cutoff = new Date(Date.now() - 28 * 86400_000).toISOString()
    const { data: items } = await supabase
      .from('pos_sale_items')
      .select('product_id, quantity, pos_products!inner(id, name, price, cost_price, alcohol_percentage, age_restricted, category)')
      .eq('pos_products.business_id', bid)
      .gte('created_at', cutoff)
      .limit(2000)

    const byProduct = new Map<string, { units: number; product: Record<string, unknown> }>()
    for (const item of items ?? []) {
      const pid = item.product_id
      if (!pid || !item.pos_products) continue
      const prod = Array.isArray(item.pos_products) ? item.pos_products[0] : item.pos_products
      if (!prod) continue
      const cur = byProduct.get(pid) ?? { units: 0, product: prod as Record<string, unknown> }
      cur.units += Number(item.quantity) || 0
      byProduct.set(pid, cur)
    }

    const candidates = [...byProduct.values()].map(v => {
      const price = Number(v.product.price) || 0
      const cost = Number(v.product.cost_price) || 0
      const margin = price - cost
      const score = margin * v.units
      return { id: String(v.product.id), name: String(v.product.name), score, margin_pct: price > 0 ? margin / price * 100 : 0, units_28d: v.units }
    }).filter(c => c.score > 0 && c.margin_pct > 15).sort((a, b) => b.score - a.score).slice(0, 5)

    if (candidates.length === 0) {
      return NextResponse.json({ suggestion: null, reason: 'No products with sufficient sales and margin.' })
    }
    resolvedProductId = candidates[0].id
    taskHint = `Top promotion candidates (margin × velocity):\n${candidates.map((c, i) => `${i + 1}. ${c.name} — ${c.margin_pct.toFixed(0)}% margin, ${c.units_28d} units/28d`).join('\n')}`
  }

  const result = await ariaInvoke('promo', bid, { productId: resolvedProductId, taskHint, includeWeather: true })
  return NextResponse.json({
    suggestion: result.recommendation ? {
      type: result.recommendation.type,
      title: result.recommendation.title,
      description: result.recommendation.description,
      rationale: result.recommendation.rationale,
      confidence: result.recommendation.confidence,
      estimated_impact: result.recommendation.estimated_impact_dollars,
      payload: result.recommendation.payload,
    } : null,
    reason: result.reason,
    cost_cents: result.total_cost_cents,
  })
}

export const POST = withErrorCapture('aria/promo-suggest', _POST)
