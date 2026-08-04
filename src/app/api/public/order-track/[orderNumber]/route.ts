export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveBusinessId } from '@/lib/aria/resolve-business'
import { recoverSaleForOnlineOrder } from '@/lib/pos/recover-online-order-sale'
import { promoteOnlineSaleToCompleted } from '@/lib/pos/promote-online-sale'

type Params = { params: Promise<{ orderNumber: string }> | { orderNumber: string } }

// S-ORD-CONFIRM — this route is the customer's source of truth. It previously returned only
// fulfilment fields, so the client could not distinguish "paid and confirmed" from "payment still
// processing" and fell back to reading confirmation from the checkout POST response — which makes a
// dropped response indistinguishable from a failed order, while the kitchen already has it and the
// card is already charged. payment_status and has_sale are now returned so the client renders the
// real state instead of inferring one.
export async function GET(req: Request, { params }: Params) {
  const { orderNumber } = 'then' in params ? await params : params
  const { searchParams } = new URL(req.url)
  const slug = searchParams.get('slug')

  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const bid = await resolveBusinessId(supabaseAdmin, slug)
  if (!bid) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: order } = await supabaseAdmin
    .from('pos_online_orders')
    .select('id, status, estimated_ready_at, updated_at, picked_up_at, order_number, total, fulfillment_type, stripe_payment_status, sale_id')
    .eq('order_number', orderNumber)
    .eq('business_id', bid)
    .maybeSingle()

  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // S-ORD-CONFIRM §3 — paid, but no sale. place-order creates the sale BEFORE payment and swallows
  // its failure into activity_log, so a failed createSale leaves a real, paid order with sale_id
  // NULL: no revenue row, no stock decrement, no loyalty earn. Recovered here because this is the
  // one path guaranteed to run afterwards — the customer is sitting on it, polling.
  // Deliberately NOT attempted while payment is 'pending': that is an unpaid order, not a lost sale.
  let saleId = (order.sale_id as string | null) ?? null
  if (!saleId && order.stripe_payment_status === 'succeeded') {
    saleId = await recoverSaleForOnlineOrder(bid, order.id as string)
  }
  // FIX-ONLINE-PAY-1 A3 — the sale now EXISTS at placement but starts 'pending' for card orders, so
  // the miss this recovery was written for has changed shape: the common failure is no longer a
  // missing sale, it is a sale stuck 'pending' because the webhook never landed. Same trigger
  // (payment succeeded), same idempotent promotion the webhook uses.
  if (saleId && order.stripe_payment_status === 'succeeded') {
    await promoteOnlineSaleToCompleted(order.id as string, bid)
  }

  return NextResponse.json({
    status: order.status,
    estimated_ready_at: order.estimated_ready_at,
    updated_at: order.updated_at,
    picked_up_at: order.picked_up_at,
    order_number: order.order_number,
    total: order.total,
    fulfillment_type: order.fulfillment_type,
    // The two fields that let the client stop guessing.
    payment_status: (order.stripe_payment_status as string | null) ?? null,
    has_sale: !!saleId,
  })
}
