export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as priceSchedules } from '@/app/api/cron/price-schedules/route'
import { GET as ariaHealthMonitor } from '@/app/api/cron/aria-health-monitor/route'

// BUGFIX-CRON-1 — dispatcher for 05:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h05', [
  { name: 'price-schedules', fn: priceSchedules },
  { name: 'aria-health-monitor', fn: ariaHealthMonitor },
])
