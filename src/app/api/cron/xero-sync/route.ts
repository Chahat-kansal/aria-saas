export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { withCronRetry } from '@/lib/api/retry'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from '@/lib/observability/logger'
import { trackCron } from '@/app/api/cron/_lib/track-cron'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

interface PosSaleRow {
  total_amount: number
  tax_amount: number | null
  payment_method: string | null
}

async function sendSms(to: string, body: string): Promise<void> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) return
  const credentials = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM_NUMBER, Body: body }),
    signal: AbortSignal.timeout(10_000),
  })
}

async function _GET(req: Request) {
  const secret = req.headers.get('x-vercel-cron-signature')
    ?? req.headers.get('authorization')?.replace('Bearer ', '')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().slice(0, 10)
  const dayStart = `${dateStr}T00:00:00.000Z`
  const dayEnd = `${dateStr}T23:59:59.999Z`

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, xero_access_token, xero_tenant_id, owner_phone, alert_sms_enabled')
    .not('xero_access_token', 'is', null)
    .not('xero_tenant_id', 'is', null)

  if (!businesses || businesses.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 })
  }

  let processed = 0
  let errors = 0

  for (const biz of businesses) {
    try {
      const { data: sales } = await supabaseAdmin
        .from('pos_sales')
        .select('total_amount, tax_amount, payment_method')
        .eq('business_id', biz.id)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)

      if (!sales || sales.length === 0) continue

      let totalSales = 0
      let totalGst = 0
      const byMethod: Record<string, { sales: number; gst: number }> = {}
      const paymentBreakdown: Record<string, number> = {}

      for (const s of sales as PosSaleRow[]) {
        const amt = Number(s.total_amount) || 0
        const gst = Number(s.tax_amount) || 0
        const method = s.payment_method ?? 'other'
        const label = method === 'cash' ? 'Cash' : method === 'card' ? 'Card/EFTPOS' : 'Other'
        totalSales += amt
        totalGst += gst
        paymentBreakdown[method] = (paymentBreakdown[method] ?? 0) + amt
        if (!byMethod[label]) byMethod[label] = { sales: 0, gst: 0 }
        byMethod[label].sales += amt
        byMethod[label].gst += gst
      }

      const lineItems = Object.entries(byMethod).map(([label, vals]) => ({
        description: `Sales — ${label}`,
        quantity: 1,
        unit_amount: vals.sales.toFixed(2),
        account_code: '200',
        tax_type: 'OUTPUT2',
        gst: vals.gst.toFixed(2),
      }))

      await supabaseAdmin.from('xero_sync_queue').insert({
        business_id: biz.id,
        sync_date: dateStr,
        status: 'pending_review',
        line_items: lineItems,
        total_sales: totalSales.toFixed(2),
        total_gst: totalGst.toFixed(2),
        total_refunds: 0,
        payment_breakdown: paymentBreakdown,
      })

      await supabaseAdmin.from('aria_actions').insert({
        business_id: biz.id,
        category: 'xero',
        title: `Xero sync ready for ${dateStr}`,
        recommendation: `Your Xero sync for ${dateStr} is ready to review — $${totalSales.toFixed(2)} sales, $${totalGst.toFixed(2)} GST. Review and approve in the integrations page.`,
        expected_impact: '0.00',
        confidence: 'high',
        status: 'pending',
        source: 'cron:xero-sync',
        priority: 'medium',
        payload: { sync_date: dateStr, total_sales: totalSales, total_gst: totalGst },
      })

      if (biz.alert_sms_enabled && biz.owner_phone) {
        try {
          await sendSms(
            biz.owner_phone as string,
            `Aria: Your Xero sync for ${dateStr} is ready. $${totalSales.toFixed(2)} sales, $${totalGst.toFixed(2)} GST. Review at ariaos.site/dashboard/integrations`,
          )
        } catch { /* non-fatal */ }
      }

      logger.info('xero-sync business done', { route: 'cron/xero-sync', businessId: biz.id })
      processed++
    } catch (e) {
      logger.error('xero-sync business failed', { route: 'cron/xero-sync', businessId: biz.id, error: (e as Error).message })
      errors++
    }
  }

  logger.info('xero-sync complete', { route: 'cron/xero-sync', processed, errors })
  return NextResponse.json({ ok: true, date: dateStr, processed, errors })
}

async function _GETTracked(req: Request) {
  return trackCron('xero-sync', async () => _GET(req))
}
export const GET = withCronRetry('xero-sync', _GETTracked)
