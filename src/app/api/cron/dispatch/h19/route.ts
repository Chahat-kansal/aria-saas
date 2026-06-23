export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDay } from '@/lib/cron/dispatch'
import { GET as labourOptimisation } from '@/app/api/cron/labour-optimisation/route'
import { GET as inventoryFinancing } from '@/app/api/cron/inventory-financing/route'

// BUGFIX-CRON-1 — dispatcher for 19:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h19', [
  { name: 'labour-optimisation', fn: labourOptimisation },
  { name: 'inventory-financing', fn: inventoryFinancing, gate: onUTCDay(0) },
])
