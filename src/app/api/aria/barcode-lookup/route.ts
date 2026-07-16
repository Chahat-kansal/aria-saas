export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { lookupBarcode } from '@/lib/aria/signals/barcode'
import { ariaInvoke } from '@/lib/aria/invoke'

// CANON-RAIL-1 beachhead — business_id now resolved by withBusinessContext (the rail), replacing
// this file's own local getBid().
async function _GET(req: Request, _context: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { searchParams } = new URL(req.url)
  const barcode = searchParams.get('barcode')
  if (!barcode) return NextResponse.json({ error: 'barcode required' }, { status: 400 })

  // Check if the product already exists in our catalog
  const { data: existing } = await supabase.from('pos_products')
    .select('id, name, price, category, barcode')
    .eq('business_id', bid).eq('barcode', barcode).maybeSingle()

  if (existing) {
    return NextResponse.json({ found: true, source: 'catalog', product: existing })
  }

  // Look up from external barcode database
  const external = await lookupBarcode(barcode)
  if (!external) {
    return NextResponse.json({ found: false, barcode })
  }

  // Optionally enrich with product_lookup agent for industry-specific details
  const enrichHint = `Product from barcode scan: ${JSON.stringify(external)}. Suggest appropriate category, price range, and any compliance fields for this ${external.category ?? 'product'} in an Australian ${external.name?.toLowerCase().includes('beer') || external.name?.toLowerCase().includes('wine') || external.name?.toLowerCase().includes('spirit') ? 'liquor store' : 'retail'} context.`
  const agentResult = await ariaInvoke('product_lookup', bid, { taskHint: enrichHint })

  return NextResponse.json({
    found: true,
    source: external.source,
    product: {
      name: external.name,
      brand: external.brand ?? null,
      category: external.category ?? null,
      barcode,
    },
    enrichment: agentResult.recommendation ? {
      description: agentResult.recommendation.description,
      payload: agentResult.recommendation.payload,
    } : null,
  })
}

export const GET = withBusinessContext('aria/barcode-lookup', _GET)
