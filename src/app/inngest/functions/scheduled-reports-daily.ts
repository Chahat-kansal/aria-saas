import { inngest } from '../client'
import { runSendScheduledReports } from '@/lib/reports/send-scheduled-reports'

/**
 * INFRA-INNGEST-1 — the daily scheduled-reports send, running on Inngest.
 *
 * RUNS IN PARALLEL, ON PURPOSE. The Vercel cron (`/api/cron/dispatch/h20` -> that route's GET) is
 * still in place and still authoritative. This sprint proves the Inngest path fires; retiring the
 * Vercel one is INFRA-INNGEST-2. Until then BOTH run at 20:00 UTC.
 *
 * DOUBLE-SEND IS BLOCKED BY THE DATA, NOT BY LUCK: the underlying job skips any schedule whose
 * `last_sent_at` is already today (`String(last_sent_at).slice(0,10) === todayStr`), and stamps
 * `last_sent_at` immediately after each send. Whichever of the two runners gets there first claims
 * the day; the second finds the rows already stamped and sends nothing. The same guard is what
 * makes step.run()'s retries safe.
 *
 * ONE IMPLEMENTATION: this imports runSendScheduledReports() rather than reproducing the logic, so
 * the two schedulers can never drift apart. It lives in src/lib/reports/ because Next.js rejects
 * arbitrary named exports from a route.ts — see that file's header for the exact compiler error.
 */
export const scheduledReportsDaily = inngest.createFunction(
  {
    id: 'scheduled-reports-daily',
    name: 'Daily scheduled reports (PDF email)',
    // One run at a time. If a previous day's run is somehow still going, do not stack a second.
    concurrency: 1,
    // Matches the EXISTING Vercel schedule exactly: crons entry `/api/cron/dispatch/h20` is
    // "0 20 * * *", which Vercel evaluates in UTC. TZ is pinned explicitly so this stays identical
    // regardless of Inngest's default, rather than relying on the two platforms agreeing.
    // (v4 takes triggers inside the options object; the v3 3-argument form no longer compiles.)
    triggers: [{ cron: 'TZ=UTC 0 20 * * *' }],
  },
  async ({ step }) => {
    // step.run() makes this durable: the result is checkpointed, and a transient failure retries
    // the step rather than silently vanishing the way an unawaited waitUntil() would.
    // step.run() is typed to return `unknown` in v4 (its result crosses a serialisation boundary,
    // so the SDK will not assume the in-process type survives). Annotating with the function's own
    // return type keeps that honest without an `any`.
    const result = await step.run(
      'send-scheduled-reports',
      () => runSendScheduledReports(),
    ) as Awaited<ReturnType<typeof runSendScheduledReports>>

    // Counts only — no business names, recipient emails, or report contents. This return value is
    // visible in the Inngest dashboard, which is outside our own access controls.
    return {
      ok: result.ok,
      sent: result.sent,
      total: result.total ?? 0,
    }
  },
)
