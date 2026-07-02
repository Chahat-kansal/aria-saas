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

  // ── KDS fire — non-blocking, on first accept/confirm only ──
  if (
    (newStatus === 'accepted' || newStatus === 'confirmed') &&
    prevStatus !== 'accepted' && prevStatus !== 'confirmed'
  ) {
    const fireOrderId = id
    const fireBid = bid
    waitUntil((async () => {
      try {
        const { data: ord } = await supabaseAdmin
          .from('pos_online_orders')
          .select('order_number, items, sale_id, outlet_id, stripe_payment_intent_id, stripe_payment_status, notes, special_instructions')
          .eq('id', fireOrderId)
          .maybeSingle()

        // Gate: card payments must be confirmed before KDS fires
        const stripePI = (ord as { stripe_payment_intent_id?: string | null } | null)?.stripe_payment_intent_id
        const stripeStatus = (ord as { stripe_payment_status?: string | null } | null)?.stripe_payment_status
        if (stripePI && stripeStatus !== 'succeeded') {
          void supabaseAdmin.from('activity_log').insert({
            business_id: fireBid, action_type: 'kds_fire_blocked_unpaid',
            description: '[online-orders] KDS fire blocked — payment not confirmed for order ' + ((ord as { order_number?: string } | null)?.order_number ?? ''),
            metadata: { order_id: fireOrderId, stripe_pi: stripePI, stripe_status: stripeStatus },
            created_at: new Date().toISOString(),
          })
          return
        }

        const items = (ord?.items ?? []) as Array<{
          product_id?: string; product_name?: string; quantity?: number;
          modifiers?: Array<{ name: string }>;
          config?: { removed?: Array<{ name: string }>; added?: Array<{ name: string; priceCents?: number }> };
          note?: string
        }>
        if (!items.length) return

        const productIds = [...new Set(items.map(i => i.product_id).filter((id): id is string => !!id))]
        const dietaryMap: Record<string, string[]> = {}
        if (productIds.length > 0) {
          const { data: prods } = await supabaseAdmin
            .from('pos_products')
            .select('id, is_gluten_free, is_vegan, is_vegetarian')
            .in('id', productIds)
          for (const p of (prods ?? [])) {
            const prod = p as { id: string; is_gluten_free: boolean | null; is_vegan: boolean | null; is_vegetarian: boolean | null }
            const tags: string[] = []
            if (prod.is_gluten_free) tags.push('⚠ GLUTEN FREE')
            if (prod.is_vegan) tags.push('⚠ VEGAN')
            else if (prod.is_vegetarian) tags.push('⚠ VEGETARIAN')
            if (tags.length) dietaryMap[prod.id] = tags
          }
        }

        const now = new Date().toISOString()
        const orderNum = (ord?.order_number as string | null) ?? ''
        const saleId = (ord?.sale_id as string | null) ?? null
        const orderNotes = (ord as { notes?: string | null; special_instructions?: string | null } | null)?.notes
          ?? (ord as { notes?: string | null; special_instructions?: string | null } | null)?.special_instructions
          ?? null

        // Idempotency guard — bail if a KDS row already exists for this sale
        if (saleId) {
          const { data: existingKds } = await supabaseAdmin
            .from('pos_kds_orders').select('id')
            .eq('sale_id', saleId).eq('business_id', fireBid).maybeSingle()
          if (existingKds) return
        }

        // Write one pos_kds_orders row (all items in JSONB) — same table + shape as in-store POS
        const kdsItems = items.map(item => {
          const pName = item.product_name ?? 'Item'
          const removed = item.config?.removed ?? []
          const added = item.config?.added ?? []
          const mods = item.modifiers ?? []
          const modLines: string[] = []
          for (const d of (dietaryMap[item.product_id ?? ''] ?? [])) modLines.push(d)
          for (const r of removed) modLines.push('NO ' + r.name.toUpperCase())
          for (const a of added) modLines.push('+' + a.name)
          for (const m of mods) modLines.push(m.name)
          if (item.note) modLines.push('NOTE: ' + item.note)
          return {
            name: pName,
            qty: item.quantity ?? 1,
            modifiers: modLines,
            ...(item.note ? { special_instructions: item.note } : {}),
          }
        })

        await supabaseAdmin.from('pos_kds_orders').insert({
          business_id: fireBid,
          sale_id: saleId,
          table_number: '#' + orderNum + ' ONLINE',
          items: kdsItems,
          status: 'new',
          priority: 1,
          notes: orderNotes,
          created_at: now,
        })
      } catch (kdsErr) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: fireBid,
          action_type: 'online_kds_fire_error',
          description: '[online-orders] KDS fire failed: ' + (kdsErr as Error).message,
          metadata: { order_id: fireOrderId },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withErrorCapture('pos/online-orders/[id]', _PATCH)