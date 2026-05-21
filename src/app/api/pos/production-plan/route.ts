export const dynamic = 'force-dynamic'
export const maxDuration = 55
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'
import Anthropic from '@anthropic-ai/sdk'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ plans: [] })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ plans: [] })
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') ?? new Date().toISOString().split('T')[0]
  const { data } = await supabase.from('pos_production_plans')
    .select('*').eq('business_id', bid).eq('plan_date', date).order('product_name')
  return NextResponse.json({ plans: data ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })
  const body = await req.json()

  if (body.ai_generate) {
    const date = body.date ?? new Date().toISOString().split('T')[0]
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('en-AU', { weekday: 'long' })

    const { data: biz } = await supabaseAdmin
      .from('businesses').select('name, industry').eq('id', bid).single()
    const industry = (biz as any)?.industry ?? 'retail'
    const bizName = (biz as any)?.name ?? 'Business'

    // Get products with categories
    const { data: products } = await supabaseAdmin
      .from('pos_products')
      .select('id, name, pos_categories(name)')
      .eq('business_id', bid).eq('is_active', true).limit(100)

    // Get sales history
    const { data: sales } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_id, product_name, quantity')
      .eq('business_id', bid).limit(2000)

    const productMap: Record<string, { name: string; category: string | null }> = {}
    for (const p of (products ?? [])) {
      productMap[p.id] = { name: p.name, category: (p as any).pos_categories?.name ?? null }
    }

    const totals: Record<string, { name: string; category: string | null; total: number; count: number }> = {}
    for (const s of (sales ?? [])) {
      const prod = productMap[s.product_id]
      if (!prod) continue
      if (!totals[s.product_id]) totals[s.product_id] = { name: prod.name, category: prod.category, total: 0, count: 0 }
      totals[s.product_id].total += Number(s.quantity)
      totals[s.product_id].count += 1
    }

    const productList = Object.entries(totals).map(([id, v]) => ({
      id, name: v.name, category: v.category,
      avg_qty: Math.round((v.total / Math.max(v.count, 1)) * 10) / 10
    }))

    if (productList.length === 0) {
      return NextResponse.json({ plans: [], ai: true, day: dayOfWeek, message: 'No sales data yet.' })
    }

    // Use Claude to intelligently determine which products need production planning
    // Claude knows what products are — no category needed
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const productJSON = JSON.stringify(productList.map(p => ({
      id: p.id, name: p.name, category: p.category ?? 'uncategorised', avg_daily_qty: p.avg_qty
    })))

    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `You are a production planning assistant for "${bizName}", a ${industry} business in Australia.

Today is ${dayOfWeek}. The owner wants a production plan — a list of items they need to PREPARE or MAKE today.

Here are the products sold at this business with their average daily sales quantity:
${productJSON}

Your job: Return ONLY the products that this business would actually need to PRODUCE/PREPARE/MAKE.

Rules:
- INCLUDE: food items made in-house, baked goods, prepared meals, coffee drinks, fresh items
- EXCLUDE: packaged retail items like bottled beer/wine/spirits/cider, canned drinks, energy drinks, confectionery packets, tobacco, cleaning supplies, pre-packaged snacks, anything a business would just order and resell without making it
- Use your knowledge of what these products are — "St Agnes Rum", "Monster Energy Drink", "Carlton Draught", "Quips" are retail products, NOT produced in-house
- If a ${industry} business sells these items, they buy them wholesale, not make them

Return ONLY valid JSON, no markdown:
{"producible": [{"id": "...", "name": "...", "planned_qty": <number based on avg * 1.2 buffer>, "reason": "..."}]}

If NO items are producible (e.g. a liquor store selling only packaged goods), return:
{"producible": [], "message": "All products appear to be retail/packaged items that are purchased, not produced. Production planning applies to items made in-house."}`
      }]
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    let result: { producible?: Array<{ id: string; name: string; planned_qty: number; reason: string }>; message?: string } = {}
    try { result = JSON.parse(cleaned) } catch { result = { producible: [] } }

    if (!result.producible?.length) {
      return NextResponse.json({
        plans: [],
        ai: true,
        day: dayOfWeek,
        message: result.message ?? `No in-house produced items found for ${bizName}. Production planning applies to items you make (bread, meals, coffee), not items you buy and resell (alcohol, packaged drinks, confectionery).`,
      })
    }

    const plans = result.producible.map(p => ({
      business_id: bid,
      plan_date: date,
      product_id: p.id,
      product_name: p.name,
      planned_qty: Math.max(1, Math.round(p.planned_qty)),
      notes: p.reason ?? `AI estimate for ${dayOfWeek}`,
    }))

    await supabaseAdmin.from('pos_production_plans')
      .upsert(plans, { onConflict: 'business_id,plan_date,product_id' })

    return NextResponse.json({ plans, ai: true, day: dayOfWeek })
  }

  // Manual single item
  const { data, error } = await supabaseAdmin.from('pos_production_plans').upsert({
    business_id: bid,
    plan_date: body.plan_date,
    product_id: body.product_id,
    product_name: body.product_name,
    planned_qty: Number(body.planned_qty ?? 0),
    actual_qty: body.actual_qty != null ? Number(body.actual_qty) : null,
    notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,plan_date,product_id' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ plan: data })
}

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json()
  await supabaseAdmin.from('pos_production_plans')
    .update({ actual_qty: body.actual_qty, notes: body.notes, updated_at: new Date().toISOString() })
    .eq('id', body.id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('pos/production-plan', _GET)
export const POST = withErrorCapture('pos/production-plan', _POST)
export const PATCH = withErrorCapture('pos/production-plan', _PATCH)
