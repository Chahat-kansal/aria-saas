export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { isStandingJobDueToday } from '@/lib/owner-app/jobs'
import { recordEvent } from '@/lib/moat/recordEvent'

// OWNER-APP PH-2, Part A — standing jobs run on this DAILY scan (RULE 4: daily max, never
// sub-daily), folded into the existing h06 dispatcher rather than a new cron entry. Day-level
// granularity only: a schedule like 'sun_20:00' is checked as "is today Sunday, and did this job
// not already run today" — the stated hour is a display label for when the owner should expect
// results (matches this codebase's own onUTCDate(1)-style monthly gating convention, extended to
// day-of-week), not a strict cron-precision requirement this scan needs to hit exactly.
//
// Re-runs standing jobs through the SAME execution path one-shot jobs use
// (api/aria/process-user-task/generateDeliverable) — no second runner. Each due job is reset to
// 'queued' and dispatched exactly like a fresh ask, just triggered by this scan instead of the
// phone.
async function _GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const { data: standingJobs } = await supabaseAdmin
    .from('aria_user_tasks')
    .select('id, business_id, schedule, enabled, last_run_at, task_prompt, title')
    .not('schedule', 'is', null)

  const now = new Date()
  const due = (standingJobs ?? []).filter(j => isStandingJobDueToday(
    { schedule: j.schedule as string | null, enabled: j.enabled as boolean, last_run_at: j.last_run_at as string | null },
    now,
  ))

  let fired = 0
  for (const job of due) {
    const nowIso = now.toISOString()
    // Reset to queued + bump last_run_at up front, so a scan re-run this same hour (Vercel
    // retries, dispatcher re-invocation) never double-fires the same job twice in one day.
    await supabaseAdmin.from('aria_user_tasks').update({
      status: 'queued', last_run_at: nowIso, updated_at: nowIso,
      steps: [{ label: 'Queued', state: 'pending' }], progress_step: 0,
    }).eq('id', job.id)
    await recordEvent({ business_id: job.business_id as string, entity_type: 'job', entity_id: job.id as string, event_type: 'job_created', actor: 'cron' })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const cronSec = process.env.CRON_SECRET ?? ''
    // Awaited (not waitUntil) — this IS the cron invocation itself, already within its own
    // maxDuration budget; no separate client connection to decouple from.
    await fetch(appUrl + '/api/aria/process-user-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSec },
      body: JSON.stringify({ task_id: job.id, business_id: job.business_id }),
    }).catch(() => {})
    fired++
  }

  return NextResponse.json({ ok: true, scanned: (standingJobs ?? []).length, fired })
}

export const GET = withErrorCapture('cron/standing-jobs-scan', _GET)
