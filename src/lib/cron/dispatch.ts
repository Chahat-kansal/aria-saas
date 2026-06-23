import { NextRequest } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'

// BUGFIX-CRON-1 — cron dispatcher. Vercel Pro caps at 40 cron entries; we had 57. Each distinct schedule-time
// gets ONE registered cron (a dispatcher) that fans out to that time's jobs by IMPORTING + calling each job's
// real GET handler in-process (no HTTP self-call → no auth/timeout/self-invocation issues). The dispatcher
// verifies CRON_SECRET, then forwards the exact Authorization header to each job so every job's own auth passes
// identically. Each job runs in its own try/catch (one failure never aborts the rest). Weekly/monthly jobs are
// day-gated (UTC, matching the original cron dow/dom semantics) so they only fire on their correct day.

export interface CronJob {
  name: string
  // NextRequest param accepts both Request- and NextRequest-typed route handlers (contravariance); the
  // dispatcher constructs a real NextRequest so handlers that read nextUrl work in-process.
  fn: (req: NextRequest) => Promise<Response> | Response
  gate?: (now: Date) => boolean
}

export async function runDispatcher(req: Request, name: string, jobs: CronJob[]): Promise<Response> {
  const denied = verifyCronAuth(req)
  if (denied) return denied

  const auth = req.headers.get('authorization') ?? ''
  const now = new Date()
  const ran: Array<Record<string, unknown>> = []

  for (const job of jobs) {
    if (job.gate && !job.gate(now)) { ran.push({ job: job.name, skipped: 'not scheduled today' }); continue }
    const t0 = Date.now()
    try {
      // In-process call with the forwarded cron auth header — the job's own verifyCronAuth passes.
      const res = await job.fn(new NextRequest(`https://cron.internal/api/cron/${job.name}`, { headers: { authorization: auth } }))
      ran.push({ job: job.name, ok: res.status < 400, status: res.status, ms: Date.now() - t0 })
    } catch (e) {
      // Per-job isolation: a throw is logged and the loop continues to the next job.
      ran.push({ job: job.name, ok: false, error: (e as Error).message, ms: Date.now() - t0 })
    }
  }

  console.log(`[cron-dispatch:${name}] ` + JSON.stringify({ count: ran.length, ran }))
  return Response.json({ dispatcher: name, at: now.toISOString(), count: ran.length, ran })
}

// Gate helpers — UTC, matching cron dow (0=Sun..6=Sat) / day-of-month, the unit Vercel schedules in.
export const onUTCDay = (dow: number) => (now: Date) => now.getUTCDay() === dow
export const onUTCDate = (date: number) => (now: Date) => now.getUTCDate() === date
