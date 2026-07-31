export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/cron'
import { runSendScheduledReports } from '@/lib/reports/send-scheduled-reports'

// INFRA-INNGEST-1 — the job body moved to src/lib/reports/send-scheduled-reports.ts so the Inngest
// function can import it (Next.js forbids arbitrary named exports from a route file). This route is
// UNCHANGED in behaviour: same auth gate, same JSON response, still wired into dispatch/h20, still
// the authoritative cron path until INFRA-INNGEST-2 retires it.
export async function GET(req: Request) {
  const denied = verifyCronAuth(req)
  if (denied) return denied
  return NextResponse.json(await runSendScheduledReports())
}
