export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

type Params = { params: Promise<{ id: string }> }

// Split engine: takes a sale and produces N sub-sales with parent_sale_id
async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // splits: Array<{ label: string; item_ids?: string[]; amount?: number }>
  const { splits } = await req.json()
  if (!splits?.length) return NextResponse.json({ error: 'splits required' }, { status: 400 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: sale } = await supabase
    .from('pos_sales').select('*, pos_sale_items(*)').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!sale) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  const allItems = (sale.pos_sale_items ?? []) as Array<{ id: string; product_id: string; product_name: string; quantity: number; unit_price: number; line_total: number }>
  const total = Number(sale.total_amount ?? 0)
  const createdSales: string[] = []

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i]
    let splitTotal = split.amount ?? total / splits.length

    // Distribute rounding to last check
    if (i === splits.length - 1) {
      const alreadyAllocated = splits.slice(0, i).reduce((s: number, s2: { amount?: number }) => s + (s2.amount ?? total / splits.length), 0)
      splitTotal = Math.max(0, total - alreadyAllocated)
    }

    const { data: splitSale } = await supabase.from('pos_sales').insert({
      business_id: bid,
      parent_sale_id: id,
      total_amount: Math.round(splitTotal * 100) / 100,
      payment_method: sale.payment_method,
      status: 'open',
      notes: `${split.label ?? `Check ${i + 1}`} (split from #${id.slice(-6).toUpperCase()})`,
    }).select('id').single()

    if (splitSale && split.item_ids?.length) {
      const splitItems = allItems.filter(it => (split.item_ids as string[]).includes(it.id))
      if (splitItems.length) {
        await supabase.from('pos_sale_items').insert(
          splitItems.map(it => ({
            sale_id: splitSale.id, product_id: it.product_id, product_name: it.product_name,
            quantity: it.quantity, unit_price: it.unit_price, business_id: bid,
          }))
        )
      }
    }

    if (splitSale) createdSales.push(splitSale.id)
  }

  // Mark original as split
  await supabase.from('pos_sales').update({ status: 'split', last_edited_at: new Date().toISOString() }).eq('id', id)

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'split', sale_id: id,
    performed_by: user.id, amount: total,
    reason_note: `Split into ${splits.length} checks`,
  })

  return NextResponse.json({ ok: true, split_sale_ids: createdSales })
}

export const POST = withErrorCapture('pos/sales/[id]/split', _POST)