export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as notifyReady } from '@/app/api/cron/notify-ready/route'

// BUGFIX-CRON-1 — dispatcher for 23:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h23', [
  { name: 'notify-ready', fn: notifyReady },
])
