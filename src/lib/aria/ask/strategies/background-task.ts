/**
 * M17 · BRAIN-1 PHASE 3 — THE `background_task` LANE, WRAPPED.
 *
 * Moved from `src/app/api/aria/ask/route.ts:1008–1057`. Queues the work and returns immediately. Falls through on a queue failure.
 *
 * ⚠️ MOVED, NOT REWRITTEN. The body below is the lane's own lines. The only edits are the ones the
 * spine requires:
 *   · `return NextResponse.json(X)`  →  `return makeTurnResult('background_task', X)`
 *   · the lane's locally-declared routing regexes read `understanding.features` instead, because
 *     stage 1 already computed them from byte-identical patterns (see pipeline/features.ts)
 *   · falling off the end is now `return null` — an explicit DECLINE, which is what the original
 *     `try/catch → fall through` and `if (…)` -not-taken did implicitly
 *
 * Nothing else changed: not the order of operations, not an error message, not a comment.
 */
import { makeTurnResult } from '../pipeline/types'
import type { StrategyFn } from '../pipeline/run-turn'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { recordEvent } from '@/lib/moat/recordEvent'
import { upsertConversation } from '../pipeline/turn-persistence'

export const backgroundTaskStrategy: StrategyFn = async ({ input, understanding }) => {
  const { bid, userId, message, conversationId } = input
  const { features } = understanding
  if (features.isBackgroundTask) {
    try {
      const { data: taskRow, error: taskErr } = await supabaseAdmin.from('aria_user_tasks').insert({
        business_id: bid,
        title: message.slice(0, 120),
        task_prompt: message,
        status: 'queued',
        notify_email: true,
      }).select('id').maybeSingle()
      // WALL 6 — a failed INSERT leaves taskId undefined, the job is never dispatched, and the
      // owner is told "working on it in the background" for work that does not exist.
      if (taskErr) console.error('[aria/ask] background task INSERT failed:', taskErr.message)
      const taskId = taskRow?.id
      if (taskId) {
        // OWNER-APP PH-2, Part B — job_created event, at the actual creation point (not inside
        // process-user-task, which only ever sees an already-created row).
        await recordEvent({ business_id: bid, entity_type: 'job', entity_id: taskId, event_type: 'job_created', actor: 'owner' })
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
        const cronSec = process.env.CRON_SECRET ?? ''
        waitUntil(
          fetch(appUrl + '/api/aria/process-user-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSec },
            body: JSON.stringify({ task_id: taskId, business_id: bid }),
          }).catch(() => {}),
        )
      }
      const bgPlanBlock: import('@/lib/aria/ask-types').AskBlock = {
        type: 'task_plan',
        title: 'Working on it in the background',
        steps: [
          { label: message.slice(0, 100), status: 'running', detail: 'Aria is processing this — check back in a few minutes' },
        ],
        estimated_seconds: 120,
      }
      const bgConvId = await upsertConversation(bid, userId, conversationId, message, 'Working on it in the background — I\'ll notify you when done.', 'background_task').catch(() => conversationId)
      return makeTurnResult('background_task', {
        response: 'Working on it in the background — I\'ll notify you when done.',
        conversation_id: bgConvId ?? conversationId,
        intent: 'background_task',
        blocks: [bgPlanBlock],
        followups: [],
        used_council: false,
        cost_usd_cents: 0,
        downloads: null,
        action: null,
        tool_calls: [],
      })
    } catch (bgErr) {
      console.error('[aria/ask] background task queue failed, falling through:', (bgErr as Error).message)
    }
  }

  // Nothing in this lane claimed the turn — DECLINE, and the spine offers the next
  // candidate. This is the `fall through` the original expressed by simply running on.
  return null
}
