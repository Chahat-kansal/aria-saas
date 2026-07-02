export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendSMS } from '@/lib/clicksend'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { waitUntil } from '@vercel/functions'

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

  // Read current state BEFORE update — for dedup guard and notification payload.
  const { data: currentOrder } = await supabaseAdmin
    .from('pos_online_orders')
    .select('status, customer_name, customer_phone, customer_email, order_number, customer_id')
    .eq('id', id).eq('business_id', bid).maybeSingle()

  const allowed: Record<string, unknown> = { updated_at: now }
  if (body.status !== undefined) {
    allowed.status = body.status
    if (body.status === 'accepted' || body.status === 'confirmed') allowed.accepted_at = now
    if (body.status === 'rejected' || body.status === 'cancelled') {
      allowed.rejected_at = now
      if (body.rejection_reason) allowed.rejection_reason = body.rejection_reason
    }
    if (body.status === 'ready') allowed.ready_at = now
    if (body.status === 'completed') allowed.picked_up_at = now
  }

  // On accept, optionally create a POS sale and link it (idempotent).
  if ((body.status === 'accepted' || body.status === 'confirmed') && body.create_sale) {
    const { data: ord } = await supabase.from('pos_online_orders')
      .select('order_number, total, sale_id, fulfillment_type').eq('id', id).eq('business_id', bid).maybeSingle()
    if (ord && !ord.sale_id) {
      const { data: sale } = await supabase.from('pos_sales').insert({
        business_id: bid, sale_number: String(ord.order_number ?? 'ONL'), payment_method: 'other',
        total_amount: Number(ord.total ?? 0), subtotal: Number(ord.total ?? 0), tax_amount: 0, discount_amount: 0,
        status: 'completed', notes: 'Online order ' + ord.order_number + ' (' + (ord.fulfillment_type ?? 'pickup') + ')',
      }).select('id').single()
      if (sale?.id) allowed.sale_id = sale.id
    }
  }

  const { error } = await supabase.from('pos_online_orders').update(allowed).eq('id', id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── Notifications — non-blocking, one per status transition ──
  const prevStatus = currentOrder?.status
  const newStatus = body.status as string | undefined

  if (newStatus && newStatus !== prevStatus && currentOrder) {
    const orderId = id
    const businessId = bid
    const snap = currentOrder
    waitUntil((async () => {
      try {
        const { data: biz } = await supabaseAdmin
          .from('businesses').select('name, slug').eq('id', businessId).maybeSingle()
        const bizName = (biz?.name as string | null) ?? 'the café'
        const bizSlug = (biz?.slug as string | null) ?? ''
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
        const trackingUrl = appUrl + '/menu/' + bizSlug + '/order/' + (snap.order_number ?? '')
        const firstName = (snap.customer_name ?? '').split(' ')[0] || 'there'
        const orderNum = snap.order_number ?? ''

        // READY → SMS (transactional; email fallback on send failure)
        if (newStatus === 'ready' && snap.customer_phone) {
          const smsBody = 'Hi ' + firstName + ', your order ' + orderNum + ' at ' + bizName + ' is ready for collection! Track: ' + trackingUrl
          const smsResult = await sendSMS(snap.customer_phone, smsBody, {
            category: 'transactional',
            businessId,
            customerId: (snap.customer_id as string | null) ?? undefined,
          })
          if (!smsResult.ok && smsResult.error !== 'no_consent' && smsResult.error !== 'suppressed' && snap.customer_email) {
            const resendKey = process.env.RESEND_API_KEY
            if (resendKey) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: 'Aria <orders@ariaos.site>',
                  to: [snap.customer_email],
                  subject: 'Your order ' + orderNum + ' is ready! 🎉',
                  html: '<p>Hi ' + firstName + ',</p><p>Your order <strong>' + orderNum + '</strong> at <strong>' + bizName + '</strong> is ready for collection!</p><p><a href="' + trackingUrl + '">Track your order &rarr;</a></p>',
                }),
              }).catch(() => null)
            }
          }
        }

        // ACCEPTED → email receipt with tracking link
        if ((newStatus === 'accepted' || newStatus === 'confirmed') && snap.customer_email) {
          const resendKey = process.env.RESEND_API_KEY
          if (resendKey) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: 'Aria <orders@ariaos.site>',
                to: [snap.customer_email],
                subject: 'Order ' + orderNum + ' confirmed at ' + bizName,
                html: '<p>Hi ' + firstName + ',</p><p>Your order <strong>' + orderNum + '</strong> at <strong>' + bizName + '</strong> has been accepted and is being prepared.</p><p><a href="' + trackingUrl + '">Track your order live &rarr;</a></p><p>We\'ll SMS you when it\'s ready.</p>',
              }),
            }).catch(() => null)
          }
        }
      } catch (e) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: businessId,
          action_type: 'order_notify_error',
          description: '[order-notify] status=' + newStatus + ' err=' + String(e),
          metadata: { order_id: orderId, status: newStatus, error: String(e) },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/online-orders/[id]', _PATCH)