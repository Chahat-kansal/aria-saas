export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { verifyManagerToken } from '@/lib/pos/manager-token'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'

type Params = { params: Promise<{ id: string }> }

async function _POST(req: Request, { params }: Params) {
  const { id } = await params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { manager_token, reason_code, reason_note, amount, items: refundItems } = await req.json()
  const managerId = manager_token ? verifyManagerToken(manager_token) : null
  if (!managerId) return NextResponse.json({ error: 'Valid manager PIN required' }, { status: 403 })

  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', user.id).maybeSingle()
  const bid = active?.business_id ?? null
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const { data: original } = await supabase.from('pos_sales').select('*').eq('id', id).eq('business_id', bid).maybeSingle()
  if (!original) return NextResponse.json({ error: 'Sale not found' }, { status: 404 })

  const refundAmount = amount ?? original.total_amount
  const { data: refundSale } = await supabase.from('pos_sales').insert({
    business_id: bid,
    parent_sale_id: id,
    total_amount: -(Math.abs(refundAmount)),
    payment_method: original.payment_method,
    status: 'refund',
    notes: `Refund of sale ${id.slice(-6).toUpperCase()}${reason_note ? ': ' + reason_note : ''}`,
  }).select().single()

  // Insert refund items if specified
  if (refundItems?.length && refundSale) {
    await supabase.from('pos_sale_items').insert(
      refundItems.map((it: { product_id: string; product_name: string; quantity: number; unit_price: number }) => ({
        sale_id: refundSale.id,
        product_id: it.product_id,
        product_name: it.product_name,
        quantity: -(Math.abs(it.quantity)),
        unit_price: it.unit_price,
        business_id: bid,
      }))
    )
    // Restore stock for refunded items — CANONICAL items_on_hand (+ stock_quantity cache). (INV-DECREMENT-FIX phase 2)
    const refundOutletId = await resolveOutletId(supabase, bid, (original as { outlet_id?: string | null }).outlet_id ?? null)
    for (const it of refundItems) {
      await supabase.rpc('increment_numeric', { p_table: 'pos_products', p_id: it.product_id, p_column: 'stock_quantity', p_amount: Math.abs(it.quantity) }) // cache
      await adjustOutletStock(supabase, { businessId: bid, outletId: refundOutletId, productId: it.product_id, delta: Math.abs(Number(it.quantity)) }) // canonical
    }
  }

  await supabase.from('pos_audit_log').insert({
    business_id: bid, action: 'refund', reason_code: reason_code ?? 'customer_request',
    reason_note, amount: refundAmount, sale_id: id,
    performed_by: user.id, manager_approved_by: managerId,
  })

  return NextResponse.json({ ok: true, refund_sale_id: refundSale?.id })
}

export const POST = withErrorCapture('pos/sales/[id]/refund', _POST)