export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDay } from '@/lib/cron/dispatch'
import { GET as competitorMonitor } from '@/app/api/cron/competitor-monitor/route'
import { GET as basMonitor } from '@/app/api/cron/bas-monitor/route'
import { GET as weeklyReport } from '@/app/api/cron/weekly-report/route'

// BUGFIX-CRON-1 — dispatcher for 22:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h22', [
  { name: 'competitor-monitor', fn: competitorMonitor },
  { name: 'bas-monitor', fn: basMonitor },
  { name: 'weekly-report', fn: weeklyReport, gate: onUTCDay(0) },
])
