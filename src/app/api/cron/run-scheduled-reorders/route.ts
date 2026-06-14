export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { trackCron } from '@/app/api/cron/_lib/track-cron'

async function _GET(req: NextRequest) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const supabase = supabaseAdmin
  const nowUtc = new Date()
  const currentDay = nowUtc.getUTCDay()   // 0=Sun, 6=Sat
  const currentHour = nowUtc.getUTCHours()

  // Find schedules matching this hour + day
  const { data: schedules, error } = await supabase
    .from('pos_reorder_schedules')
    .select('*')
    .eq('enabled', true)
    .eq('day_of_week', currentDay)
    .eq('hour_utc', currentHour)

  if (error?.code === '42P01') {
    return NextResponse.json({ processed: 0, errors: 0, note: 'table_not_migrated' })
  }

  let processed = 0
  let errors = 0

  for (const schedule of (schedules ?? [])) {
    try {
      const bid = schedule.business_id

      // Call the reorder agent logic to get recommendations
      const agentRes = await fetch(
        `${req.nextUrl.origin}/api/pos/agents/reorder?action=run_now&business_id=${bid}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) }
      ).then(r => r.json()).catch(() => null)

      // Create draft PO
      const { data: numData } = await supabase.rpc('generate_po_number', { p_business_id: bid })
      const orderNumber = numData ?? `PO-${Date.now()}`
      const { data: order } = await supabase
        .from('pos_purchase_orders')
        .insert({
          business_id: bid,
          order_number: orderNumber,
          status: 'draft',
          source: 'auto_reorder',
          created_by: 'Aria Auto-Reorder',
          notes: `Auto-generated for week of ${nowUtc.toISOString().split('T')[0]}`,
        })
        .select().single()

      if (order) {
        // Add recommended lines from agent response
        const recommendations = agentRes?.recommendations ?? agentRes?.reorders ?? []
        if (recommendations.length > 0) {
          await supabase.from('pos_purchase_order_lines').insert(
            recommendations.map((r: any, i: number) => ({
              business_id: bid,
              order_id: order.id,
              product_id: r.product_id,
              product_name: r.product_name ?? r.name ?? '',
              product_sku: r.sku ?? null,
              quantity_cases: r.quantity_cases ?? r.recommended_qty ?? 1,
              quantity_items: 0,
              unit: 'case',
              suggested_price: r.unit_cost ?? null,
              sort_order: i,
            }))
          )
        }

        // Update schedule with last run info
        await supabase
          .from('pos_reorder_schedules')
          .update({ last_run_at: nowUtc.toISOString(), last_order_id: order.id })
          .eq('id', schedule.id)

        // Send email notification if enabled
        if (schedule.notify_email) {
          const { data: biz } = await supabase
            .from('businesses')
            .select('name,email')
            .eq('id', bid)
            .maybeSingle()

          if (biz?.email) {
            fetch(`${req.nextUrl.origin}/api/notifications/order-ready`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: biz.email,
                business_name: biz.name,
                order_number: orderNumber,
                order_id: order.id,
                line_count: recommendations.length,
              }),
            }).catch(() => {}) // non-blocking
          }
        }
      }

      processed++
    } catch (e) {
      console.error('[cron/run-scheduled-reorders] error for business', schedule.business_id, e)
      errors++
    }
  }

  return NextResponse.json({ processed, errors, day: currentDay, hour: currentHour })
}

async function _GETTracked(req: NextRequest) {
  return trackCron('run-scheduled-reorders', async () => _GET(req))
}
export const GET = withErrorCapture('cron/run-scheduled-reorders', _GETTracked)
