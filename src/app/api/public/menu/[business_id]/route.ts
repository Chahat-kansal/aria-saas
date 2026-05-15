export const dynamic = 'force-dynamic'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const getDb = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Params = { params: Promise<{ business_id: string }> | { business_id: string } }

export async function GET(_req: Request, { params }: Params) {
  const { business_id } = 'then' in params ? await params : params
  const db = getDb()

  // Fetch active categories
  const { data: categories } = await db
    .from('pos_categories')
    .select('id, name, color, sort_order')
    .eq('business_id', business_id)
    .order('sort_order', { nullsFirst: false })
    .order('name')

  // Fetch active products with category info
  const { data: products } = await db
    .from('pos_products')
    .select('id, name, description, price, category_id, image_url, tax_rate, gst_exempt, builder_type')
    .eq('business_id', business_id)
    .eq('is_active', true)
    .order('name')

  if (!products) return NextResponse.json({ categories: [], products: [] })

  // Fetch modifier groups per product (batch — only for products with modifiers)
  const productIds = products.map(p => p.id)
  const { data: modLinks } = await db
    .from('pos_product_modifier_groups')
    .select('product_id, pos_modifier_groups(id, name, required, min_select, max_select, pos_modifiers(id, name, price_adjustment, is_active))')
    .in('product_id', productIds)

  // Build modifier map
  const modMap: Record<string, unknown[]> = {}
  for (const link of modLinks ?? []) {
    const mg = (link as Record<string, unknown>).pos_modifier_groups as Record<string, unknown> | null
    if (!mg) continue
    if (!modMap[link.product_id]) modMap[link.product_id] = []
    modMap[link.product_id].push({
      ...mg,
      pos_modifiers: (mg.pos_modifiers as Array<Record<string, unknown>> ?? []).filter(m => m.is_active),
    })
  }

  const enriched = products.map(p => ({ ...p, modifier_groups: modMap[p.id] ?? [] }))

  return NextResponse.json({
    categories: categories ?? [],
    products: enriched,
  })
}