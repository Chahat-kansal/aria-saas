export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runOutcomeChecks, runAutopilotOutcomeChecks } from '@/lib/aria/hypothesis/outcome-learning'

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cronLogId = crypto.randomUUID()
  await supabaseAdmin.from('cron_logs').insert({
    id: cronLogId, job_name: 'outcome-check', status: 'running', started_at: new Date().toISOString(),
  })

  try {
    // Expire stale pending aria_actions older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: expireErr } = await supabaseAdmin
      .from('aria_actions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .lt('created_at', thirtyDaysAgo)
    if (expireErr) console.error('[outcome-check] stale expiry failed:', expireErr.message)

    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trialing'])

    let totalChecked = 0, totalMemories = 0, totalBackfilled = 0, totalResolved = 0
    const errors: Array<{ business_id: string; error: string }> = []

    for (const biz of (businesses ?? [])) {
      try {
        const [{ checked, memories_written }, { backfilled, resolved }] = await Promise.all([
          runOutcomeChecks(biz.id),
          runAutopilotOutcomeChecks(biz.id),
        ])
        totalChecked    += checked
        totalMemories   += memories_written
        totalBackfilled += backfilled
        totalResolved   += resolved
      } catch (e) {
        errors.push({ business_id: biz.id, error: (e as Error).message.slice(0, 200) })
      }
    }

    await supabaseAdmin.from('cron_logs').update({
      status: errors.length > 0 ? 'failed' : 'completed',
      finished_at: new Date().toISOString(),
      businesses_processed: (businesses ?? []).length,
      errors: {
        total_outcomes_checked: totalChecked,
        total_memories_written: totalMemories,
        total_autopilot_backfilled: totalBackfilled,
        total_autopilot_resolved: totalResolved,
        ...(errors.length ? { items: errors } : {}),
      },
    }).eq('id', cronLogId)

    return NextResponse.json({ ok: true, outcomes_checked: totalChecked, memories_written: totalMemories, autopilot_backfilled: totalBackfilled, autopilot_resolved: totalResolved })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
