export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as outcomeCheck } from '@/app/api/cron/outcome-check/route'

// BUGFIX-CRON-1 — dispatcher for 17:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h17', [
  { name: 'outcome-check', fn: outcomeCheck },
])
