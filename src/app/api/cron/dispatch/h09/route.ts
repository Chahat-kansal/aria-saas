export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as publishScheduled } from '@/app/api/cron/publish-scheduled/route'
import { GET as loyaltyBirthday } from '@/app/api/cron/loyalty-birthday/route'
import { GET as timedPrices } from '@/app/api/cron/timed-prices/route'
import { GET as trialWarnings } from '@/app/api/cron/trial-warnings/route'
import { GET as invoicesRecurring } from '@/app/api/cron/invoices-recurring/route'

// BUGFIX-CRON-1 — dispatcher for 09:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h09', [
  { name: 'publish-scheduled', fn: publishScheduled },
  { name: 'loyalty-birthday', fn: loyaltyBirthday },
  { name: 'timed-prices', fn: timedPrices },
  { name: 'trial-warnings', fn: trialWarnings },
  { name: 'invoices-recurring', fn: invoicesRecurring },
])
