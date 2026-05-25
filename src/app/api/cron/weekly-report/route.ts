export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runWeeklyReport } from '@/lib/reports/weekly-cron'
import { withErrorCapture } from '@/lib/api/with-error-capture'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

async function _GET(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: businesses } = await supabaseAdmin
    .from('businesses')
    .select('id, name, trading_name')
    .eq('onboarding_complete', true)
    .not('email', 'is', null)

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
}

export const GET = withErrorCapture('cron/weekly-report', _GET)
