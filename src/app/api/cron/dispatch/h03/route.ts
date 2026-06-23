export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { runDispatcher, onUTCDay } from '@/lib/cron/dispatch'
import { GET as dailyBriefingPoll } from '@/app/api/cron/daily-briefing-poll/route'
import { GET as syncEngagement } from '@/app/api/cron/sync-engagement/route'
import { GET as signalEngine } from '@/app/api/cron/signal-engine/route'
import { GET as customerScoring } from '@/app/api/cron/customer-scoring/route'
import { GET as seoKeywordCheck } from '@/app/api/cron/seo-keyword-check/route'
import { GET as patternMemory } from '@/app/api/cron/pattern-memory/route'

// BUGFIX-CRON-1 — dispatcher for 03:00 UTC. Runs each job in-process (auth forwarded, per-job isolated).
export const GET = (req: Request) => runDispatcher(req, 'h03', [
  { name: 'daily-briefing-poll', fn: dailyBriefingPoll },
  { name: 'sync-engagement', fn: syncEngagement },
  { name: 'signal-engine', fn: signalEngine },
  { name: 'customer-scoring', fn: customerScoring },
  { name: 'seo-keyword-check', fn: seoKeywordCheck },
  { name: 'pattern-memory', fn: patternMemory, gate: onUTCDay(1) },
])
