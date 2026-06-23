export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDay } from '@/lib/cron/dispatch'
import { GET as aeoWeekly } from '@/app/api/cron/aeo-weekly/route'
import { GET as customerAcquisition } from '@/app/api/cron/customer-acquisition/route'

// BUGFIX-CRON-1 — dispatcher for 21:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h21', [
  { name: 'aeo-weekly', fn: aeoWeekly, gate: onUTCDay(0) },
  { name: 'customer-acquisition', fn: customerAcquisition, gate: onUTCDay(1) },
])
