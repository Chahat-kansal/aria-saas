export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runWeeklyReport } from '@/lib/reports/weekly-cron'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { withRetry } from '@/lib/api/retry'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

async function _GET(req: Request) {
  return withRetry(async () => {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Select all active businesses that have weekly reports enabled
  // (weekly_report_enabled defaults to true — so include businesses without the column set too)
  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, trading_name, email, weekly_report_email, user_id')
    .eq('onboarding_complete', true)
    .eq('is_active', true)
    .or('weekly_report_enabled.is.null,weekly_report_enabled.eq.true')

  if (!businesses?.length) {
    return NextResponse.json({ ok: true, processed: 0, results: [] })
  }

  const results: Array<{ name: string; status: string }> = []

  for (const biz of businesses) {
    const bizName = (biz.trading_name as string | null) ?? (biz.name as string | null) ?? biz.id
    try {
      await runWeeklyReport(biz.id as string)
      results.push({ name: bizName, status: 'done' })
      console.log(`[weekly-report] ${bizName}: done`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      results.push({ name: bizName, status: `error: ${msg}` })
      console.error(`[weekly-report] ${bizName}: error:`, msg)
    }
  }

  return NextResponse.json({ ok: true, processed: businesses.length, results })
  }, { attempts: 3, delayMs: 3000 })
}

export const GET = withErrorCapture('cron/weekly-report', _GET)
