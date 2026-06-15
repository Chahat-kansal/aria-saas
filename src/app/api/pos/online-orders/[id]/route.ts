export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sendSMS } from '@/lib/clicksend'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

type Params = { params: Promise<{ id: string }> | { id: string } }

async function _PATCH(req: Request, { params }: Params) {
  const { id } = 'then' in params ? await params : params
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const now = new Date().toISOString()
  const allowed: Record<string, unknown> = { updated_at: now }
  // WIRE-6 — advance the state machine, stamping the matching timestamp column for each transition.
  if (body.status !== undefined) {
    allowed.status = body.status
    if (body.status === 'accepted' || body.status === 'confirmed') allowed.accepted_at = now
    if (body.status === 'rejected' || body.status === 'cancelled') { allowed.rejected_at = now; if (body.rejection_reason) allowed.rejection_reason = body.rejection_reason }
    if (body.status === 'ready') allowed.ready_at = now
    if (body.status === 'completed') allowed.picked_up_at = now
  }

  // On accept, optionally create a POS sale and link it (sale_id) so the online order flows into
  // takings — idempotent (skip if this order already has a sale_id).
  if ((body.status === 'accepted' || body.status === 'confirmed') && body.create_sale) {
    const { data: ord } = await supabase.from('pos_online_orders')
      .select('order_number, total, sale_id, fulfillment_type').eq('id', id).eq('business_id', bid).maybeSingle()
    if (ord && !ord.sale_id) {
      const { data: sale } = await supabase.from('pos_sales').insert({
        business_id: bid, sale_number: String(ord.order_number ?? 'ONL'), payment_method: 'other',
        total_amount: Number(ord.total ?? 0), subtotal: Number(ord.total ?? 0), tax_amount: 0, discount_amount: 0,
        status: 'completed', notes: `Online order ${ord.order_number} (${ord.fulfillment_type ?? 'pickup'})`,
      }).select('id').single()
      if (sale?.id) allowed.sale_id = sale.id
    }
  }

  const { error } = await supabase.from('pos_online_orders').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If marking as ready: send SMS via Twilio (non-blocking)
  if (body.status === 'ready') {
    const { data: order } = await supabase.from('pos_online_orders')
      .select('customer_name, customer_phone, order_number, business_id').eq('id', id).maybeSingle()
    if (order?.customer_phone) {
      const { data: biz } = await supabase.from('businesses').select('name').eq('id', order.business_id).maybeSingle()
      const msg = `Hi ${order.customer_name?.split(' ')[0] ?? 'there'}, your order ${order.order_number} at ${biz?.name ?? 'the cafe'} is ready for collection! 🎉`
      sendSMS(order.customer_phone, msg).catch(() => null)
    }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/online-orders/[id]', _PATCH)
