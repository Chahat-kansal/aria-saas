export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDate } from '@/lib/cron/dispatch'
import { GET as sendScheduledReports } from '@/app/api/cron/send-scheduled-reports/route'
import { GET as councilSession } from '@/app/api/cron/council-session/route'
import { GET as reconciliation } from '@/app/api/cron/reconciliation/route'
import { GET as supplierNegotiation } from '@/app/api/cron/supplier-negotiation/route'

// BUGFIX-CRON-1 — dispatcher for 20:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h20', [
  { name: 'send-scheduled-reports', fn: sendScheduledReports },
  { name: 'council-session', fn: councilSession },
  { name: 'reconciliation', fn: reconciliation },
  { name: 'supplier-negotiation', fn: supplierNegotiation, gate: onUTCDate(1) },
])
