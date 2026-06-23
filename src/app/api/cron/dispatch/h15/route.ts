export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as hypothesisEngine } from '@/app/api/cron/hypothesis-engine/route'
import { GET as marketPriceRefresh } from '@/app/api/cron/market-price-refresh/route'

// BUGFIX-CRON-1 — dispatcher for 15:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h15', [
  { name: 'hypothesis-engine', fn: hypothesisEngine },
  { name: 'market-price-refresh', fn: marketPriceRefresh },
])
