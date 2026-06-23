export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as sendScheduledCampaigns } from '@/app/api/cron/send-scheduled-campaigns/route'
import { GET as wasteReconcile } from '@/app/api/cron/waste-reconcile/route'

// BUGFIX-CRON-1 — dispatcher for 12:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h12', [
  { name: 'send-scheduled-campaigns', fn: sendScheduledCampaigns },
  { name: 'waste-reconcile', fn: wasteReconcile },
])
