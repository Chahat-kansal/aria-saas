export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as leaveAccrual } from '@/app/api/cron/leave-accrual/route'
import { GET as markOverdue } from '@/app/api/cron/mark-overdue/route'
import { GET as xeroAutoSync } from '@/app/api/cron/xero-auto-sync/route'

// BUGFIX-CRON-1 — dispatcher for 01:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h01', [
  { name: 'leave-accrual', fn: leaveAccrual },
  { name: 'mark-overdue', fn: markOverdue },
  { name: 'xero-auto-sync', fn: xeroAutoSync },
])
