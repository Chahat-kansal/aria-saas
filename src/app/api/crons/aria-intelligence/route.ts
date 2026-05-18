export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 55

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { checkCompetitorPrices } from '@/lib/aria/intelligence/competitor'
import { sendDailySummaryReport } from '@/lib/aria/intelligence/email-report'
import { checkConditionAlerts } from '@/lib/aria/intelligence/alerts'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET ?? ''
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // AEST = UTC+10 (ignoring DST for simplicity)
  const hourAEST = (now.getUTCHours() + 10) % 24
  const dayOfWeek = now.getUTCDay() || 7 // 1=Mon … 7=Sun

  const results = {
    competitor_checks: 0,
    reports_sent: 0,
    alerts_fired: 0,
    errors: [] as string[],
  }

  const { data: businesses } = await supabaseAdmin.from('businesses')
    .select('id').eq('is_active', true).limit(200)

  for (const biz of businesses ?? []) {
    const businessId = String(biz.id)

    // Condition alerts — every hour
    try {
      results.alerts_fired += await checkConditionAlerts(businessId)
    } catch (e) {
      results.errors.push(`alerts:${businessId}: ${(e as Error).message}`)
    }

    // Competitor checks — once daily at 9am AEST
    if (hourAEST === 9) {
      const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
        .select('*').eq('business_id', businessId).eq('is_active', true)
      for (const watch of watches ?? []) {
        try {
          await checkCompetitorPrices(
            businessId,
            String(watch.id),
            String(watch.competitor_name),
            watch.competitor_url ? String(watch.competitor_url) : null,
            Array.isArray(watch.products_to_watch) ? (watch.products_to_watch as unknown[]).map(String) : [],
          )
          results.competitor_checks++
        } catch (e) {
          results.errors.push(`competitor:${String(watch.id)}: ${(e as Error).message}`)
        }
      }
    }

    // Scheduled reports — check each at its configured hour
    const { data: schedules } = await supabaseAdmin.from('aria_scheduled_reports')
      .select('*').eq('business_id', businessId).eq('is_active', true)

    for (const schedule of schedules ?? []) {
      const sendAtHour = Number(schedule.send_at_hour) || 18
      const sendOnDays = Array.isArray(schedule.send_on_days)
        ? (schedule.send_on_days as unknown[]).map(Number)
        : [1, 2, 3, 4, 5, 6, 7]

      if (hourAEST !== sendAtHour) continue
      if (!sendOnDays.includes(dayOfWeek)) continue

      const lastSent = schedule.last_sent_at ? new Date(String(schedule.last_sent_at)) : null
      if (lastSent && lastSent.toDateString() === now.toDateString()) continue

      const recipients = Array.isArray(schedule.recipients)
        ? (schedule.recipients as unknown[]).map(String).filter(Boolean)
        : []
      if (recipients.length === 0) continue

      try {
        let sent = false
        if (String(schedule.report_type) === 'daily_summary') {
          sent = await sendDailySummaryReport(businessId, recipients)
        }
        if (sent) {
          await supabaseAdmin.from('aria_scheduled_reports').update({
            last_sent_at: now.toISOString(),
          }).eq('id', String(schedule.id))
          results.reports_sent++
        }
      } catch (e) {
        results.errors.push(`report:${String(schedule.id)}: ${(e as Error).message}`)
      }
    }
  }

  return NextResponse.json({ ok: true, ...results, checked_at: now.toISOString() })
}
