export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runOutcomeChecks, runAutopilotOutcomeChecks, runHypothesisOutcomeClosure } from '@/lib/aria/hypothesis/outcome-learning'
import { logAICallSafe } from '@/lib/aria/log-ai-call'

export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

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

    let totalChecked = 0, totalMemories = 0, totalBackfilled = 0, totalResolved = 0, totalHypClosed = 0
    const errors: Array<{ business_id: string; error: string }> = []

    for (const biz of (businesses ?? [])) {
      try {
        // I4 OUTCOME-LOOP-1 PART 5: hypothesis closure runs AFTER the outcome checks so it reads
        // the freshly-resolved verdicts (runOutcomeChecks writes the outcome verdict this same pass).
        const [{ checked, memories_written }, { backfilled, resolved }] = await Promise.all([
          runOutcomeChecks(biz.id),
          runAutopilotOutcomeChecks(biz.id),
        ])
        const { closed } = await runHypothesisOutcomeClosure(biz.id)
        totalChecked    += checked
        totalMemories   += memories_written
        totalBackfilled += backfilled
        totalResolved   += resolved
        totalHypClosed  += closed
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
        total_hypotheses_closed: totalHypClosed,
        ...(errors.length ? { items: errors } : {}),
      },
    }).eq('id', cronLogId)

    // I4 PART 5: audit the outcome-check run (role 'analysis', provider 'other' — valid CHECK values)
    void logAICallSafe({
      business_id: null, agent_key: 'outcome_check', role: 'analysis', provider: 'other', success: errors.length === 0,
      request_summary: `businesses:${(businesses ?? []).length}`,
      response_summary: JSON.stringify({ outcomes_checked: totalChecked, memories_written: totalMemories, autopilot_resolved: totalResolved, hypotheses_closed: totalHypClosed }).slice(0, 200),
    })

    return NextResponse.json({ ok: true, outcomes_checked: totalChecked, memories_written: totalMemories, autopilot_backfilled: totalBackfilled, autopilot_resolved: totalResolved, hypotheses_closed: totalHypClosed })
  } catch (e) {
    const msg = (e as Error).message
    await supabaseAdmin.from('cron_logs').update({ status: 'failed', finished_at: new Date().toISOString(), errors: { message: msg } }).eq('id', cronLogId)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
