export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as marketingAutomations } from '@/app/api/cron/marketing-automations/route'
import { GET as wastePrepGuide } from '@/app/api/cron/waste-prep-guide/route'

// BUGFIX-CRON-1 — dispatcher for 11:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h11', [
  { name: 'marketing-automations', fn: marketingAutomations },
  { name: 'waste-prep-guide', fn: wastePrepGuide },
])
