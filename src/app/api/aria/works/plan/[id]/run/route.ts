export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { runPlan } from '@/lib/aria/works/run'
import { loadPlan } from '@/lib/aria/works/persist'
import { finishPlan } from '@/lib/aria/works/finish'
import { toNullableUuid } from '@/lib/utils/uuid-helpers'

/**
 * M11B PHASE 3 — RUN AN APPROVED PLAN'S SAFE STEPS.
 *
 * Separate from approve on purpose: an approval is a fact worth recording on its own, and keeping
 * the two apart means a re-run request cannot be mistaken for a re-approval. `runPlan` asks
 * `canRun` and then claims the plan atomically, so this route being called twice runs nothing twice.
 *
 * `maxDuration = 300` because a plan is several real writes in sequence — the platform's ceiling,
 * and the same number every cron route uses. Long-running work moving off the request is M12.
 */
async function _POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const planId = toNullableUuid(id)
  if (!planId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const claimed = typeof body.business_id === 'string' ? body.business_id : ''
  if (!claimed) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz, error: bizErr } = await supabase
    .from('businesses').select('id').eq('id', claimed).eq('user_id', user.id).maybeSingle()
  if (bizErr) {
    console.error('[works/run] business lookup failed:', bizErr.message)
    return NextResponse.json({ error: 'Could not verify the business' }, { status: 500 })
  }
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const result = await runPlan(planId, claimed, user.id)

  if (!result.ok) {
    // "Already running", "not approved yet" and "already finished" are all TRUE ANSWERS, not
    // errors — a 200 with the sentence, so the surface can show it rather than a failure banner.
    const stored = await loadPlan(planId, claimed)
    return NextResponse.json({ ran: false, note: result.reason, stored })
  }

  // M11B PHASE 4 — the run is over, so the plan is reported. Reported is NOT succeeded: a plan
  // whose every step failed still gets a report, and that report is the deliverable. It is
  // generated from the step rows, so it cannot disagree with them.
  const finished = await finishPlan(planId, claimed)
  if (!finished.ok) {
    // The steps DID run — say so, and say the report could not be written, rather than losing one
    // fact to report the other.
    console.error('[works/run] could not close the plan:', finished.reason)
  }

  return NextResponse.json({
    ran: true,
    outcomes: result.outcomes,
    report: finished.ok ? finished.report : null,
    had_failures: finished.ok ? finished.had_failures : null,
    report_error: finished.ok ? null : finished.reason,
    // Counted from the outcomes themselves, never tracked separately — a summary kept alongside
    // the record is a summary that can disagree with it.
    summary: {
      ran: result.outcomes.filter(o => o.result === 'ran').length,
      failed: result.outcomes.filter(o => o.result === 'failed').length,
      skipped: result.outcomes.filter(o => o.result === 'skipped').length,
    },
    stored: await loadPlan(planId, claimed),
  })
}

export const POST = withErrorCapture('aria/works/plan/run', _POST)
