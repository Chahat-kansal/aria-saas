export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as ariaIntelligence } from '@/app/api/crons/aria-intelligence/route'
import { GET as reputationRequests } from '@/app/api/cron/reputation-requests/route'

// BUGFIX-CRON-1 — dispatcher for 08:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h08', [
  { name: 'aria-intelligence', fn: ariaIntelligence },
  { name: 'reputation-requests', fn: reputationRequests },
])
