export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher } from '@/lib/cron/dispatch'
import { GET as parcelInsights } from '@/app/api/cron/parcel-insights/route'
import { GET as syncReviews } from '@/app/api/cron/sync-reviews/route'
import { GET as parcelSync } from '@/app/api/cron/parcel-sync/route'
import { GET as menuEngineering } from '@/app/api/cron/menu-engineering/route'
import { GET as silentBlankCheck } from '@/app/api/cron/silent-blank-check/route'
import { GET as aiFailoverAlertCheck } from '@/app/api/cron/ai-failover-alert-check/route'
import { GET as standingJobsScan } from '@/app/api/cron/standing-jobs-scan/route'
import { GET as decisionExpirySweep } from '@/app/api/cron/decision-expiry-sweep/route'
import { GET as decisionNotifySweep } from '@/app/api/cron/decision-notify-sweep/route'

// BUGFIX-CRON-1 — dispatcher for 06:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
// MONITOR-1 — 06:00 UTC = ~4pm AEST, one of 3 daily silent-blank-check runs
// (also h22, h02) folded into existing dispatch hours; no new cron entries.
// OWNER-APP PH-2 — standing-jobs-scan folded in here too, same "no new cron entry" discipline.
export const GET = (req: Request) => runDispatcher(req, 'h06', [
  { name: 'parcel-insights', fn: parcelInsights },
  { name: 'sync-reviews', fn: syncReviews },
  { name: 'parcel-sync', fn: parcelSync },
  { name: 'menu-engineering', fn: menuEngineering },
  { name: 'silent-blank-check', fn: silentBlankCheck },
  { name: 'ai-failover-alert-check', fn: aiFailoverAlertCheck },
  { name: 'standing-jobs-scan', fn: standingJobsScan },
  // TS-1 PHASE 2 — the clock. Ordered BEFORE decision-notify-sweep on purpose: expire first, then
  // notify, so the owner is never buzzed about a decision that is already stale. Runs AFTER
  // standing-jobs-scan for the same reason PH-4 does — decisions filed this morning get a full
  // window and are not expired the moment they are created.
  { name: 'decision-expiry-sweep', fn: decisionExpirySweep },
  // OWNER-APP PH-4 — runs AFTER standing-jobs-scan so decisions those jobs file this morning are
  // included in the same sweep (one grouped buzz, not two).
  { name: 'decision-notify-sweep', fn: decisionNotifySweep },
])
