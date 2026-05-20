export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET — compare prices across suppliers for products in your inventory
export async function GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  const search = searchParams.get('search') ?? ''
  const category = searchParams.get('category') ?? ''

  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase.from('businesses').select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all supplier items for this business
  let query = supabaseAdmin
    .from('supplier_price_items')
    .select('product_name,sku,barcode,unit_price,case_price,case_qty,unit_of_measure,category,brand,supplier_name,in_stock,effective_date')
    .eq('business_id', business_id)

  if (search) query = query.ilike('product_name', `%${search}%`)
  if (category) query = query.eq('category', category)

  const { data: items } = await query.order('product_name').limit(500)

  // Group by product name — show all suppliers side by side
  const grouped = new Map<string, {
    product_name: string; category: string | null; brand: string | null
    suppliers: Array<{ name: string; unit_price: number | null; case_price: number | null; case_qty: number | null; uom: string | null; in_stock: boolean }>
    your_price: number | null; best_unit: number | null; best_case_per_unit: number | null; savings_potential: number | null
  }>()

  for (const item of items ?? []) {
    const key = (item.barcode ?? item.sku ?? item.product_name).toLowerCase()
    if (!grouped.has(key)) {
      grouped.set(key, {
        product_name: item.product_name,
        category: item.category,
        brand: item.brand,
        suppliers: [],
        your_price: null,
        best_unit: null,
        best_case_per_unit: null,
        savings_potential: null,
      })
    }
    grouped.get(key)!.suppliers.push({
      name: item.supplier_name,
      unit_price: item.unit_price,
      case_price: item.case_price,
      case_qty: item.case_qty,
      uom: item.unit_of_measure,
      in_stock: item.in_stock ?? true,
    })
  }

  // Fetch your current prices from pos_products for matched items
  const productNames = [...grouped.keys()].map(k => grouped.get(k)!.product_name)
  if (productNames.length > 0) {
    const { data: ownProducts } = await supabaseAdmin
      .from('pos_products')
      .select('name,price,cost_price,barcode')
      .eq('business_id', business_id)
      .eq('is_active', true)

    const ownMap = new Map((ownProducts ?? []).map(p => [p.name.toLowerCase(), p]))

    for (const [, row] of grouped) {
      const own = ownMap.get(row.product_name.toLowerCase())
      row.your_price = own?.cost_price ?? null  // compare against your COST

      // Find best supplier prices
      const unitPrices = row.suppliers.filter(s => s.unit_price != null && s.in_stock).map(s => s.unit_price!)
      const casePerUnit = row.suppliers.filter(s => s.case_price != null && s.case_qty != null && s.in_stock)
        .map(s => +(s.case_price! / s.case_qty!).toFixed(3))

      row.best_unit = unitPrices.length > 0 ? Math.min(...unitPrices) : null
      row.best_case_per_unit = casePerUnit.length > 0 ? Math.min(...casePerUnit) : null
      
      const bestCost = Math.min(
        row.best_unit ?? Infinity,
        row.best_case_per_unit ?? Infinity,
      )
      row.savings_potential = (row.your_price && isFinite(bestCost))
        ? +((row.your_price - bestCost)).toFixed(2)
        : null
    }
  }

  const rows = [...grouped.values()]
    .filter(r => r.suppliers.length > 0)
    .sort((a, b) => (b.savings_potential ?? 0) - (a.savings_potential ?? 0))

  // Summary stats
  const withSavings = rows.filter(r => (r.savings_potential ?? 0) > 0)
  const totalSavingsPotential = withSavings.reduce((s, r) => s + (r.savings_potential ?? 0), 0)

  // Get distinct categories for filter
  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))]

  return NextResponse.json({
    rows,
    summary: {
      total_products: rows.length,
      suppliers_loaded: [...new Set((items ?? []).map(i => i.supplier_name))].length,
      products_with_savings: withSavings.length,
      total_savings_potential_per_unit: +totalSavingsPotential.toFixed(2),
    },
    categories,
  })
}
