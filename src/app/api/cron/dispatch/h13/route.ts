export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as bookingReminders } from '@/app/api/cron/booking-reminders/route'

// BUGFIX-CRON-1 — dispatcher for 13:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h13', [
  { name: 'booking-reminders', fn: bookingReminders },
])
