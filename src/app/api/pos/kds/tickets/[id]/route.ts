export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture, withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { upsertAriaAction } from '@/lib/aria/upsert-aria-action'
import { waitUntil } from '@vercel/functions'
import { sendSMS } from '@/lib/clicksend'

async function _PATCH(req: Request, { params }: { params: { id: string } }, { userId, businessId: bid }: BusinessContext) {
  const { data: ticket } = await supabaseAdmin.from('pos_kds_tickets')
    .select('id, business_id, status, fired_at, bumped_at, prep_time_seconds, station, sale_id')
    .eq('id', params.id).eq('business_id', bid).maybeSingle()
  if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const action = String(body.action ?? '').toLowerCase()
  const now = new Date().toISOString()
  const update: Record<string, unknown> = { updated_at: now }
  let aria_event: string | null = null

  switch (action) {
    case 'bump':
      if (ticket.status !== 'fired' && ticket.status !== 'in_progress') {
        return NextResponse.json({ error: `Cannot bump ticket in status '${ticket.status}'` }, { status: 400 })
      }
      update.status = 'ready'
      update.bumped_at = now
      if (ticket.prep_time_seconds && ticket.fired_at) {
        const elapsed = (Date.parse(now) - Date.parse(ticket.fired_at)) / 1000
        if (elapsed > 2 * Number(ticket.prep_time_seconds)) aria_event = 'slow_ticket_bumped'
      }
      break
    case 'start':
    case 'unfire':
      if (ticket.status !== 'fired') return NextResponse.json({ error: `Cannot start in status '${ticket.status}'` }, { status: 400 })
      update.status = 'in_progress'
      break
    case 'recall':
      if (ticket.status !== 'bumped') return NextResponse.json({ error: 'Only bumped tickets can be recalled' }, { status: 400 })
      if (ticket.bumped_at) {
        const sinceBump = (Date.parse(now) - Date.parse(ticket.bumped_at)) / 1000
        if (sinceBump > 60) return NextResponse.json({ error: 'Recall window expired (60s)' }, { status: 400 })
      }
      update.status = 'fired'
      update.recalled_at = now
      update.recalled_by = userId
      update.bumped_at = null
      aria_event = 'ticket_recalled'
      break
    case 'expedite':
      update.expedited = true
      break
    case 'void':
      update.status = 'voided'
      break
    default:
      return NextResponse.json({ error: `Unknown action '${action}'` }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('pos_kds_tickets').update(update).eq('id', params.id).eq('business_id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // On bump: sync status to pos_online_orders (single status source) + notify customer
  if (action === 'bump' && ticket.sale_id) {
    const syncBid = bid
    const syncSaleId = ticket.sale_id as string
    waitUntil((async () => {
      try {
        const { data: onlineOrder } = await supabaseAdmin
          .from('pos_online_orders')
          .select('id, status, customer_name, customer_phone, customer_email, order_number, customer_id')
          .eq('sale_id', syncSaleId)
          .eq('business_id', syncBid)
          .maybeSingle()

        if (!onlineOrder || onlineOrder.status === 'ready' || onlineOrder.status === 'completed') return

        const readyNow = new Date().toISOString()
        await supabaseAdmin.from('pos_online_orders')
          .update({ status: 'ready', ready_at: readyNow, updated_at: readyNow })
          .eq('id', (onlineOrder as { id: string }).id)

        // Notify customer their order is ready
        const snap = onlineOrder as { id: string; customer_name: string | null; customer_phone: string | null; customer_email: string | null; order_number: string | null; customer_id: string | null }
        const { data: biz } = await supabaseAdmin.from('businesses').select('name, slug').eq('id', syncBid).maybeSingle()
        const bizName = (biz?.name as string | null) ?? 'the café'
        const bizSlug = (biz?.slug as string | null) ?? ''
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'
        const trackingUrl = appUrl + '/menu/' + bizSlug + '/order/' + (snap.order_number ?? '')
        const firstName = (snap.customer_name ?? '').split(' ')[0] || 'there'
        const orderNum = snap.order_number ?? ''

        if (snap.customer_phone) {
          const smsBody = 'Hi ' + firstName + ', your order ' + orderNum + ' at ' + bizName + ' is ready for collection! Track: ' + trackingUrl
          const smsResult = await sendSMS(snap.customer_phone, smsBody, {
            category: 'transactional',
            businessId: syncBid,
            customerId: snap.customer_id ?? undefined,
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
        } else if (snap.customer_email) {
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
      } catch (e) {
        void supabaseAdmin.from('activity_log').insert({
          business_id: syncBid,
          action_type: 'kds_online_sync_error',
          description: '[kds/bump] online order sync failed: ' + (e as Error).message,
          metadata: { sale_id: syncSaleId },
          created_at: new Date().toISOString(),
        })
      }
    })())
  }

  if (aria_event) {
    try {
      await upsertAriaAction({
        business_id: bid,
        category: 'sales',
        title: aria_event === 'slow_ticket_bumped' ? `Slow ticket: ${ticket.station}` : `Recall: ${ticket.station}`,
        recommendation: aria_event === 'slow_ticket_bumped'
          ? `Ticket at ${ticket.station} took 2× target prep time. Investigate station throughput.`
          : `Ticket recalled at ${ticket.station} — was bumped too early.`,
        reason: null,
        expected_impact: '0.00',
        confidence: 'medium',
        status: 'pending',
        source: `kds:${aria_event}`,
        payload: { ticket_id: ticket.id, station: ticket.station, prep_time_seconds: ticket.prep_time_seconds },
        priority: 'low',
      })
    } catch (e) { console.error('[silent-catch]', e) }
  }

  return NextResponse.json({ ok: true })
}

export const PATCH = withBusinessContext('pos/kds/tickets/[id]', _PATCH)
