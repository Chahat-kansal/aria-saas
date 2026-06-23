export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as seoCrawl } from '@/app/api/cron/seo-crawl/route'

// BUGFIX-CRON-1 — dispatcher for 07:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h07', [
  { name: 'seo-crawl', fn: seoCrawl },
])
