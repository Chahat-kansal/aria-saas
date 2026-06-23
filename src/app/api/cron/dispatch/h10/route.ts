export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as loyaltyWinback } from '@/app/api/cron/loyalty-winback/route'

// BUGFIX-CRON-1 — dispatcher for 10:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h10', [
  { name: 'loyalty-winback', fn: loyaltyWinback },
])
