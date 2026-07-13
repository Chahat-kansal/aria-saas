export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as hypothesisEngineBatchSubmit } from '@/app/api/cron/hypothesis-engine-batch-submit/route'
import { GET as marketPriceRefresh } from '@/app/api/cron/market-price-refresh/route'

// BUGFIX-CRON-1 — dispatcher for 15:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
// AI-COST-2 — hypothesis-engine moved to the Batch API pattern (submit here, poll at h03 alongside
// daily-briefing-poll — see hypothesis-engine-batch-submit/-poll). The old realtime
// src/app/api/cron/hypothesis-engine/route.ts is left in place, untouched, just no longer scheduled.
export const GET = (req: Request) => runDispatcher(req, 'h15', [
  { name: 'hypothesis-engine-batch-submit', fn: hypothesisEngineBatchSubmit },
  { name: 'market-price-refresh', fn: marketPriceRefresh },
])
