export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDay } from '@/lib/cron/dispatch'
import { GET as nightlySync } from '@/app/api/cron/nightly-sync/route'
import { GET as ariaBrain } from '@/app/api/cron/aria-brain/route'
import { GET as seoVerifyFixes } from '@/app/api/cron/seo-verify-fixes/route'
import { GET as xeroSync } from '@/app/api/cron/xero-sync/route'
import { GET as wasteNoonCheck } from '@/app/api/cron/waste-noon-check/route'
import { GET as industryBenchmarks } from '@/app/api/cron/industry-benchmarks/route'

// BUGFIX-CRON-1 — dispatcher for 02:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h02', [
  { name: 'nightly-sync', fn: nightlySync },
  { name: 'aria-brain', fn: ariaBrain },
  { name: 'seo-verify-fixes', fn: seoVerifyFixes },
  { name: 'xero-sync', fn: xeroSync },
  { name: 'waste-noon-check', fn: wasteNoonCheck },
  { name: 'industry-benchmarks', fn: industryBenchmarks, gate: onUTCDay(0) },
])
