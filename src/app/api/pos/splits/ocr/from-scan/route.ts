export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'

async function _POST(req: Request, _ctx: unknown, { supabase, businessId: bid }: BusinessContext) {
  const { scan_id } = await req.json()
  if (!scan_id) return NextResponse.json({ error: 'scan_id required' }, { status: 400 })

  const { data: scan } = await supabase.from('receipt_ocr_scans').select('*').eq('id', scan_id).eq('business_id', bid).maybeSingle()
  if (!scan) return NextResponse.json({ error: 'Scan not found' }, { status: 404 })

  const items: Array<{ name: string; qty: number; unit_price: number; total: number }> = scan.detected_items ?? []
  const total = scan.detected_total ?? items.reduce((s, i) => s + i.total, 0)
  const tax = scan.detected_tax ?? +(total * 0.1 / 1.1).toFixed(2)

  // Create a draft pos_sale
  const { count } = await supabase.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid)
  const saleNumber = `OCR-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: sale, error: saleErr } = await supabase.from('pos_sales').insert({
    business_id: bid,
    sale_number: saleNumber,
    subtotal: scan.detected_subtotal ?? +(total - tax).toFixed(2),
    tax_amount: tax,
    discount_amount: 0,
    total_amount: total,
    payment_method: 'pending',
    status: 'draft',
    notes: `From OCR scan ${scan_id}`,
    created_at: new Date().toISOString(),
  }).select('id').single()

  if (saleErr || !sale) return NextResponse.json({ error: saleErr?.message ?? 'Failed to create sale' }, { status: 500 })

  // Create sale items from OCR items
  if (items.length > 0) {
    await supabase.from('pos_sale_items').insert(
      items.map(i => ({
        sale_id: sale.id,
        business_id: bid,
        product_name: i.name,
        quantity: i.qty ?? 1,
        unit_price: i.unit_price ?? +(i.total / (i.qty || 1)).toFixed(2),
        line_total: i.total ?? 0,
        tax_rate: 10,
        discount_percent: 0,
      }))
    )
  }

  // Link scan to sale
  await supabase.from('receipt_ocr_scans').update({ sale_id: sale.id }).eq('id', scan_id)

  return NextResponse.json({ sale_id: sale.id, sale_number: saleNumber, item_count: items.length })
}

export const POST = withBusinessContext('pos/splits/ocr/from-scan', _POST)
