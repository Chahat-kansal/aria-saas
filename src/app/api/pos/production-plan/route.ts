export const dynamic = 'force-dynamic'
export const maxDuration = 45
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string) {
  const { data: a } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (a?.business_id) return a.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

// Industries where production planning makes sense — things you actually MAKE
const PRODUCTION_INDUSTRIES = ['bakery', 'cafe', 'restaurant', 'food']

// Product categories that involve physical production/preparation
const PRODUCTION_CATEGORY_KEYWORDS = [
  'bread', 'pastry', 'cake', 'bake', 'food', 'coffee', 'beverage', 'kitchen',
  'dessert', 'sandwich', 'wrap', 'salad', 'soup', 'meal', 'snack', 'fresh',
  'dough', 'produce', 'made', 'prepared', 'cooked', 'brewed'
]

// Things that are NEVER produced in a kitchen — filter these out
const NON_PRODUCTION_KEYWORDS = [
  'alcohol', 'beer', 'wine', 'spirit', 'rum', 'vodka', 'whisky', 'whiskey',
  'gin', 'tequila', 'bourbon', 'brandy', 'cider', 'lager', 'ale', 'stout',
  'tobacco', 'cigarette', 'vape', 'cleaning', 'supply', 'paper', 'bag',
  'bottle', 'can', 'tin', 'packet', 'carton', 'energy drink', 'monster',
  'red bull', 'v drink', 'cola', 'soft drink', 'soda'
]

function isProductionProduct(name: string, category: string | null): boolean {
  const text = `${name} ${category ?? ''}`.toLowerCase()
  // Immediately exclude non-production items
  if (NON_PRODUCTION_KEYWORDS.some(kw => text.includes(kw))) return false
  // Include if it matches production keywords
  if (PRODUCTION_CATEGORY_KEYWORDS.some(kw => text.includes(kw))) return true
  // Default: include (let the business owner decide)
  return true
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

    // Get business info to understand the industry
    const { data: biz } = await supabaseAdmin
      .from('businesses')
      .select('name, industry')
      .eq('id', bid)
      .single()

    const industry = (biz as any)?.industry ?? 'retail'
    const bizName = (biz as any)?.name ?? 'Business'

    // Check if this industry even makes sense for production planning
    const isProductionBusiness = PRODUCTION_INDUSTRIES.some(ind => industry.includes(ind))

    // Get products with their categories
    const { data: products } = await supabaseAdmin
      .from('pos_products')
      .select('id, name, pos_categories(name)')
      .eq('business_id', bid)
      .eq('is_active', true)
      .eq('track_stock', true)
      .limit(100)

    // Get last 4 weeks of sales for velocity
    const { data: sales } = await supabaseAdmin
      .from('pos_sale_items')
      .select('product_id, product_name, quantity')
      .eq('business_id', bid)
      .limit(2000)

    // Build product map with categories
    const productMap: Record<string, { name: string; category: string | null }> = {}
    for (const p of (products ?? [])) {
      const catName = (p as any).pos_categories?.name ?? null
      productMap[p.id] = { name: p.name, category: catName }
    }

    // Aggregate sales by product
    const totals: Record<string, { name: string; category: string | null; total: number; count: number }> = {}
    for (const s of (sales ?? [])) {
      const prod = productMap[s.product_id]
      if (!prod) continue
      if (!totals[s.product_id]) totals[s.product_id] = { name: prod.name, category: prod.category, total: 0, count: 0 }
      totals[s.product_id].total += Number(s.quantity)
      totals[s.product_id].count += 1
    }

    // Filter to only production-relevant products based on industry + product name
    const filteredProducts = Object.entries(totals).filter(([, v]) => {
      // For production industries (bakery/cafe), filter strictly
      if (isProductionBusiness) {
        return isProductionProduct(v.name, v.category)
      }
      // For non-production businesses, return empty — production planning doesn't apply
      return false
    })

    if (!isProductionBusiness || filteredProducts.length === 0) {
      return NextResponse.json({
        plans: [],
        ai: true,
        day: dayOfWeek,
        message: isProductionBusiness
          ? `No production-relevant products found. Add bakery/food items to your product catalog.`
          : `Production planning is designed for bakeries and cafés. ${bizName} is set to "${industry}" industry — production planning applies to items you make in-house (bread, pastries, prepared meals), not items you sell from stock.`,
      })
    }

    const plans = filteredProducts
      .map(([product_id, v]) => ({
        business_id: bid,
        plan_date: date,
        product_id,
        product_name: v.name,
        planned_qty: Math.ceil((v.total / Math.max(v.count, 1)) * 1.2),
        notes: `AI estimate for ${dayOfWeek} based on sales history`,
      }))
      .filter(p => p.planned_qty > 0)
      .slice(0, 20)

    if (plans.length > 0) {
      await supabaseAdmin.from('pos_production_plans')
        .upsert(plans, { onConflict: 'business_id,plan_date,product_id' })
    }

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
