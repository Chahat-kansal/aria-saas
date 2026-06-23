export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as parcelInsights } from '@/app/api/cron/parcel-insights/route'
import { GET as syncReviews } from '@/app/api/cron/sync-reviews/route'
import { GET as parcelSync } from '@/app/api/cron/parcel-sync/route'
import { GET as menuEngineering } from '@/app/api/cron/menu-engineering/route'

// BUGFIX-CRON-1 — dispatcher for 06:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h06', [
  { name: 'parcel-insights', fn: parcelInsights },
  { name: 'sync-reviews', fn: syncReviews },
  { name: 'parcel-sync', fn: parcelSync },
  { name: 'menu-engineering', fn: menuEngineering },
])
