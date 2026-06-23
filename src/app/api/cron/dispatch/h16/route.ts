export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as rfmDaily } from '@/app/api/cron/rfm-daily/route'
import { GET as dailyBriefingSubmit } from '@/app/api/cron/daily-briefing-submit/route'
import { GET as memoryExtract } from '@/app/api/cron/memory-extract/route'

// BUGFIX-CRON-1 — dispatcher for 16:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h16', [
  { name: 'rfm-daily', fn: rfmDaily },
  { name: 'daily-briefing-submit', fn: dailyBriefingSubmit },
  { name: 'memory-extract', fn: memoryExtract },
])
