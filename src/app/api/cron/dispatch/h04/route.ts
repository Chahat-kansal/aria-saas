export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as loyaltyExpiry } from '@/app/api/cron/loyalty-expiry/route'
import { GET as causalAnalysis } from '@/app/api/cron/causal-analysis/route'

// BUGFIX-CRON-1 — dispatcher for 04:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h04', [
  { name: 'loyalty-expiry', fn: loyaltyExpiry },
  { name: 'causal-analysis', fn: causalAnalysis },
])
