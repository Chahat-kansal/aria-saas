export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { checkRateLimit } from '@/lib/rate-limit'
import { callAnthropic, callAnthropicWithTools, type ToolLoopResult } from '@/lib/aria/providers/anthropic'
import { isAnthropicCircuitOpen, recordAnthropicFailure, recordAnthropicSuccess, recordAnthropicFallbackProvider, recordTotalOutage, isAnthropicUnreachable } from '@/lib/aria/circuit-breaker'
import { degradedGroundedAnswer } from '@/lib/aria/degraded-answer'
import { findCachedAnswer } from '@/lib/aria/cached-answer'
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools'
import { slimTools, slimSystemPrompt } from '@/lib/aria/slim-context'
import { classifyIntent, detectOutputFormat } from '@/lib/aria/ask/intent'
import { classifyAriaIntent } from '@/lib/aria/ask/aria-intent'
import { buildAskAriaContext, type ContextScope } from '@/lib/aria/ask/business-context'
// buildSystemPrompt replaced by inline Aria OS prompt below
// ARTIFACT_INSTRUCTIONS removed — xml <aria_artifact> format superseded by json_blocks
import { checkCostCeiling } from '@/lib/aria-cost-guard'
import { buildTroubleshootContext, buildTroubleshootAddendum } from '@/lib/aria/ask/troubleshoot'
import { createSupportTicket } from '@/lib/aria/ask/escalate'
import { generateExport } from '@/lib/aria/ask/files'
import type { ExportFormat, ExportSubject } from '@/lib/aria/ask/files'
import { planAction, isConfirmation } from '@/lib/aria/ask/action-planner'
import { recordEvent } from '@/lib/moat/recordEvent'
import { executeAction } from '@/lib/aria/ask/action-executor'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'
import { runAriaCouncil } from '@/lib/aria/council'
import type { CouncilOutput } from '@/lib/aria/council'
import { getBusinessContext } from '@/lib/aria/get-business-context'
import { maybeWriteMemory } from '@/lib/aria/ask/memory-writer'
import { extractAndStoreMemories, maybeWriteOutcome } from '@/lib/aria/memory/extract'
import { summariseConversation } from '@/lib/aria/memory/summarize'
import { runParallelAriaAgents } from '@/lib/aria/parallel-orchestrator'
import { buildBriefingTasks } from '@/lib/aria/parallel-tasks'
import { classifyDeliverableKind, generateDeliverable } from '@/lib/aria/deliverables'
import { validateAndHeal } from '@/lib/aria/response-validator'
import { todayAEST, toAESTStart, startOfWeekAEST } from '@/lib/date-au'
import { AbortedByCaller } from '@/lib/aria/providers/anthropic'
import {
  supersedeLastAssistant, supersedeFrom, liveIndexToAbsolute, type ThreadMessage,
} from '@/lib/aria/conversation-branch'
import { dropContentFreeBlocks } from '@/lib/aria/block-content'
import type { AskBlock as AskBlockType } from '@/lib/aria/ask-types'
import {
  buildTitlePrompt, sanitiseTitle, fallbackTitle, shouldGenerateTitle,
} from '@/lib/aria/thread-title'
import { ariaChatWithProvider } from '@/lib/ai-router'
import { computeHealthSignals } from '@/lib/aria/health-signals'
import { computeGoalContext } from '@/lib/aria/goal-context'
import { getOpenLoops } from '@/lib/aria/open-loops'
import { computeBenchmarkContext } from '@/lib/aria/benchmark-context'
import { computeHypothesisContext } from '@/lib/aria/hypothesis-context'
import { gateSignals } from '@/lib/aria/signal-gate'
import { logAICallSafe } from '@/lib/aria/log-ai-call'
import { buildFactsPacket } from '@/lib/aria/ask/facts-packet'
import { findProductByQuery } from '@/lib/aria/product-map'
import { buildNavGrounding } from '@/lib/aria/nav-grounding'
import { classifyInventoryIntent, handleInventoryQuestion } from '@/lib/inventory/owner-agent'

// ALSO (audit Phase 4): tool-loop writes/outbound that must never auto-fire from a chat answer without
// explicit owner confirmation. Intercepted in the main tool-loop's executeTool below.
const GATED_TOOL_WRITES = new Set(['update_product_price', 'send_email_now', 'send_sms_now'])

// ASK-ARIA-CONSOLIDATE-2 (RC3): give the action planner memory — the recent turns + the LAST promotion created
// in this conversation — so an edit ("actually make it 15%") resolves to update_promotion on the existing row
// instead of creating a duplicate or misfiring to a bulk price change.
async function buildPlanContext(
  bid: string,
  conversationId: string | null,
  clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<import('@/lib/aria/ask/action-planner').PlanContext> {
  let recentTurns: string[] = []
  if (clientMessages.length > 0) {
    recentTurns = clientMessages.slice(-10).map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 400)}`)
  } else if (conversationId) {
    const { data } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
    const msgs = Array.isArray((data as { messages?: Array<{ role: string; content: string }> } | null)?.messages) ? (data as { messages: Array<{ role: string; content: string }> }).messages : []
    recentTurns = msgs.slice(-10).map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 400)}`)
  }
  let lastPromotion: import('@/lib/aria/ask/action-planner').PlanContext['lastPromotion'] = null
  if (conversationId) {
    const { data: logRow } = await supabaseAdmin.from('aria_action_log')
      .select('entity_ids, action_type, executed_at')
      .eq('business_id', bid).eq('conversation_id', conversationId)
      .in('action_type', ['create_promotion', 'apply_category_discount', 'update_promotion'])
      .order('executed_at', { ascending: false }).limit(1).maybeSingle()
    const pid = (logRow?.entity_ids as string[] | undefined)?.[0]
    if (pid) {
      const { data: promo } = await supabaseAdmin.from('pos_promotions')
        .select('id, name, promotion_type, discount_percent, discount_amount, bundle_price')
        .eq('id', pid).eq('business_id', bid).maybeSingle()
      if (promo) lastPromotion = { id: promo.id as string, name: promo.name as string, promotion_type: promo.promotion_type as string, value: Number(promo.discount_percent ?? promo.discount_amount ?? promo.bundle_price) || null }
    }
  }
  return { recentTurns, lastPromotion }
}

// BUGFIX-ASKARIA-THREADING: the dashboard client sends only {message, conversation_id} (no messages array), so
// history for the answer call must be REHYDRATED server-side from the conversation row. Returns the last ~10
// user/assistant turns of THIS conversation (or the client-sent messages if a future client provides them).
async function loadAnswerHistory(
  bid: string,
  conversationId: string | null,
  clientMessages: Array<{ role: 'user' | 'assistant'; content: string }>,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (clientMessages.length > 0) return clientMessages.slice(-10)
  if (!conversationId) return []
  const { data } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
  const msgs = Array.isArray((data as { messages?: Array<{ role: string; content: string }> } | null)?.messages) ? (data as { messages: Array<{ role: string; content: string }> }).messages : []
  return msgs.filter(m => m.role === 'user' || m.role === 'assistant').slice(-10).map(m => ({ role: m.role as 'user' | 'assistant', content: String(m.content ?? '') }))
}

// MS13 PHASE 3 — the local getBid() copy is gone: this route now rides withBusinessContext,
// which resolves the tenant through resolveOwnerBusinessId (the ONE canonical resolver, with the
// stale/foreign active-row re-validation the 16 inline copies never had). Ask Aria was the
// biggest remaining off-rail resolver.

function extractAction(text: string): Record<string, unknown> | null {
  const match = text.match(/<json>([\s\S]*?)<\/json>/)
  if (!match) return null
  try { return JSON.parse(match[1]) } catch { return null }
}

function extractBlocks(text: string): import('@/lib/aria/ask-types').AskBlock[] | null {
  const match = text.match(/<json_blocks>([\s\S]*?)<\/json_blocks>/i)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1].trim())
    return Array.isArray(parsed) ? parsed : null
  } catch { return null }
}

function stripBlocks(text: string): string {
  return text.replace(/<json_blocks>[\s\S]*?<\/json_blocks>/gi, '').trim()
}

function stripAction(text: string): string {
  return text.replace(/<json>[\s\S]*?<\/json>/g, '').trim()
}

async function upsertConversation(
  businessId: string,
  userId: string,
  conversationId: string | null,
  userMsg: string,
  assistantMsg: string,
  intentType: string,
  downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }>,
  /**
   * S1 PHASE 1 — the owner pressed Stop, so this assistant turn is a PARTIAL answer.
   * It is stored, not discarded: a half-answer the owner watched arrive is real, and silently
   * dropping it would lose work they saw. It is marked so nothing downstream — the UI, the
   * history route, a later regenerate — can mistake it for a finished answer.
   */
  incomplete?: boolean,
  /**
   * S1 PHASES 2 & 3 — how this turn joins the thread.
   *
   *   'append'    the normal case: a new question and its answer.
   *   'regenerate' re-running the last answer. The previous answer is SUPERSEDED, not overwritten,
   *               and no duplicate copy of the question is added.
   *   'edit'      an earlier question was changed. That message and everything after it are
   *               superseded, then the new question and answer are appended.
   *
   * Nothing is ever spliced out of the array. See lib/aria/conversation-branch.ts.
   */
  branch?: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number },
  /**
   * S3 PHASE 1 — the turn's provenance, STORED WITH THE MESSAGE.
   *
   * This is the link the chain was missing. Anchors were computed per turn and thrown away at the
   * end of it, so a reloaded thread could never show a tier no matter how good the renderer was:
   * the ground truth for that turn no longer existed anywhere. Persisting it here is what makes
   * provenance survive a reload and a search hit rather than living only in the live response.
   *
   * Omitted on every path that computed no anchors — the field is absent, not an empty object, so
   * "we never captured this" and "we captured nothing" stay distinguishable in the JSONB.
   */
  provenance?: { anchors: number[]; anchorLabels?: Record<string, string> },
): Promise<string> {
  console.log('[upsertConversation] called for biz:', businessId, 'user:', userId, 'existing:', conversationId)
  const pair: ThreadMessage[] = [
    { role: 'user', content: userMsg, ts: new Date().toISOString() },
    {
      role: 'assistant', content: assistantMsg, ts: new Date().toISOString(), downloads: downloads ?? [],
      ...(incomplete ? { incomplete: true, stopped_by: 'user' } : {}),
      ...(provenance && provenance.anchors.length > 0 ? { provenance } : {}),
    },
  ]

  if (conversationId) {
    const { data: existing } = await supabaseAdmin
      .from('aria_conversations')
      .select('messages, message_count')
      .eq('id', conversationId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (existing) {
      const msgs = (Array.isArray(existing.messages) ? existing.messages : []) as ThreadMessage[]
      const mode = branch?.mode ?? 'append'
      const stamp = new Date().toISOString()
      const newAssistantId = 'a:' + stamp

      // SUPERSEDE, NEVER DELETE. The array only ever grows; renderPath() decides what is shown.
      let base: ThreadMessage[] = msgs
      let toAppend = pair
      if (mode === 'regenerate') {
        base = supersedeLastAssistant(msgs, newAssistantId, stamp).messages
        // no second copy of the question — the owner asked once
        toAppend = [{ ...pair[1]!, id: newAssistantId }]
      } else if (mode === 'edit') {
        const abs = liveIndexToAbsolute(msgs, branch?.editLiveIndex ?? -1)
        if (abs >= 0) base = supersedeFrom(msgs, abs, newAssistantId, stamp).messages
        toAppend = [
          { ...pair[0]!, id: 'u:' + stamp, edited_from: String(abs) },
          { ...pair[1]!, id: newAssistantId },
        ]
      }

      const { error: updateErr } = await supabaseAdmin.from('aria_conversations').update({
        messages: [...base, ...toAppend],
        message_count: (Number(existing.message_count) || 0) + toAppend.length,
        last_message_at: new Date().toISOString(),
        last_intent: intentType,
      }).eq('id', conversationId)
      if (updateErr) {
        console.error('[upsertConversation] UPDATE FAILED:', updateErr.message)
        throw new Error('Failed to update conversation: ' + updateErr.message)
      }
      console.log('[upsertConversation] UPDATED:', conversationId)
      return conversationId
    }
  }

  /**
   * S1 PHASE 6 — THE TITLE IS WRITTEN EXACTLY ONCE, HERE, AT CREATION.
   *
   * There is no title UPDATE anywhere in this route, which is what guarantees both sprint rules
   * without needing a `title_edited` column: one call per thread ever, and a rename can never be
   * clobbered by code that never writes the field again.
   *
   * Generation is best-effort and time-boxed. A thread with a crude title is fine; a thread whose
   * first answer was delayed by titling is not, so a failure falls straight back to the question.
   */
  let title = fallbackTitle(userMsg)
  if (shouldGenerateTitle({ isNewConversation: true, question: userMsg })) {
    try {
      const generated = await Promise.race([
        ariaChatWithProvider('insight', buildTitlePrompt(userMsg, assistantMsg), 24, {
          businessId, agentKey: 'thread_title',
        }).then(r => r.text),
        new Promise<string>((_, rej) => setTimeout(() => rej(new Error('title timeout')), 6_000)),
      ])
      title = sanitiseTitle(generated, userMsg)
    } catch (e) {
      console.warn('[thread-title] falling back to the question:', (e as Error).message)
    }
  }

  const { data: created, error: insertErr } = await supabaseAdmin.from('aria_conversations').insert({
    business_id: businessId,
    user_id: userId,
    title,
    messages: pair,
    message_count: 2,
    last_intent: intentType,
    last_message_at: new Date().toISOString(),
  }).select('id').single()

  if (insertErr) {
    console.error('[upsertConversation] INSERT FAILED:', insertErr.message, 'code:', insertErr.code, 'details:', insertErr.details)
    throw new Error('Failed to save conversation: ' + insertErr.message)
  }
  console.log('[upsertConversation] INSERTED:', created?.id)
  return (created as { id: string }).id
}

/**
 * MS16 PHASE 4 — `onToken` is threaded in rather than bolted on. It is used at exactly ONE place:
 * the main tool-loop call. Every other lane (action planner, inventory agent, council, deliverable,
 * image, background task…) returns fast and simply emits its result as the stream's `done` event —
 * so the twelve early returns keep working untouched and nothing was duplicated to get streaming.
 */
async function _POST(
  req: Request,
  _routeCtx: unknown,
  { supabase, userId, businessId }: BusinessContext,
  onToken?: (t: string) => void,
  /**
   * S1 PHASE 1 — the request's abort signal, threaded all the way into the provider call so that
   * pressing Stop CANCELS generation rather than merely closing the browser's ear to it.
   */
  signal?: AbortSignal,
) {
  // Everything the model has streamed this turn, so a stop can persist the partial.
  let streamedSoFar = ''
  /**
   * S1 PHASES 2 & 3 — regenerate / edit-and-rerun. Supersede, never delete: the previous answer
   * (and, for an edit, everything after the edited question) stays in the database and stops
   * rendering. Default 'append' is the ordinary new-question case.
   */
  let branchIntent: { mode: 'append' | 'regenerate' | 'edit'; editLiveIndex?: number } = { mode: 'append' }
  const tokenSink = onToken
    ? (t: string) => { streamedSoFar += t; onToken(t) }
    : undefined
  const rl = await checkRateLimit('ai', userId)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })

  const bid = businessId

  // Accept both JSON and multipart/form-data (for file attachments)
  const contentType = req.headers.get('content-type') ?? ''
  let message = ''
  let conversationId: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let attachments: any[] = []
  let clientMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    message = String(formData.get('message') ?? '').trim()
    conversationId = formData.get('conversation_id') ? String(formData.get('conversation_id')) : null

    const files = formData.getAll('files') as File[]
    if (files.length > 0) {
      const { parseAttachment } = await import('@/lib/aria/attachments')
      for (const file of files.slice(0, 5)) {
        const parsed = await parseAttachment(file)
        if (!('error' in parsed)) attachments.push(parsed)
      }
    }
  } else {
    const body = await req.json() as {
      message?: string; conversation_id?: string
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>
      // S1 phases 2 & 3 — how this turn joins the thread. Absent means a normal new question.
      regenerate?: boolean
      edit_live_index?: number
    }
    message = (body.message ?? '').trim()
    conversationId = body.conversation_id ?? null
    clientMessages = Array.isArray(body.messages) ? body.messages.slice(-20) : []
    if (body.regenerate) branchIntent = { mode: 'regenerate' }
    else if (typeof body.edit_live_index === 'number') {
      branchIntent = { mode: 'edit', editLiveIndex: body.edit_live_index }
    }
  }

  if (!message && attachments.length === 0) return NextResponse.json({ error: 'message or file required' }, { status: 400 })
  if (!message) message = 'Please analyse the attached file(s).'

  // ── Save-plan fast-path ────────────────────────────────────────────────────
  // When the UI sends [ARIA_SAVE_PLAN], save the pending_action to aria_actions
  // with status='proposed' and return immediately — no LLM call needed.
  if (message === '[ARIA_SAVE_PLAN]' && conversationId) {
    const { data: convRow } = await supabaseAdmin
      .from('aria_conversations').select('pending_action')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()
    if (convRow?.pending_action) {
      const plan = convRow.pending_action as import('@/lib/aria/ask/action-planner').PlannedAction
      const impactText = (Number((plan.estimated_impact ?? '').replace(/[^0-9.]/g, '').slice(0, 10) || '0') || 0).toFixed(2)
      await supabaseAdmin.from('aria_actions').insert({
        business_id: bid,
        category: 'sales',
        title: plan.title,
        recommendation: plan.description,
        expected_impact: impactText,
        confidence: plan.risk === 'low' ? 'high' : plan.risk === 'medium' ? 'medium' : 'low',
        status: 'proposed',
        source: 'ask_aria:plan',
        priority: plan.risk === 'high' ? 'high' : 'medium',
        triggered_by: 'ask_aria',
      })
      await supabaseAdmin.from('aria_conversations')
        .update({ pending_action: null, pending_action_expires_at: null })
        .eq('id', conversationId)
    }
    const planTitle = (convRow?.pending_action as import('@/lib/aria/ask/action-planner').PlannedAction | null)?.title ?? 'your plan'
    const planReply = `Plan saved: "${planTitle}". You'll find it in your Actions dashboard when you're ready to execute.`
    let planConvId = conversationId
    try { planConvId = await upsertConversation(bid, userId, conversationId, 'Save plan', planReply, 'plan_saved') } catch (_e) { /* non-fatal */ }
    return NextResponse.json({ response: planReply, conversation_id: planConvId, intent: 'plan_saved', action: { type: 'plan_saved' }, cost_usd_cents: 0 })
  }

  // Cost guard — check daily spend before allowing chat
  const { checkSpendAllowed, trackSpend } = await import('@/lib/aria/cost-guard')
  const spendCheck = await checkSpendAllowed(bid, 'chat', 2) // ~$0.02 estimated
  if (!spendCheck.allowed) {
    return NextResponse.json({
      response: `⚠️ ${spendCheck.reason}\n\nUpgrade your plan or wait for daily reset.`,
      blocked_by_cost_guard: true,
      current_spend: spendCheck.current_spend_cents,
      daily_limit: spendCheck.daily_limit_cents,
    })
  }

  // Rate limit: max requests per minute
  const rateLimit = parseInt(process.env.ARIA_RATE_LIMIT_PER_MIN ?? '20')
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  const { count: recentCount } = await supabaseAdmin
    .from('aria_ai_calls')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', bid)
    .eq('agent_key', 'ask_aria')
    .gte('created_at', oneMinuteAgo)
  if ((recentCount ?? 0) >= rateLimit) {
    return NextResponse.json({
      error: 'rate_limited',
      message: `Aria can answer up to ${rateLimit} questions per minute. Please wait a moment.`,
      retry_after: 60,
    }, { status: 429 })
  }

  // Daily cost ceiling
  const costCheck = await checkCostCeiling(bid)
  if (!costCheck.ok) {
    return NextResponse.json({
      error: 'budget_exceeded',
      message: `Aria has used $${costCheck.spent.toFixed(2)} of the daily AI budget. Contact support if you need more.`,
      spent: costCheck.spent,
      ceiling: costCheck.ceiling,
    }, { status: 402 })
  }

  // 1. Classify intent + detect output format preference
  const [intent, ariaIntent] = await Promise.all([
    classifyIntent(message),
    classifyAriaIntent(message),
  ])
  console.log('[ask-aria] ariaIntent', JSON.stringify({ intent_type: ariaIntent.intent_type, comparison_period: ariaIntent.comparison_period, routing_reason: ariaIntent.routing_reason }), 'bid', bid)
  const outputFmt = detectOutputFormat(message)

  // 1a. Check if a pending action awaits confirmation
  if (conversationId) {
    const { data: convPending } = await supabase.from('aria_conversations')
      .select('pending_action,pending_action_expires_at')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()

    if (convPending?.pending_action && isConfirmation(message)) {
      const expired = convPending.pending_action_expires_at &&
        new Date(String(convPending.pending_action_expires_at)) < new Date()

      // Explicit expired branch — never fall through to smalltalk
      if (expired) {
        const expiredText = "Your action plan has expired — please re-request the action and I'll set it up again."
        let expConvId = conversationId
        try { expConvId = await upsertConversation(bid, userId, conversationId, message, expiredText, 'action_expired') } catch (_e) { /* non-fatal */ }
        return NextResponse.json({
          response: expiredText,
          conversation_id: expConvId ?? conversationId,
          intent: 'action_expired',
          action: null,
          cost_usd_cents: 0,
        })
      }

      if (!expired) {
        // BUG 1 FIX: pending_action may be stored as a text/string column and returned
        // as a JSON string by the Supabase client. Safe-parse it into a real object so
        // action.type is accessible inside executeAction.
        const rawPending = convPending.pending_action
        const parsedPending: PlannedAction = typeof rawPending === 'string'
          ? JSON.parse(rawPending) as PlannedAction
          : rawPending as PlannedAction

        const result = await executeAction(parsedPending, bid, userId, conversationId, message)

        // RC2/RC6: executor refused an unconfirmed mass mutation — re-stage WITH confirm_mass and ask the owner
        // to confirm the scale (showing the exact count). Nothing was written. This is the injection backstop:
        // even if the planner was talked into a catalog-wide change, it cannot execute without this 2nd confirm.
        if (result.requires_mass_confirm) {
          const massPending = { ...parsedPending, payload: { ...(parsedPending.payload as Record<string, unknown>), confirm_mass: true } }
          await supabase.from('aria_conversations').update({
            pending_action: massPending,
            pending_action_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          }).eq('id', conversationId)
          const massText = `⚠️ ${result.error ?? `This affects ${result.affected_preview} items.`} Reply "confirm" to proceed.`
          let massConvId = conversationId
          try { massConvId = await upsertConversation(bid, userId, conversationId, message, massText, 'action_request') } catch { /* non-fatal */ }
          return NextResponse.json({ response: massText, conversation_id: massConvId ?? conversationId, intent: 'action_request', action: { action: 'mass_confirm', affected: result.affected_preview }, cost_usd_cents: 0 })
        }

        await supabase.from('aria_conversations').update({
          pending_action: null, pending_action_expires_at: null,
        }).eq('id', conversationId)

        // If action failed — return plain error, no council
        if (!result.ok) {
          const errText = `Action failed: ${result.error ?? 'Unknown error'}`
          let failConvId = conversationId
          try { failConvId = await upsertConversation(bid, userId, conversationId, message, errText, 'action_executed') } catch (e) { console.error('[silent-catch]', e) }
          return NextResponse.json({
            response: errText,
            conversation_id: failConvId ?? conversationId,
            intent: 'action_executed',
            action: { type: 'execution_result', ...result },
            cost_usd_cents: 0,
          })
        }

        // Build grounded confirmation from the actual action result.
        // Council may still run for follow-up blocks/suggestions but must NEVER override this text.
        const _ap = parsedPending.payload as Record<string, unknown>
        const _rollback = result.rollback_available ? ' You can undo this within 1 hour.' : ''
        const confirmText = (() => {
          switch (parsedPending.type) {
            case 'update_promotion': {
              const v = (_ap.discount_percent ?? _ap.discount_amount ?? _ap.bundle_price) as number | undefined
              const unit = _ap.discount_amount != null ? '$' : _ap.bundle_price != null ? ' bundle $' : '%'
              return v != null ? `Done — updated that promotion to ${unit === '%' ? v + '% off' : unit.trim() + v}.${_rollback}` : `Done — promotion updated.${_rollback}`
            }
            case 'create_promotion':
            case 'apply_category_discount': {
              const promoName = (typeof _ap.name === 'string' && _ap.name) || parsedPending.title
              const pct = parsedPending.type === 'apply_category_discount'
                ? (_ap.discount_percent as number | undefined)
                : (_ap.discount_amount as number | undefined)
              const catName = (typeof _ap.category_name === 'string' && _ap.category_name)
                || (typeof _ap.category === 'string' && _ap.category) || ''
              const activeDays = _ap.active_days as number[] | undefined
              const dayStr = activeDays && activeDays.length > 0 && activeDays.length < 7
                ? ' on ' + activeDays.map((d: number) => (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])[d - 1] ?? String(d)).join('/')
                : ''
              let msg = `Done — **${promoName}** is live`
              if (pct != null) msg += ` (${pct}% off`
              if (catName) msg += ` all ${catName}`
              if (pct != null) msg += ')'
              return msg + dayStr + '.' + _rollback
            }
            case 'bulk_price_update': {
              const scope = (typeof _ap.category === 'string' && _ap.category)
                || (typeof _ap.brand === 'string' && _ap.brand) || 'all products'
              return `Done — prices updated for ${result.affected_count} ${scope} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            }
            case 'adjust_stock':
              return `Done — stock adjusted for ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            case 'mark_products':
              return `Done — ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''} updated (${String(_ap.field)} → ${String(_ap.value)}).${_rollback}`
            case 'set_low_stock_threshold':
              return `Done — low stock threshold set to ${String(_ap.threshold)} for ${result.affected_count} product${result.affected_count !== 1 ? 's' : ''}.${_rollback}`
            case 'create_roster':
              return `Done — draft roster **${String(_ap.name)}** created for week starting ${String(_ap.week_start)}. Review and publish from Staff.`
            case 'create_invoice':
              return `Done — draft invoice created for **${String(_ap.customer_name)}**. Review and send from Invoices.`
            case 'create_agent':
              return `Done \u2014 agent **${String(_ap.name)}** is ready. Mention it with @${String(_ap.name).toLowerCase().replace(/\s+/g, '-')} in any conversation, or find it in the skill picker.`
            case 'approve_po_draft': {
              const totalDollars = (Number(_ap.total_cost_cents ?? 0) / 100).toFixed(2)
              const itemCount = Number(_ap.items_count ?? result.affected_count)
              return `Done — draft PO approved. **$${totalDollars}** across ${itemCount} item${itemCount !== 1 ? 's' : ''}. Go to **Inventory → Buying** to review or send to your supplier.`
            }
            default:
              return `Done — ${parsedPending.title}: ${result.affected_count} item${result.affected_count !== 1 ? 's' : ''} updated.${_rollback}`
          }
        })()

        // RC3: never hide a partial failure behind a clean "Done".
        const confirmTextFinal = result.warning ? `${confirmText}\n\n⚠️ ${result.warning}` : confirmText
        // Council provides follow-up blocks/suggestions only — responseText is always confirmText
        let postCouncil: CouncilOutput | null = null
        try {
          const bizCtxForAction = await getBusinessContext(bid)
          postCouncil = await runAriaCouncil(bizCtxForAction + '\n\nRECENT_ACTION: ' + confirmText, bid, 'ask_aria')
        } catch (e) {
          console.error('[aria/ask] post-action council failed (non-fatal):', (e as Error).message)
        }
        const responseText = confirmTextFinal
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'action_executed')
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (action_executed):', (e as Error).message)
        }
        return NextResponse.json({
          response: responseText,
          conversation_id: savedConvId ?? conversationId,
          intent: 'action_executed',
          action: { type: 'execution_result', ...result },
          blocks: postCouncil?.ask_blocks ?? [{ type: 'lead', content: responseText }],
          followups: postCouncil?.ask_followups ?? [],
          used_council: !!postCouncil,
          cost_usd_cents: 0,
        })
      }
    }
  }

  // MS13 PHASE 4 — THE AGENT COMPOSER LANE. Describe → spec card (with the ALWAYS-TRUE box) →
  // revise by re-describing → approve → aria_skills row (kind='agent'). Deterministic (no LLM),
  // staged through the SAME pending_action machinery as every other action: NOTHING persists
  // until the owner confirms, and reject/expiry clears the card without a write.
  const AGENT_COMPOSE_RE = /\b(create|build|make|set ?up|compose)\b[\s\S]{0,40}\ban? agent\b/i
  if (AGENT_COMPOSE_RE.test(message)) {
    const { planCreateAgent } = await import('@/lib/aria/agents/composer')
    const planned = planCreateAgent(message)
    const cardText = 'Here\u2019s the agent I\u2019ll create:\n\n' + planned.preview.join('\n')
    let agentConvId = conversationId
    try {
      agentConvId = await upsertConversation(bid, userId, conversationId, message, cardText, 'action_request')
    } catch (e) { console.error('[aria/ask] composer upsert failed:', (e as Error).message) }
    if (agentConvId) {
      const { error: stageErr } = await supabase.from('aria_conversations').update({
        pending_action: planned,
        pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      }).eq('id', agentConvId).eq('business_id', bid)
      if (stageErr) {
        console.error('[aria/ask] composer stage failed:', stageErr.message)
        return NextResponse.json({ response: "Couldn't stage the agent \u2014 please try again.", conversation_id: agentConvId, intent: 'action_request', action: null, cost_usd_cents: 0 })
      }
    }
    return NextResponse.json({
      response: cardText,
      conversation_id: agentConvId ?? conversationId,
      intent: 'action_request',
      action: { action: 'fork', planned, propose_only: false },
      cost_usd_cents: 0,
    })
  }

  // 1b. Detect action intent not caught by classifier
  // NOTE: only trigger if NOT a strategic/advisory question — those go to council
  const ACTION_KEYWORDS = /\b(update|change|mark|set|adjust|apply|create|make|give|reduce|increase|launch|add|start|run|remove|subtract|deactivate|reactivate|disable|enable|archive|cut|lower|raise|schedule|draft)\b/i
  const ACTION_SUBJECTS = /\b(price|prices|stock|products?|inventory|staff|permission|discount|promo|promotion|bundle|deal|offer|campaign|roster|invoice|sale)\b/i
  // BUGFIX-ASKARIA-ACTION-ROUTING: a promo request phrased as "10% off X" / "$5 off" / "BOGO" carries no literal
  // promo/discount SUBJECT word, so it missed ACTION_SUBJECTS and dead-ended in the answer path (answered as a
  // 'question' that merely DESCRIBES a promo — pending_action NULL, no "Act on it" button). Recognise the
  // discount SHAPE as an action subject too.
  const ACTION_SHAPE = /\b\d+\s*%\s*off\b|\$\s*\d+\s*off\b|\bpercent off\b|\bbogo\b|buy[- ]?one[- ]?get|half[- ]?price|\b2\s*for\s*1\b|\bbuy\s*\d+\s*get\b/i
  const isStrategicQuestion = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|analyse|analyze|compare|forecast|plan|opportunity|risk|growth|optimise|optimize/i.test(message)
  // Actions that are too risky to execute immediately — propose-only (save plan, don't execute)
  const PROPOSE_ONLY_TYPES = new Set(['bulk_price_update', 'create_roster'])
  // RC3: edit-intent phrases ("actually make it 15%", "change it to 20%") carry no price/promo SUBJECT word,
  // so they'd miss the gate and never plan update_promotion. Trigger planning on edit-intent too — but the soft
  // phrases ("actually", "make it") need a value cue (a number/%/$) so a conversational "actually I think…"
  // doesn't spuriously propose an action. Strong toggles ("turn it off") trigger on their own.
  const EDIT_STRONG = /\b(turn it (off|on)|end it|deactivate it|reactivate it)\b/i
  const EDIT_SOFT = /\b(actually|change it|make it|set it to|instead|bump it|drop it)\b/i
  const isEditIntent = EDIT_STRONG.test(message) || (EDIT_SOFT.test(message) && /[\d%$]/.test(message))
  // A clear CREATE command for a promo/discount ("create/launch/set up a 10% off / a promotion") is an action
  // even when the intent classifier labels it 'command'/'statement' (not 'question') — but NOT when it's a
  // report/lookup ("show me the discounts") or an advisory ("should I run a promo").
  const LOOKUP_WORDS = /\b(summary|report|list|show me|breakdown|overview|how many|how much|what are|which)\b/i
  const STRONG_ACTION = /\b(create|set up|launch|start|run|apply|add)\b[\s\S]{0,40}\b(promotion|promo|discount|deal|offer|sale|\d+\s*%\s*off|\$\s*\d+\s*off|bogo)\b/i
  // A bare product-state TOGGLE ("deactivate X", "disable X") or a STOCK mutation ("set/add/remove N … stock")
  // carries no SUBJECT word when the product is named directly — route these to the planner regardless of how
  // the classifier labels them (they were mislabelled 'technical'/'question' and dead-ended in the answer path).
  const STRONG_TOGGLE = /\b(deactivate|reactivate|disable|enable|archive|unarchive)\b/i
  const STRONG_STOCK = /\b(set|add|remove|subtract|reduce|increase|adjust|restock)\b[\s\S]{0,30}\b(stock|inventory|on[- ]?hand|qty|quantity|units?)\b/i
  const isActionRequest = ACTION_KEYWORDS.test(message) && (ACTION_SUBJECTS.test(message) || ACTION_SHAPE.test(message)) && intent.type === 'question'
  const isStrongAction = (STRONG_ACTION.test(message) || STRONG_TOGGLE.test(message) || STRONG_STOCK.test(message)) && !LOOKUP_WORDS.test(message) && !isStrategicQuestion
  // Action-intent takes precedence over the data-lookup / coref / general lanes below. A strong create command
  // routes to the planner even if the classifier mislabels it analytical; the looser request keeps the guards.
  const planTrigger = isStrongAction || ((isActionRequest || isEditIntent) && !isStrategicQuestion && ariaIntent.intent_type !== 'analytical')
  if (planTrigger) {
    const planCtx = await buildPlanContext(bid, conversationId, clientMessages)
    const planned = await planAction(message, bid, planCtx)
    if (planned) {
      const propose_only = PROPOSE_ONLY_TYPES.has(planned.type)
      const previewText = propose_only
        ? `I've drafted a plan: ${planned.title}. This type of change needs your review before execution — I'll save it to your Actions dashboard.`
        : `I can ${planned.title.toLowerCase()}. Choose how to proceed:`

      // BUG 2 FIX: create/update the conversation FIRST so we always have an ID,
      // then attach pending_action to it — even for brand-new conversations (conversationId=null).
      let forkConvId = conversationId
      try {
        forkConvId = await upsertConversation(bid, userId, conversationId, message, previewText, 'action_request')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (action_request):', (e as Error).message, 'conv_id:', conversationId)
      }
      if (forkConvId) {
        const { error: pendingWriteErr } = await supabase.from('aria_conversations').update({
          pending_action: planned,
          pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        }).eq('id', forkConvId).eq('business_id', bid)

        if (pendingWriteErr) {
          console.error('[aria/ask] pending_action write failed:', pendingWriteErr.message, 'conv_id:', forkConvId)
          const stageErrText = "Couldn't stage the action — please try again."
          return NextResponse.json({
            response: stageErrText,
            conversation_id: forkConvId,
            intent: 'action_request',
            action: null,
            cost_usd_cents: 0,
          })
        }
      }
      return NextResponse.json({
        response: previewText,
        conversation_id: forkConvId ?? conversationId,
        intent: 'action_request',
        action: { action: 'fork', planned, propose_only },
        cost_usd_cents: 0,
      })
    }
    // BUG 1 FALLBACK: planAction returned null (API failure or truly unresolvable request).
    // Return a direct, non-looping prompt instead of falling through to the main LLM
    // which would loop endlessly asking clarifying questions per rule 5.
    const clarifyReply = `I can help create that — I just need a couple of quick details: what type of promotion (e.g. 10% off, $5 off, buy-one-get-one) and when should it start?`
    let clarifyConvId = conversationId
    try {
      clarifyConvId = await upsertConversation(bid, userId, conversationId, message, clarifyReply, 'action_request')
    } catch (_e) { /* non-fatal */ }
    return NextResponse.json({
      response: clarifyReply,
      conversation_id: clarifyConvId ?? conversationId,
      intent: 'action_request',
      action: null,
      cost_usd_cents: 0,
    })
  }

  // INV-AGENT-1: inventory owner agent fast-path — intercepts inventory questions BEFORE
  // the full 19-query context build + 30-tool loop. Answers from real DB data; routes
  // PO approvals through the existing pending_action gate. SURFACE + ROUTE ONLY.
  const invIntent = classifyInventoryIntent(message)
  if (invIntent !== 'none') {
    try {
      const invResult = await handleInventoryQuestion(supabaseAdmin, bid, message, invIntent)
      if (invResult.handled) {
        if (invResult.approve_action) {
          // Pending-action gate — stores the approve_po_draft action for one-tap confirmation.
          const planned = invResult.approve_action
          let forkConvId = conversationId
          try {
            forkConvId = await upsertConversation(bid, userId, conversationId, message, invResult.text, 'action_request')
          } catch (e) { console.error('[aria/ask] inv_agent upsert failed:', (e as Error).message) }
          if (forkConvId) {
            await supabase.from('aria_conversations').update({
              pending_action: planned,
              pending_action_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            }).eq('id', forkConvId).eq('business_id', bid)
          }
          return NextResponse.json({
            response: invResult.text,
            conversation_id: forkConvId ?? conversationId,
            intent: 'action_request',
            action: { action: 'fork', planned, propose_only: false },
            cost_usd_cents: 0,
          })
        }
        // Informational inventory answer — return directly.
        let invConvId = conversationId
        try {
          invConvId = await upsertConversation(bid, userId, conversationId, message, invResult.text, 'inventory')
        } catch (e) { console.error('[aria/ask] inv_agent upsert failed:', (e as Error).message) }
        return NextResponse.json({
          response: invResult.text,
          conversation_id: invConvId ?? conversationId,
          intent: 'inventory',
          action: null,
          cost_usd_cents: invResult.cost_cents,
          downloads: null,
          tool_calls: [],
          used_council: false,
          ai_mode: 'haiku',
          model_used: 'haiku',
        })
      }
    } catch (e) {
      console.error('[aria/ask] inv_agent failed, falling through:', (e as Error).message)
      // RULE 0: non-fatal — fall through to main tool loop
    }
  }

  // NAV fast-path — "where is X / how do I open X / where can I find X"
  // DISABLED by default: product-map is still in the system prompt so LLM answers
  // navigation questions correctly. The zero-LLM shortcut risks hijacking analytical
  // questions (e.g. "where does my best customer live" → wrong nav card).
  // Re-enable by setting NAV_FASTPATH=1 in env after adversarial testing passes.
  const NAV_PATTERN = /\b(where|how do i|how to|find|open|go to|navigate|get to|access|show me|take me to|can i find|can i see)\b.{0,60}\b(pos|terminal|dashboard|staff|roster|inventory|stock|reports?|reviews?|customers?|autopilot|daily briefing|intelligence|analytics|settings|reels|social|marketing|promotions?|loyalty|gift card|laybys?|tables?|kds|kitchen|timesheets?|payroll|leave|schedule|shifts?|cash|end.?of.?day|stocktake|suppliers?|purchase orders?|invoices?|bookings?|orders?|community|chat|website chat|warehouse|compliance|billing|plan|integrations?|xero|receipts?|barcode|price tick|labels?|waste|void|fitting room|split|competitors?|display|ask aria|agents?|churn|winback|missed demand|profit leak|delivery|recipes?|slow day|weekly|shift report|reorder|bas|tax|ad network|seo|tabs?|quotes?|bundles?|variance)\b/i
  if (process.env.NAV_FASTPATH === '1' && NAV_PATTERN.test(message)) {
    const match = findProductByQuery(message)
    if (match) {
      const navReply = `You can find **${match.feature}** at \`${match.route}\` in the sidebar.\n\n${match.blurb}.`
      let navConvId = conversationId
      try { navConvId = await upsertConversation(bid, userId, conversationId, message, navReply, 'navigation') } catch (_e) { /* non-fatal */ }
      return NextResponse.json({
        response: navReply,
        conversation_id: navConvId ?? conversationId,
        intent: 'navigation',
        action: null,
        cost_usd_cents: 0,
        used_council: false,
      })
    }
  }

  // BUGFIX-ASKARIA-THREADING: a coreferential follow-up ("what does she buy", "how often does she visit") must
  // NOT be answered by the bare general path — that path injects no history (can't resolve "she") AND has no
  // business tools (can't answer purchases even if resolved). When the message references prior context AND a
  // thread exists, fall through to the business tool-loop, which rehydrates this conversation's history (so the
  // referent resolves) and has the data tools. THIS is the real cause of "what does she buy" losing the referent.
  const COREF_FOLLOWUP = /\b(she|he|her|him|hers|his|they|them|their|theirs|it|its|that|those|these|the customer|the product|the order|this one|that one|the last one|same one)\b/i
  const isCoreferentialFollowup = COREF_FOLLOWUP.test(message) && (!!conversationId || clientMessages.length > 0)

  // GENERAL fast-path — non-business question: skip all business context, answer directly as a capable assistant
  if (!isCoreferentialFollowup && (intent.type === 'general' || ariaIntent.intent_type === 'general' || ariaIntent.intent_type === 'smalltalk')) {
    // Defensive: even a genuine general follow-up gets this conversation's recent turns so references resolve.
    const generalPrior = await loadAnswerHistory(bid, conversationId, clientMessages)
    const generalSystemPrompt = `You are Aria — an AI assistant for an Australian small business owner. The owner has asked a general question (not about their business data or operations). Answer it directly, helpfully, and competently as a knowledgeable general assistant.

Rules:
- Answer the question thoroughly and accurately
- Do NOT force a business angle or mention the owner's business
- Do NOT call business data tools — only use web_search or fetch_url if helpful
- Do NOT produce business jargon or vague business-shaped filler
- Be direct and useful, like a smart, well-informed friend
- Australian context where relevant (e.g. local laws, products, services)`

    const generalTools = ARIA_POS_TOOLS.filter((t: { name: string }) => ['web_search', 'fetch_url'].includes((t as { name: string }).name))
    const generalResult = await callAnthropicWithTools({
      model: 'haiku',
      systemPrompt: generalSystemPrompt,
      userPrompt: message,
      priorMessages: generalPrior,
      tools: generalTools,
      executeTool: (name, input) => executePOSTool(name, input, bid),
      maxTokens: 2000,
      maxIterations: 3,
      timeoutMs: 30_000,
      businessId: bid,
      agentKey: 'ask_aria',
      role: 'chat',
      requestSummary: message.slice(0, 100),
    })

    let generalConvId = conversationId
    try {
      generalConvId = await upsertConversation(bid, userId, conversationId, message, generalResult.raw, 'general')
    } catch (e) {
      console.error('[aria/ask] upsertConversation failed (general):', (e as Error).message)
    }
    trackSpend(bid, generalResult.cost_cents, 'chat').catch(() => {})

    return NextResponse.json({
      response: generalResult.raw,
      conversation_id: generalConvId ?? conversationId,
      intent: 'general',
      action: null,
      cost_usd_cents: generalResult.cost_cents,
      downloads: null,
      tool_calls: generalResult.tool_calls.map((t: { name: string; ms: number }) => ({ name: t.name, ms: t.ms })),
      blocks: undefined,
      used_council: false,
      ai_mode: 'haiku',
      model_used: 'haiku',
    })
  }

  // 2b-pre. Multi-domain path — parallel agents for broad business overview questions
  const MULTI_DOMAIN_TRIGGERS = /\b(weekly review|full summary|how (is|are) (everything|my business)|give me (an? )?overview|how (did|am) (i|we) (do|doing)|complete briefing|all (of )?my metrics|overall (performance|status))\b/i
  // Exclude analytical questions — "how did we do vs last month" matches the regex but must route to council
  const isMultiDomain = intent.type === 'question' && MULTI_DOMAIN_TRIGGERS.test(message) && ariaIntent.intent_type !== 'analytical'

  if (isMultiDomain) {
    try {
      const { data: bizInfo } = await supabaseAdmin.from('businesses').select('industry, subscription_tier').eq('id', bid).maybeSingle()
      const tasks = buildBriefingTasks(bid, (bizInfo as { industry?: string } | null)?.industry ?? 'retail')
      const parallelResult = await runParallelAriaAgents(bid, tasks, (bizInfo as { subscription_tier?: string } | null)?.subscription_tier ?? 'starter')
      const responseText = 'Here\'s your full business overview:\n\n' + parallelResult.merged
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'multi_domain')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (multi_domain):', (e as Error).message)
      }
      return NextResponse.json({
        response: responseText,
        conversation_id: savedConvId ?? conversationId,
        intent: 'multi_domain',
        action: null,
        cost_usd_cents: parallelResult.total_cost_cents,
        downloads: null,
        tool_calls: [],
        used_council: false,
        ai_mode: 'parallel',
        model_used: 'parallel',
      })
    } catch (err) {
      console.error('[aria/ask] multi-domain parallel failed, falling back:', (err as Error).message)
      // Non-fatal — fall through to single-call path
    }
  }

  // 2b-deliverable. Deliverable classifier — generates inline HTML dashboard/chart for visual requests
  // Spreadsheet/export requests bypass deliverable pipeline → main brain handles with spreadsheet-first RICH rules
  const SPREADSHEET_RE = /spreadsheet|\bcsv\b|excel|export/i
  const deliverableKind = classifyDeliverableKind(message)
  if (deliverableKind && !isMultiDomain && ariaIntent.intent_type === 'artifact_request' && !SPREADSHEET_RE.test(message)) {
    try {
      const { data: bizInfoD } = await supabaseAdmin.from('businesses').select('industry').eq('id', bid).maybeSingle()
      const result = await generateDeliverable(bid, conversationId ?? null, message, deliverableKind, (bizInfoD as { industry?: string } | null)?.industry ?? 'retail')
      const responseText = 'Here\'s your ' + result.title + ':\n\n[DELIVERABLE:' + result.outputId + ']'
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'deliverable')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (deliverable):', (e as Error).message)
      }
      // HEAL-1: validate deliverable output — catches spreadsheet-class mismatches not caught by SPREADSHEET_RE gate
      // GROUND-1: toolsUsed=1 — generateDeliverable fetches live DB data, so it counts as a grounded path
      const delivValidated = await validateAndHeal({
        userMessage: message,
        blocks: [],
        rawResponse: result.html ?? '',
        pipelinePath: 'deliverable',
        businessId: bid,
        toolsUsed: 1,
      })
      return NextResponse.json({
        response: responseText,
        conversation_id: savedConvId ?? conversationId,
        intent: 'deliverable',
        action: null,
        cost_usd_cents: 1,
        downloads: null,
        tool_calls: [],
        used_council: false,
        deliverable: { id: result.outputId, kind: result.kind, title: result.title, html: result.html },
        blocks: delivValidated.blocks.length > 0 ? delivValidated.blocks : undefined,
        healed: delivValidated.healed || undefined,
        heal_reason: delivValidated.healReason,
        served_by: 'deliverable', // LOGGING-FIX-1 Part 3: serving-path observability (debug-only)
      })
    } catch (err) {
      console.error('[aria/ask] deliverable generation failed, falling back to text:', (err as Error).message)
      // RULE 0: fall through to normal text response — never break the conversation
    }
  }

  // 2b-bg. Background task detection — queue long-running tasks and return immediately
  const BACKGROUND_TRIGGERS = /\b(analyse (all|every|my entire|my full)|research (all|every)|when (you'?re|you are) done|let me know when|notify me when|run in the background|come back to me|i.?ll check later)\b/i
  const isBackgroundTask = intent.complexity === 'complex' && BACKGROUND_TRIGGERS.test(message)
  if (isBackgroundTask) {
    try {
      const { data: taskRow } = await supabaseAdmin.from('aria_user_tasks').insert({
        business_id: bid,
        title: message.slice(0, 120),
        task_prompt: message,
        status: 'queued',
        notify_email: true,
      }).select('id').maybeSingle()
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
      return NextResponse.json({
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

  // COUNCIL-FIX-1: Brevity gate — short factual questions skip the council and fall through to the
  // main tool-loop where the BREVITY block + GROUNDING rule + RICH-1 renderers already live (OPS-AUDIT-1).
  const BREVITY_SIGNALS = /^\s*(just tell me|just |quickly|tldr|tl;dr|in one number|single number)\b/i
  const SHORT_FACTUAL = /^.{0,60}\b(how much|what'?s my|what is my|today'?s|this week'?s|this month'?s|revenue today|orders today)/i
  const isBrevityQuestion = BREVITY_SIGNALS.test(message) || SHORT_FACTUAL.test(message)

  // RC5: data-lookup lane — a factual lookup ("who is my best customer", "what's my top seller", "how many
  // customers", "what's low") must answer directly in the tool-loop (concise + RICH renderers), NOT fire the
  // full council + POS-health diagnostics. A lookup is: a who/what/which/list/show/top/best phrasing WITHOUT a
  // genuinely strategic verb (how-do-I, why, recommend, strategy, grow, improve…). Strategic asks still hit the
  // council. This fixes the over-answering where the "best" in "best customer" misrouted to the council.
  const STRATEGIC_RE = /\b(should|recommend|strateg|improve|grow|growth|why|how (do|can|should) (i|we)|advice|advise|suggest|optimi[sz]e|forecast|opportunit|what would|plan to|help me)\b/i
  const DATA_LOOKUP_RE = /\b(who('?s| is| are)?|what('?s| is| are)?|which|how many|how much|list|show me|top|best|lowest|highest|worst)\b/i
  const isDataLookup = DATA_LOOKUP_RE.test(message) && !STRATEGIC_RE.test(message)

  // S3 PHASE 1 — THE PROVENANCE CARRIER.
  //
  // `anchorValues` (below) has always been built from real queries against this business's rows,
  // but it lived three `try` blocks deep inside this branch and was only ever spent on the MODEL
  // PROMPT (`_anchor_values` inside augCtx) and the verifier. Nothing carried it out to the
  // response, so nothing was ever persisted with the message and nothing reached the renderer —
  // which is why 0 of 288 conversations carried a provenance field. This variable is the carrier
  // the chain was missing; it is declared here so it outlives the nested scope that computes it.
  //
  // It stays null on every other path ON PURPOSE. A turn with no anchors renders every figure
  // `plain`, which is segmentFigures() behaving correctly — "a turn whose ground truth was never
  // captured cannot vouch for its numbers". Inventing anchors to make more numbers look blue is
  // exactly the failure the decision table forbids.
  let turnProvenance: { anchors: number[]; anchorLabels: Record<string, string> } | null = null

  // 2b. Strategic council path — skip buildAskAriaContext (19 DB queries wasted) for council requests.
  // RC5: a clear data-lookup never enters the council (answers in the tool-loop instead).
  if (!isBrevityQuestion && !isDataLookup && (isStrategicQuestion || ariaIntent.intent_type === 'analytical')) {
    try {
      const [bizCtx, factsPacket] = await Promise.all([
        getBusinessContext(bid),
        buildFactsPacket(bid, ariaIntent.comparison_period),
      ])
      // GROUNDING-TEETH Part 3: no grounded inputs → no strategic synthesis (graceful degradation)
      if (!bizCtx || bizCtx.length < 50) {
        const noDataMsg = "I don't have enough data yet for a strategic read — try a specific question."
        let savedConvId = conversationId
        try { savedConvId = await upsertConversation(bid, userId, conversationId, message, noDataMsg, intent.type) } catch { /* non-fatal */ }
        return NextResponse.json({
          response: noDataMsg,
          blocks: [{ type: 'lead', content: noDataMsg }],
          conversation_id: savedConvId ?? conversationId,
          intent: intent.type, action: null, cost_usd_cents: 0, downloads: null, tool_calls: [], used_council: false,
        })
      }
      let augCtx = bizCtx
      try {
        const ctxParsed = JSON.parse(bizCtx) as Record<string, unknown>
        ctxParsed.aria_facts_packet = factsPacket
        // GROUNDING-TEETH Part 2: positive anchors — live-queried values that ARE safe to cite
        try {
          const gtTodayStart = toAESTStart(todayAEST())
          const gtThisMon = new Date(toAESTStart(startOfWeekAEST().toISOString().slice(0, 10)))
          const gtWeekStart = gtThisMon.toISOString()
          const gtWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
          // GROUNDING-TEETH-V2 Part 3: calendar windows for last-week + same-week-last-month anchors
          const gtLastWeekStart = new Date(gtThisMon.getTime() - 7 * 86400000).toISOString()
          const gtSwlmStart = new Date(gtThisMon.getTime() - 28 * 86400000).toISOString()
          const gtSwlmEnd = new Date(gtThisMon.getTime() - 21 * 86400000).toISOString()
          const gt56dAgo = new Date(Date.now() - 56 * 86400000).toISOString()
          const gt30dAgo = new Date(Date.now() - 30 * 86400000).toISOString()
          // INTEL-COMPUTE-3 — the 4 pos_sales queries below (today/week/last-week/same-week-last-
          // month, feeding available_ground_truth — the block the model is told is "SAFE TO CITE")
          // used neq('voided'), admitting draft/refunded rows. status='completed' matches
          // getRevenueSnapshot()'s canonical rule (gt56d just below already used it correctly).
          const [gtToday, gtWeek, gtConsent, gtCompleted7, gtPaid7, gtLastWeek, gtSwlm, gt56d, gtTotalCust, gtTopCust, gtBiz, gtPromoActions, gtHealth, gtGoal, gtWeights, gtOpenLoops, gtBenchmark, gtHypotheses] = await Promise.all([
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtTodayStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtWeekStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('marketing_consent', true),
            // AUTOPILOT-FIX-1 PART 1: payment-coverage DENOMINATOR is completed sales only — draft/pending/
            // cancelled legitimately have no payment record. The old neq('voided') denominator counted them,
            // producing the fabricated "19% reconciliation / 6 of 32" anchor fed to the council as fact.
            supabaseAdmin.from('pos_sales').select('id', { count: 'exact', head: true }).eq('business_id', bid).gte('created_at', gtWeekAgo).eq('status', 'completed'),
            // numerator: payments on COMPLETED sales only (matches the denominator)
            supabaseAdmin.from('pos_sale_payments').select('sale_id, pos_sales!inner(business_id, created_at, status)').eq('pos_sales.business_id', bid).gte('pos_sales.created_at', gtWeekAgo).eq('pos_sales.status', 'completed').limit(5000),
            // V2 Part 3 new anchors
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtLastWeekStart).lt('created_at', gtWeekStart).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid).gte('created_at', gtSwlmStart).lt('created_at', gtSwlmEnd).eq('status', 'completed'),
            supabaseAdmin.from('pos_sales').select('total_amount, created_at').eq('business_id', bid).gte('created_at', gt56dAgo).eq('status', 'completed'),
            supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', bid),
            supabaseAdmin.from('pos_customers').select('total_spent').eq('business_id', bid).order('total_spent', { ascending: false }).limit(5),
            supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', bid).maybeSingle(),
            supabaseAdmin.from('aria_actions').select('id', { count: 'exact', head: true }).eq('business_id', bid).eq('status', 'completed').gte('created_at', gt30dAgo).ilike('category', '%promo%'),
            // HEALTH-SIGNALS-1 Part 2: diagnostic facts (POS health, day-of-week baseline, freshness, known-unknowns)
            computeHealthSignals(bid).catch(() => null),
            // GOAL-AWARE-1 (I2): weekly target trajectory (projection, pace, on-track status)
            computeGoalContext(bid).catch(() => null),
            // OUTCOME-LOOP-1 (I4) Part 4: learned advice weights — how past recommendations per
            // category actually turned out (outcome-check cron → adjustAdviceWeight). Surfaces the
            // per-category confidence so the council can hedge categories that historically backfired.
            supabaseAdmin.from('aria_advice_weights').select('category,weight,positive_outcomes,negative_outcomes,neutral_outcomes').eq('business_id', bid),
            // PLAN-PERSISTENCE-1 (I5) Part 2: actions the owner executed but Aria never followed up on
            getOpenLoops(bid).catch(() => []),
            // I10 BENCHMARK Part 3: where this business sits vs anonymized industry peers (only when
            // its industry has passed the >=5-business privacy floor; otherwise available:false).
            computeBenchmarkContext(bid).catch(() => null),
            // I11 COUNTERFACTUAL Part 1: top open hypotheses the nightly engine generated (so the
            // council can proactively surface testable ideas the owner has not seen).
            computeHypothesisContext(bid).catch(() => null),
          ])
          const gtSum = (rows: Array<{ total_amount: number | null }> | null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)
          const paidSaleIds = new Set(((gtPaid7.data ?? []) as Array<{ sale_id: string }>).map(r => r.sale_id))
          const completedSales7 = gtCompleted7.count ?? 0
          // AUTOPILOT-FIX-1 PART 2: a coverage % from a tiny sample is meaningless. Small cafes do ~5-15
          // sales/day; <10 completed in 7d cannot support a "POS failure" conclusion. Emit null + a note
          // so the council never receives a scary low % it would echo as a crisis.
          const coveragePct = completedSales7 >= 10
            ? +((Math.min(paidSaleIds.size, completedSales7) / completedSales7) * 100).toFixed(1)
            : null
          // V2 Part 3: Tuesday avg + overall daily avg → the real "Tuesday gap" a "$480 leak" must match.
          // created_at is UTC; +10h ≈ AEST for day/DOW bucketing (fixed offset, matches date-au).
          const rows56 = (gt56d.data ?? []) as Array<{ total_amount: number | null; created_at: string }>
          const dayAgg = new Map<string, { tot: number; dow: number }>()
          for (const r of rows56) {
            const aest = new Date(new Date(r.created_at).getTime() + 10 * 3600000)
            const key = aest.toISOString().slice(0, 10)
            const cur = dayAgg.get(key) ?? { tot: 0, dow: aest.getUTCDay() }
            cur.tot += Number(r.total_amount ?? 0); dayAgg.set(key, cur)
          }
          const days = [...dayAgg.values()]
          const tueDays = days.filter(d => d.dow === 2)
          const tuesdayAvg = tueDays.length ? +(tueDays.reduce((s, d) => s + d.tot, 0) / tueDays.length).toFixed(2) : null
          const overallDailyAvg = days.length ? days.reduce((s, d) => s + d.tot, 0) / days.length : null
          const tuesdayGap = (tuesdayAvg != null && overallDailyAvg != null) ? +(tuesdayAvg - overallDailyAvg).toFixed(2) : null
          const topCustLTVs = ((gtTopCust.data ?? []) as Array<{ total_spent: number | null }>).map(c => +Number(c.total_spent ?? 0).toFixed(2)).filter(n => n > 0)
          const targetWeekly = (gtBiz.data as { weekly_revenue_target?: number | null } | null)?.weekly_revenue_target
            ? +Number((gtBiz.data as { weekly_revenue_target: number }).weekly_revenue_target).toFixed(2) : null
          const revToday = +gtSum(gtToday.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revWeekCal = +gtSum(gtWeek.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revLastWeekCal = +gtSum(gtLastWeek.data as Array<{ total_amount: number | null }>).toFixed(2)
          const revSwlm = +gtSum(gtSwlm.data as Array<{ total_amount: number | null }>).toFixed(2)
          // HEALTH-SIGNALS-1 / I1: every numeric the health signals expose becomes an anchor so V2
          // Check 6 can validate any figure Aria derives from the diagnostic facts.
          const healthAnchors = gtHealth?._anchor_numbers ?? []
          // GOAL-AWARE-1 (I2): goal-trajectory numerics → anchors (so Check 6 validates target/projection figures)
          const goalAnchors = gtGoal
            ? [gtGoal.weekly_target, gtGoal.projected_eow_revenue, gtGoal.gap_to_target, gtGoal.pace_required, gtGoal.on_track_pct, gtGoal.revenue_this_week, gtGoal.yesterday_actual]
              .filter((n): n is number => typeof n === 'number' && isFinite(n))
            : []
          // I10 BENCHMARK: industry percentile figures (p25/p50/p75 + own values) → anchors
          const benchmarkAnchors = gtBenchmark?.available ? gtBenchmark._anchor_numbers : []
          // I11 COUNTERFACTUAL: predicted-impact dollars of surfaced hypotheses → anchors
          const hypothesisAnchors = gtHypotheses?.available ? gtHypotheses._anchor_numbers : []
          // _anchor_values: the CLEAN numeric set Check 6 + the advisor cleaner validate against
          const anchorValues = [
            revToday, revWeekCal, revLastWeekCal, revSwlm, coveragePct,
            gtConsent.count ?? 0, gtTotalCust.count ?? 0, tuesdayAvg, tuesdayGap, targetWeekly, gtPromoActions.count ?? 0,
            ...topCustLTVs, ...healthAnchors, ...goalAnchors, ...benchmarkAnchors, ...hypothesisAnchors,
          ].filter((n): n is number => typeof n === 'number' && isFinite(n))

          // S3 PHASE 1 — labels are only attached where the query that produced the number is
          // KNOWN BY NAME here. The spread sets (health/goal/benchmark/hypothesis anchors) arrive
          // as bare number[] with no per-value provenance, so they get an anchor but no label, and
          // segmentFigures falls back to "Computed from your data this turn" rather than inventing
          // a source sentence. A wrong source line is worse than a generic true one.
          const anchorLabels: Record<string, string> = {}
          const labelAnchor = (n: number | null | undefined, text: string) => {
            if (typeof n === 'number' && isFinite(n)) anchorLabels[String(n)] = text
          }
          labelAnchor(revToday, 'Completed sales, today.')
          labelAnchor(revWeekCal, 'Completed sales, this week to date.')
          labelAnchor(revLastWeekCal, 'Completed sales, last week.')
          labelAnchor(revSwlm, 'Completed sales, the same week last month.')
          labelAnchor(gtConsent.count ?? 0, 'Customers who have consented to marketing.')
          labelAnchor(gtTotalCust.count ?? 0, 'Customers on record.')
          labelAnchor(targetWeekly, 'Your weekly revenue target.')
          turnProvenance = { anchors: anchorValues, anchorLabels }
          // OUTCOME-LOOP-1 (I4) Part 4: shape advice weights for the council. `weight` is the stored
          // [0.3,2.0] multiplier (unchanged — 4 downstream consumers depend on that frame). `success_rate`
          // is a Laplace-smoothed (positive+1)/(total+3) read-side view so a category with few/poor
          // outcomes reads as low-confidence rather than spuriously certain. Meta-confidence, not a
          // citeable dollar/% figure → deliberately NOT added to _anchor_values.
          const adviceWeightsGT = ((gtWeights.data ?? []) as Array<{ category: string; weight: number; positive_outcomes: number; negative_outcomes: number; neutral_outcomes: number }>)
            .map(w => {
              const pos = Number(w.positive_outcomes) || 0
              const neg = Number(w.negative_outcomes) || 0
              const neu = Number(w.neutral_outcomes)  || 0
              const total = pos + neg + neu
              return {
                category: w.category,
                weight: +Number(w.weight).toFixed(3),
                total_outcomes: total,
                success_rate: +((pos + 1) / (total + 3)).toFixed(3),
              }
            })
            .filter(w => w.total_outcomes > 0)
          // PLAN-PERSISTENCE-1 (I5) Part 2: only surface loops past the 7-day statistical floor
          // (DO-NOT push 'too_soon'). 5 most recent. getOpenLoops already orders by executed_at desc.
          const openLoopsGT = ((gtOpenLoops ?? []) as Array<{ outcome_status: string }>)
            .filter(l => l.outcome_status === 'ready_to_review')
            .slice(0, 5)
          ctxParsed.available_ground_truth = {
            note: 'VERIFIED LIVE QUERIES THIS TURN — these numbers are SAFE TO CITE. Any other specific figure must come from VERIFIED FIGURES or INTENT-GROUNDED FACTS.',
            revenue_today: revToday,
            revenue_this_week_calendar: revWeekCal,
            revenue_last_week_calendar: revLastWeekCal,
            same_week_last_month: revSwlm,
            payment_coverage_real_pct: coveragePct,
            payment_coverage_note: completedSales7 < 10
              ? `Only ${completedSales7} completed sales in the last 7 days — too small a sample to assess payment coverage. Do NOT claim a coverage %, "data loss", or "POS failure" from this.`
              : `${paidSaleIds.size} of ${completedSales7} completed sales have payment records (${coveragePct}% — healthy unless <95%).`,
            customer_count_with_consent: gtConsent.count ?? 0,
            total_customer_count: gtTotalCust.count ?? 0,
            top_customer_lifetime_values: topCustLTVs,
            tuesday_avg_revenue: tuesdayAvg,
            tuesday_vs_average_gap_dollars: tuesdayGap,
            target_weekly_revenue: targetWeekly,
            recent_promotion_actions: gtPromoActions.count ?? 0,
            // HEALTH-SIGNALS-1 Part 2+4: verifiable system state + what CANNOT be verified
            business_health: gtHealth ?? undefined,
            diagnostic_facts_note: 'business_health describes verifiable system state (POS health, day-of-week baseline, data freshness). known_unknowns lists what CANNOT be verified — ask the owner about those rather than asserting them. Any asserted cause (e.g. "POS broken") must be consistent with pos_health.status.',
            // GOAL-AWARE-1 (I2): weekly target trajectory — frame recommendations against the gap/pace
            goal_context: gtGoal ?? undefined,
            // OUTCOME-LOOP-1 (I4): learned per-category advice confidence from real outcomes
            advice_weights: adviceWeightsGT.length ? adviceWeightsGT : undefined,
            advice_weights_note: adviceWeightsGT.length
              ? 'advice_weights reflect how past recommendations per category actually performed. weight is a 0.3–2.0 confidence multiplier (1.0 = neutral); success_rate is Laplace-smoothed. LOWER weight / success_rate = be more cautious recommending that category again.'
              : undefined,
            // PLAN-PERSISTENCE-1 (I5): executed actions awaiting follow-up (≥7d, not yet outcome-tracked)
            open_loops: openLoopsGT.length ? openLoopsGT : undefined,
            open_loops_note: openLoopsGT.length
              ? 'open_loops are things the owner ACTED ON but you have not asked about. observed_delta is an early revenue read (not a verdict). If relevant, ask naturally how one went — do NOT assert it worked/failed from observed_delta alone.'
              : undefined,
            // I10 BENCHMARK Part 3+4: anonymized peer comparison (only present when the industry has ≥5 peers)
            industry_benchmarks: gtBenchmark?.available ? gtBenchmark.comparisons : undefined,
            industry_benchmarks_note: gtBenchmark?.available
              ? 'INDUSTRY_BENCHMARKS: industry_benchmarks compares this business to anonymized industry peers (aggregates only). Cite these when relevant. ALWAYS include sample_size when citing a benchmark.'
              : undefined,
            // I11 COUNTERFACTUAL Part 1: open hypotheses the owner has not acted on yet
            live_hypotheses: gtHypotheses?.available ? gtHypotheses.live_hypotheses : undefined,
            live_hypotheses_note: gtHypotheses?.available
              ? 'live_hypotheses are testable ideas Aria generated from this week\'s data that the owner has NOT yet seen/accepted. If relevant, proactively surface one or two with their predicted_impact_dollars. If the owner asks a "what if I do X" question, call counterfactual_simulate to run a fresh grounded prediction.'
              : undefined,
            _anchor_values: anchorValues,
          }
          // HEALTH-SIGNALS-1 Part 5: audit what diagnostic facts Aria saw this turn
          if (gtHealth) {
            void logAICallSafe({
              business_id: bid, agent_key: 'health_signals', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ pos: gtHealth.pos_health.status, dow_baseline: gtHealth.day_of_week_context.today_baseline_revenue, weather_avail: gtHealth.weather_context.available }).slice(0, 200),
            })
          }
          // GOAL-AWARE-1 (I2) Part 4: audit the goal trajectory Aria saw this turn
          if (gtGoal) {
            void logAICallSafe({
              business_id: bid, agent_key: 'goal_context', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ status: gtGoal.status, on_track_pct: gtGoal.on_track_pct, gap_to_target: gtGoal.gap_to_target }).slice(0, 200),
            })
          }
          // I11 COUNTERFACTUAL Part 5: audit the open hypotheses Aria surfaced this turn
          if (gtHypotheses?.available) {
            void logAICallSafe({
              business_id: bid, agent_key: 'hypothesis_surface', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ count: gtHypotheses.live_hypotheses.length, top: gtHypotheses.live_hypotheses.map(h => `${h.category}:${h.predicted_impact_dollars}`) }).slice(0, 200),
            })
          }
          // I10 BENCHMARK Part 5: audit the industry comparison Aria saw this turn
          if (gtBenchmark?.available) {
            void logAICallSafe({
              business_id: bid, agent_key: 'industry_benchmark', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ industry: gtBenchmark.industry, metrics: gtBenchmark.comparisons.map(c => `${c.metric_name}:${c.percentile_position}`), sample_size: gtBenchmark.comparisons[0]?.sample_size }).slice(0, 200),
            })
          }
          // OUTCOME-LOOP-1 (I4) Part 4: audit which learned advice weights Aria saw this turn
          if (adviceWeightsGT.length) {
            void logAICallSafe({
              business_id: bid, agent_key: 'advice_weights', role: 'analysis', provider: 'other', success: true,
              request_summary: bid,
              response_summary: JSON.stringify({ categories: adviceWeightsGT.length, weights: adviceWeightsGT.map(w => `${w.category}:${w.weight}`) }).slice(0, 200),
            })
          }
          // PLAN-PERSISTENCE-1 (I5) Part 6: audit the open loops Aria saw this turn
          {
            const totalOpen = (gtOpenLoops ?? []).length
            if (totalOpen > 0) {
              void logAICallSafe({
                business_id: bid, agent_key: 'open_loops', role: 'analysis', provider: 'other', success: true,
                request_summary: bid,
                response_summary: JSON.stringify({ open_count: totalOpen, ready_to_review_count: openLoopsGT.length }).slice(0, 200),
              })
            }
          }
        } catch { /* non-fatal — council proceeds without anchors */ }
        augCtx = JSON.stringify(ctxParsed)
      } catch { /* non-fatal — council still gets bizCtx */ }
      // RC4: COREFERENCE — the council path previously received zero conversation history, so pronouns in a
      // follow-up ("what does SHE buy") had no referent. Rehydrate the last ~10 turns (client-sent messages
      // first, else from aria_conversations by id) and inject them so the council resolves references.
      let recentHistoryBlock = ''
      try {
        let turns: Array<{ role: string; content: string }> = []
        if (clientMessages.length > 0) {
          turns = clientMessages.slice(-10)
        } else if (conversationId) {
          const { data: convRow } = await supabaseAdmin.from('aria_conversations')
            .select('messages').eq('id', conversationId).eq('business_id', bid).maybeSingle()
          const msgs = Array.isArray((convRow as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
            ? (convRow as { messages: Array<{ role: string; content: string }> }).messages : []
          turns = msgs.slice(-10)
        }
        if (turns.length > 0) {
          recentHistoryBlock = '\n\nRECENT_CONVERSATION (resolve pronouns/"she"/"that" against this — most recent last):\n' +
            turns.map(m => `${m.role === 'assistant' ? 'Aria' : 'Owner'}: ${String(m.content ?? '').slice(0, 600)}`).join('\n')
        }
      } catch { /* non-fatal — council still answers without history */ }
      const council = await runAriaCouncil(augCtx + recentHistoryBlock + '\n\nOWNER_QUESTION: ' + message, bid, 'ask_aria', message)
      // COUNCIL-PORT-1 Parts 6+7: run council synthesis through the HEAL-1/GROUND-1 validator.
      // Council brains make zero LLM tool calls — their grounding is the pre-fetched context
      // (getBusinessContext + facts packet). toolsUsed=1 when that context loaded (mirrors the
      // deliverable path's grounded-source convention); 0 if it failed, arming Check 4.
      let councilText = council?.final_briefing ?? ''
      let councilBlocks = council?.ask_blocks ?? null
      if (council?.final_briefing) {
        try {
          const councilToolCallCount = bizCtx && bizCtx.length > 50 ? 1 : 0
          const councilValidated = await validateAndHeal({
            userMessage: message,
            blocks: councilBlocks,
            rawResponse: councilText,
            pipelinePath: 'council',
            businessId: bid,
            toolsUsed: councilToolCallCount,
            // GROUNDING-TEETH Check 5 corpus: full context + advisor outputs — any number the
            // synthesis cites must trace to this text (verbatim or ±2%)
            groundTruth: augCtx + '\n' + JSON.stringify(council.raw_brain_outputs ?? []),
            // GROUNDING-TEETH-V2 Check 6: CLEAN anchor values ONLY (not advisor outputs) — catches
            // numbers an advisor invented and the synthesis repeated (the V1 self-grounding escape).
            groundTruthAnchors: (() => {
              try { return JSON.stringify((JSON.parse(augCtx).available_ground_truth?._anchor_values) ?? []) }
              catch { return '[]' }
            })(),
          })
          if (councilValidated.healed) {
            councilBlocks = councilValidated.blocks
            if (councilValidated.healedText) councilText = councilValidated.healedText
          }
        } catch (e) { console.error('[aria/ask] council heal non-fatal:', (e as Error).message) }
      }
      if (council?.final_briefing) {
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, userId, conversationId, message, councilText, intent.type, undefined, undefined, undefined, turnProvenance ?? undefined)
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (council):', (e as Error).message)
        }
        // Fire-and-forget memory extraction + conversation summarisation for council responses
        extractAndStoreMemories(bid, message, councilText, savedConvId).catch(() => {})
        if (savedConvId) {
          const _cid = savedConvId
          Promise.resolve(supabaseAdmin.from('aria_conversations').select('messages').eq('id', _cid).eq('business_id', bid).maybeSingle())
            .then(({ data: conv }) => {
              const msgs = Array.isArray((conv as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
                ? (conv as { messages: Array<{ role: string; content: string }> }).messages
                : []
              // SUMMARIZER-FIX-1 Part 4: augCtx carries the AVAILABLE_GROUND_TRUTH anchors +
              // verified business numbers — the summarizer's numeric-grounding corpus
              summariseConversation(bid, msgs, _cid, augCtx).catch(() => {})
            }).catch(() => {})
        }
        return NextResponse.json({
          // S6 PHASE 1 — drop any block that would render its header with nothing under it. The
          // council IS meant to return sections (council.ts:457-461 asks for them); when the model
          // returns one paragraph instead, `ask_blocks` can still carry an empty brain_readouts,
          // and the renderer would print COUNCIL READ + four role labels over nothing.
          blocks: (() => {
            const kept = dropContentFreeBlocks(councilBlocks as AskBlockType[] | null)
            return kept.length > 0 ? kept : [{ type: 'lead', content: councilText }]
          })(),
          followups: council.ask_followups ?? [],
          used_council: true,
          // S3 PHASE 1 — the anchors travel to the client so the renderer can tier the figures it
          // is about to draw. Null on paths that computed none; never fabricated to fill the field.
          provenance: turnProvenance,
          response: councilText,
          conversation_id: savedConvId ?? conversationId,
          intent: intent.type,
          action: null,
          cost_usd_cents: 0,
          downloads: null,
          tool_calls: [],
          // LOGGING-FIX-1 Part 3: serving-path observability (debug-only)
          served_by: council.served_from_cache ? 'council_cache' : 'council_fresh',
        })
      }
    } catch (e) {
      console.error('[aria/ask] council failed, falling back to single-model:', (e as Error).message)
    }
  }

  // Image requests are handled by the fast-path below after context is built

  // 2. Build context — only reached for non-strategic questions
  const ctxScope: ContextScope = intent.type === 'escalate' ? 'full'
    : intent.complexity === 'complex' ? 'standard'
    : 'quick'
  const ctx = await buildAskAriaContext(bid, conversationId ?? undefined, ctxScope)

  // Pre-compute weekly tracking data for target/same-week questions (injected into system prompt)
  let weeklyTrackingBlock = ''
  try {
    // SWLM-1: calendar-Monday-aligned window (Mon 4 weeks ago → Mon 3 weeks ago), was rolling d-35/d-28
    const swlmMonShifted = startOfWeekAEST()
    const swlmThisMonIso = toAESTStart(swlmMonShifted.toISOString().slice(0, 10))
    const d35str = new Date(new Date(swlmThisMonIso).getTime() - 28 * 86400000).toISOString()
    const d28str = new Date(new Date(swlmThisMonIso).getTime() - 21 * 86400000).toISOString()
    // INTEL-COMPUTE-3 — was neq('voided'), admitting draft/refunded rows into weeklyTrackingBlock's
    // same-week-last-month figure. status='completed' matches getRevenueSnapshot()'s canonical rule.
    const [{ data: bizTarget }, { data: swlmRows }] = await Promise.all([
      supabaseAdmin.from('businesses').select('weekly_revenue_target').eq('id', bid).maybeSingle(),
      supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', bid)
        .gte('created_at', d35str).lt('created_at', d28str).eq('status', 'completed'),
    ])
    const wTarget = bizTarget?.weekly_revenue_target ? Number(bizTarget.weekly_revenue_target) : null
    const swlmRev = (swlmRows ?? []).reduce(
      (s: number, x: { total_amount: number | null }) => s + Number(x.total_amount ?? 0), 0,
    )
    const currentWeek = ctx.revenue_week_cents / 100
    const windowLabel = `Mon ${new Date(swlmMonShifted.getTime() - 28 * 86400000).toISOString().slice(0, 10)} to Sun ${new Date(swlmMonShifted.getTime() - 22 * 86400000).toISOString().slice(0, 10)} (calendar week, 4 weeks ago)`
    const lines: string[] = ['WEEKLY TRACKING DATA (live — use these exact figures):']
    if (wTarget) {
      const pct = Math.round((currentWeek / wTarget) * 100)
      const gap = wTarget - currentWeek
      lines.push(`  Weekly revenue target: $${wTarget.toFixed(2)}`)
      lines.push(`  This week (Mon 00:00 AEST → now) revenue vs target: $${currentWeek.toFixed(2)} / $${wTarget.toFixed(2)} = ${pct}%${gap > 0 ? ' (BEHIND by $' + gap.toFixed(2) + ')' : ' (ON TRACK)'}`)
    } else {
      lines.push('  Weekly revenue target: NOT SET')
    }
    if (swlmRows && swlmRows.length > 0) {
      const chgPct = swlmRev > 0 ? (((currentWeek - swlmRev) / swlmRev) * 100).toFixed(1) : null
      lines.push(`  Same week last month (${windowLabel}): $${swlmRev.toFixed(2)}${chgPct ? ' (' + (Number(chgPct) >= 0 ? '+' : '') + chgPct + '% vs this week)' : ''}`)
    } else {
      lines.push(`  Same week last month (${windowLabel}): no sales data for that window`)
    }
    lines.push('RULES: "same week last month" → use the figure above, NEVER 30-day average. "on track?" → use weekly target above; if NOT SET, say so honestly and offer to set one, never substitute an average.')
    weeklyTrackingBlock = lines.join('\n')
  } catch { /* non-fatal */ }

  // Self-state grounding block: surfaces live aria_actions data so Aria can correct wrong premises.
  const ariaRecsBlock = (() => {
    const d = ctx.aria_actions_detail
    if (!d) return `Pending Aria actions: ${ctx.pending_aria_actions}`
    const lines: string[] = [
      `YOUR ARIA RECOMMENDATIONS (live — aria_actions, the canonical recommendation table):`,
      `  Pending: ${d.pending_count} | Executed: ${d.executed_count}`,
    ]
    if (d.top_pending.length > 0) {
      lines.push('  Top pending (most recent first):')
      d.top_pending.slice(0, 5).forEach((a, i) => {
        const parts = [
          `[${a.priority ?? 'normal'}]`,
          a.title,
          a.category ? `(${a.category})` : '',
          a.recommendation ? `— ${a.recommendation.slice(0, 100)}` : '',
          a.expected_impact ? `| impact: ${a.expected_impact}` : '',
        ].filter(Boolean)
        lines.push(`  ${i + 1}. ${parts.join(' ')}`)
      })
    } else {
      lines.push('  (no pending items)')
    }
    return lines.join('\n')
  })()

  // 3. Build system prompt
  let systemPrompt = `You are Aria, the autonomous AI business co-pilot for Aria OS — for Australian small businesses.

⛔ IRON RULES — ABSOLUTE — NEVER BREAK THESE:

1. **NEVER COMPUTE NUMBERS YOURSELF.** Every revenue figure, ranking, average, or count you state MUST come from a tool result returned in this conversation. If you don't have a tool result for it, call the tool. Do not aggregate, average, or rank raw rows in your head — call query_sales with group_by="day_of_week" and use the returned avg_revenue_per_day. Do not add up totals from individual sale rows — call get_summary. The tool computes; you narrate.

2. **NEVER STATE LOCATION, HOURS, CUISINE, OR BUSINESS CONCEPT** unless get_business_profile returned that field as non-null. If the business has no city set, say "your location" — never say "Melbourne", "Sydney", "CBD", "Brunswick", or any place. If hours are not set, say "your opening hours" — never invent them. If the industry is "Café" but no cuisine detail is set, never add "specialty coffee" or "brunch spot".

3. **ABSTAIN OVER GUESS.** If data is absent, say so plainly. "I don't have staff performance data for this period — served_by is not recorded for these sales." Never fill silence with plausible-sounding invented numbers or facts.

4. **ANTI-HALLUCINATION — ABSOLUTE — NEVER BREAK:** Every number, count, ranking, and causal claim you state MUST come from a value computed and returned by a tool call in this conversation. NEVER invent, round, or estimate a figure. NEVER state a customer count, revenue total, or product ranking you were not given by a tool. NEVER claim a promotion or change is "working" or "driving results" unless a tool result confirms it is active (active=true), has already started (starts_at <= today), and measured post-launch data exists — otherwise describe it as "scheduled for [date]". NEVER say "zero customers" unless a tool explicitly returned a count of 0 — absence of a query result is not evidence of zero. When a tool result includes a completeness_caveat (e.g. for staff attribution), you MUST state that caveat verbatim in your response. If you lack a value, say "I don't have that data" — never guess.

5. **MARKETING CONSENT RULE — MANDATORY — NEVER BREAK:** When suggesting any email campaign, SMS campaign, winback, or "message your customers" action, you MUST state the marketing_consent_caveat from the business context verbatim before giving any advice. The consented audience (marketing_consented_count) is the ONLY safe target — NEVER use pos_customer_count or with_email_count as the campaign audience. Example: if marketing_consented_count=11 and pos_customer_count=37, you MUST say "Only 11 of your 37 customers have consented to marketing — your reachable audience is 11." Never suggest emailing or texting the full customer base.

YOU CAN TAKE REAL ACTION using these tools. Don't just describe what could be done — DO IT.

GENERAL QUESTION RULE: You are primarily the owner's business co-owner, but you can also answer general questions (tech help, writing, general knowledge, advice). If a question is about the business (its sales, customers, staff, inventory, marketing, operations), use the business data tools. If a question is NOT about the business, answer it directly and competently as a helpful general assistant — do NOT force a business angle, do NOT produce business jargon, do NOT pretend a general question is about the business. Never output vague business-shaped filler for a general question.

FALSE COMPLETION RULE — ABSOLUTE — NEVER BREAK: Never say "Done", "I've created", "I've generated", "I've set up", "I've activated", "I've applied", or any other completion claim unless a tool call in THIS turn actually performed a database write AND returned a success result. If you only produced a plan, template, or description of what could be done, say "Here's the plan — tap Act on it to create it" or "I've drafted this — confirm to save it". Never claim an action happened when no write tool was called. The 'suggest_promotion' tool produces a template only — it does NOT save anything. If you call it, say "Here's a promotion template" not "I've created a promotion".

DATA TOOLS (read live business data):
• query_business_data: get rows from any entity (sales/products/customers/staff/suppliers/reviews/inventory/actions). Use when asked "show me top X", "list", "how many", filtered queries
• query_sales, query_inventory, query_customers, compare_periods: more specific analytics queries
• query_bookings, query_online_orders: bookings & orders data

EXPORT TOOLS (create downloadable files):
• generate_report: create Excel (.xlsx) or CSV file. ALWAYS use this when user says "in excel", "export", "download", "as a file", "create a report"

WEB SEARCH — MANDATORY FOR THESE QUESTION TYPES (do not skip):
• web_search — MUST use for:
  - Any question about revenue/sales performance → MUST search "[industry] average revenue [city] 2025"
  - Any question about pricing → MUST search current competitor pricing
  - Any question about costs/margins → MUST search industry margin benchmarks
  - Any question about staff wages → MUST search Fair Work award rates
  - Any question about regulations → MUST search ATO/Fair Work/state gov
  - Any "is this good/normal/typical" question → MUST search industry benchmarks
  - Any competitor question → MUST search "[competitor name] [city]"
  - Any question about market trends, weather, events affecting trade → MUST search
  NEVER answer a benchmarking question from training data alone — always search first.
• fetch_url — read FULL content of any web page:
  - User gives a URL → call fetch_url with extract: 'main_content'
  - Need the full page → extract: 'full_text'
  - Comparing competitor sites → fetch_url each, then compare
  - Need data tables from a page → extract: 'tables'
  - Following research → fetch_url with extract: 'links' then fetch the relevant link
  Chain web_search → fetch_url to go deep on any topic.
  For deep research use search_depth: "advanced"; for quick facts use search_depth: "basic".

CITATION RULES — NON-NEGOTIABLE:
• Every fact from web_search results MUST be immediately followed by an inline citation: [Source: Title](URL)
  Example: "Australian cafés average $4.50–$5.50 for a flat white [Source: Café Industry Report 2025](https://cafeindustry.com.au/report)."
• Business numbers (revenue, sales, stock) must say "from your live data" at least once per paragraph.
• NEVER state a web-derived fact without a source. NEVER fabricate URLs — only cite URLs that appear in actual web_search results.
• If web_search returns an error or no results: say so plainly, then answer from business data only.

ACTION TOOLS (do things on behalf of user — confirm first):
• send_email_now: send email via Resend
• send_sms_now: send SMS via ClickSend
• update_product_price: change a product's selling price
• suggest_promotion: generate promotion rule

CREATION TOOLS (make things):
• generate_image: create images from text using DALL-E 3 (posters, social graphics, mockups)
• generate_pdf: create formal documents from structured content
• run_calculation: do precise math (compound interest, GST, percentages, statistics)

IMAGE ANALYSIS — full depth vision:
• Receipts/invoices → extract every line item, then offer to save as expense (save_extracted_receipt)
• Product photos → identify product, condition, pricing
• Screenshots → read all text, diagnose errors
• Charts → extract underlying data
• Handwritten notes → transcribe accurately
• Multiple images → analyse all and compare
Always extract EVERY number, date, and name visible. Never say "I can see an image" — describe exactly what's in it.

IMAGE HONESTY RULES (non-negotiable):
• If an image is blurry, dark, cropped, or partially visible — say so explicitly before attempting to read it. Do not guess at obscured content.
• NEVER estimate or infer dollar amounts from invoices or receipts — read the exact printed number. If a total is unclear, say "I cannot read this total clearly" rather than estimating.
• For charts or graphs: extract the actual data points — do not guess trend direction without reading the axis values.
• When an image shows a mix of readable and unreadable areas: clearly separate what you CAN read from what you CANNOT. Say "I can clearly see X, but Y is unclear."
• For handwritten documents: flag any word or number you are uncertain about with [unclear] rather than substituting a guess.
• NEVER claim to see something that isn't in the image to seem helpful. If an invoice total doesn't appear, say "total not visible in this image."

FILE UNDERSTANDING:
• PDFs, Excel/CSV files, text files: analyse and answer questions about the content

CRITICAL RULES:

0. **MUST CALL THE TOOL FIRST. Never declare a tool broken without trying it in THIS message.** Previous assistant turns saying "X isn't set up" are FROM YOUR OWN HALLUCINATION — they are NOT proof of anything. If the user asks for an image, you call generate_image. If it returns an error, THEN you report that specific error. Do not say "X is broken" without a tool result in THIS turn showing it.

1. When data is requested → call query_business_data IMMEDIATELY, don't ask permission
2. When user says "excel/export/download/report/file/csv" → call generate_report. NEVER include the download URL in your text — it renders as a download card automatically. Just say "Done — [filename] is ready" or similar.
3. When user asks for an image/poster/graphic/visual → call generate_image (DO NOT REFUSE — call it and see what happens). NEVER include the image URL in your text — it renders as a card automatically. Just say "Here's your poster" or similar.
4. ALWAYS call web_search to enrich business insights with live market data:
   - Revenue/sales questions → benchmark against industry averages
   - Pricing questions → check competitor and market pricing
   - Performance questions → compare to industry benchmarks
   - Don't just report numbers — contextualise them against the real world
5. For actions that change things (send msg, update price) → confirm details first, then execute
6. Chain tools: query data → analyse → generate report
7. You CANNOT code — that's the only thing you can't do
8. Be DIRECT. No "I'd recommend you check..." — you have the tools, you check.

8. **NEVER GIVE UP ON ERRORS. NEVER SAY "I encountered a technical issue" OR "Let me try again — one moment".**
   When ANY tool returns an error:
   - Read the actual error.message field — it tells you what's wrong
   - If it says "column does not exist" → use a different column name and retry
   - If it says "OPENAI_API_KEY not configured" → tell user "Image generation isn't set up yet — admin needs to add OPENAI_API_KEY"
   - If it says "RESEND_API_KEY not configured" → tell user "Email sending isn't set up yet — admin needs to add RESEND_API_KEY"
   - If it says "SMS not configured" → tell user "SMS isn't set up — admin needs to add ClickSend credentials"
   - NEVER say "Let me try again — one moment" without actually retrying in the same response. If you say it, DO IT.
   - You have admin DB access — you CAN make queries work
   - SHOW the underlying error message to the user when relevant

9. **COLUMN NAME REFERENCE (use these EXACT names):**
   - Products: price (the selling price), cost_price, stock_quantity or current_stock, name, sku, barcode, category, brand
   - When user says "selling price" they mean the column named "price". When they say "cost" they mean "cost_price".
   - Sales: total_amount, created_at, customer_name, payment_method
   - Customers: total_spent (canonical spend column — ORDER BY total_spent DESC for best customer), visit_count, last_visit
   - To filter products starting with letters: use filters: {name_starts_with_any: ["x", "z"]}

ARIA OS FEATURES YOU KNOW AND CAN TROUBLESHOOT:

POS Terminal: sales, voids, refunds, split payments, bill splitting, modifiers, KDS, cash sessions, registers, outlets
Inventory: pos_products (price in dollars numeric — never cents), stock_quantity, reorder_point, reorder_qty, pos_outlet_inventory, purchase orders, suppliers
Staff Management: staff_members, pos_users (POS PIN login), staff_shifts, timesheets, leave balances, staff_leave, portal invites
Roster & Scheduling: AI-generated rosters, staff_shifts, pos_rosters, pos_roster_templates
Payroll: payroll_runs, payroll_line_items (amounts in cents as integer), superannuation at 11.5%
Integrations: Square (square_connections, square_items, nightly sync via cron), Shopify (shopify_connections, GraphQL API 2025-01), Lightspeed X-Series (retail.lightspeed.app), Kounta (O-Series, pending certification)
Migration Hub: pos_migrations table, Shopfront CSV importer (250-row batches)
Social Media: social_posts, social_connections, social_preferences, approval workflow
Competitor Intelligence: competitor_alerts, competitor_businesses, competitor_price_cache
Customer & Loyalty: pos_customers, pos_loyalty_transactions, pos_loyalty_config, winback campaigns
Reviews: google_reviews, social_connections, ai_drafted_reply
Weekly Orders / Reorder: purchase_order_drafts, pos_purchase_orders, pos_reorder_schedules, reorder_forecasts
Profit Analysis: profit_leaks, aria_outcomes, aria_actions, daily_briefings
Compliance: compliance_items (liquor licensing, Fair Work, visa)
Morning Command Centre: calls /api/aria/business-brain (mode:daily) + /api/aria/live-intelligence in parallel
Warehouse (future): warehouse_lots, warehouse_grns, warehouse_bom, warehouse_locations

KEY TABLES:
pos_products, pos_sales, pos_sale_items, pos_customers, pos_users, pos_staff, staff_members, staff_leave, staff_shifts, pos_purchase_orders, pos_outlets, pos_registers, pos_cash_sessions, businesses, user_active_business, square_connections, business_subscriptions, daily_briefings, aria_actions, audit_logs, cron_logs

AUTH & RLS RULES YOU MUST KNOW:

User client (anon key) is blocked by RLS on 28+ tables with zero policies — these silently return 0 rows. If a feature returns empty, suspect RLS.
supabaseAdmin (service role) bypasses RLS — use it for server-side routes touching: pos_kds_orders, pos_sale_edits, pos_reorder_schedules, agent_settings, feature_flags, support_tickets, pos_oauth_integrations, and any table returning unexpectedly empty.
Middleware sets pos_emp cookie for POS staff. Business owners must NOT be redirected to /pos — the middleware checks user_active_business ownership first.
staff_leave has two FKs to staff_members (staff_id and swap_with_staff_id) — always use explicit join name staff_leave!staff_leave_staff_id_fkey to avoid PGRST201.

PROACTIVE WEB INTELLIGENCE — DO THIS EVERY RESPONSE:
For business questions, ALWAYS use web_search to compare against live market data. Don't just report — benchmark.

Examples of proactive enrichment:
- Revenue/sales → search "${ctx.industry} average daily revenue ${ctx.city ? ctx.city : 'Australia'} 2025" to give context
- Product pricing → search "[product] price Australia [competitor]" before advising
- Staff costs → search "Fair Work ${ctx.industry} award rates ${new Date().getFullYear()}"
- Slow periods → search "${ctx.city ? ctx.city : 'Australia'} ${ctx.industry} busy periods ${new Date().toLocaleString('en-AU', { month: 'long' })}"
- Google rating ${ctx.google_rating ? '(' + ctx.google_rating + '⭐)' : ''} → search "average Google rating ${ctx.industry} Australia" to benchmark
- Any competitor mentioned → search them to get real intel
- Weather affecting trade → search "${ctx.city ?? 'Melbourne'} weather this week"

The owner can't know if their numbers are good or bad without comparison. YOU provide that context from the live web.

AUSTRALIAN BUSINESS CONTEXT:

Superannuation: 11.5% (2024–25), rising to 12% in 2025–26. Always cite current rate.
Fair Work: casual conversion rules, penalty rates (weekends/public holidays), maximum hours (38 + reasonable overtime).
Visa compliance: 482 TSS, 417 WHV (48-hour/2-week work limit per employer for WHV holders), 500 student (40 hrs/fortnight during study). Right-to-work verification is a legal obligation.
Liquor licensing: RSA required for all staff serving alcohol, licence conditions vary by state (VIC/NSW/QLD/SA/WA).
GST: 10%, tax-inclusive pricing, BAS lodged quarterly. WET (wine equalisation tax) applies to wine products.
ABN required for all business transactions. TFN required for payroll.

TROUBLESHOOTING PLAYBOOK:

"Returns empty / shows nothing": Check RLS — use supabaseAdmin in the route. Check business_id filter matches user_active_business.
"404 on staff member": Use explicit FK staff_leave!staff_leave_staff_id_fkey in select query.
"Cron not running": Check cron_logs for stuck 'running' row (finished_at IS NULL) — update to 'failed'. Vercel Hobby crons are daily max only.
"Square sync failing": Check pos_oauth_integrations (integration_key='square') exists with status='connected' AND token_expires_at > now() (tokens are encrypted there as of SEC-5). square_connected=true on businesses table can be stale.
"POS terminal login fails": Check pos_users exists for business_id with is_active=true.
"Trial expired warning": Check businesses.trial_ends_at and business_subscriptions.status.
"Vercel timeout": Vercel functions have 10s limit on Hobby. Split long operations into chunks (e.g. 250-row CSV batches).
"TypeErrors on agent routes": Confirm function shape — agent POST routes expect (req: Request) not (req, res). Check for g-is-not-a-function by verifying all imported utilities are actually functions before calling.

NEVER say: "try refreshing", "check your internet", "contact support", "I don't have access to your data".
ALWAYS: give specific table names, column names, route paths, and actionable SQL or code fixes when troubleshooting.

CURRENT BUSINESS: ${ctx.business_name} (${ctx.industry})
Location: ${ctx.city ? ctx.city + (ctx.address ? ' — ' + ctx.address : '') : '[NOT SET — do not guess or invent a location]'}
Google Rating: ${ctx.google_rating ? ctx.google_rating + '⭐ (' + ctx.google_reviews + ' reviews)' : 'not connected'}
ABN: ${ctx.abn ?? 'not set'}
Phone: ${ctx.phone ?? '[NOT SET — do not guess]'}
${ctx.owner_name ? `Owner: ${ctx.owner_name.split(' ')[0]}` : ''}
Currency: ${ctx.currency}

LIVE BUSINESS DATA (as of right now — use these exact numbers, never invent):
Current date/time: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', dateStyle: 'full', timeStyle: 'short' })}
Current month: ${new Date().toLocaleString('en-AU', { timeZone: 'Australia/Sydney', month: 'long', year: 'numeric' })}
Revenue today: $${(ctx.revenue_today_cents / 100).toFixed(2)}
Revenue last 7 days: $${(ctx.revenue_week_cents / 100).toFixed(2)}
Revenue this month so far: $${(ctx.revenue_month_cents / 100).toFixed(2)}
Avg ticket this month: $${(ctx.avg_ticket_cents / 100).toFixed(2)}
Low stock items (under 5 on hand): ${ctx.low_stock_items.length ? ctx.low_stock_items.map(p => `${p.name} (${p.qty} left)`).join(', ') : 'none'}
Staff (POS users): ${ctx.staff_count}
${ariaRecsBlock}
Open support tickets: ${ctx.open_support_tickets}
Top products this month: ${ctx.top_products_month.map(p => `${p.name} ($${p.revenue.toFixed(2)})`).join(', ') || 'no data'}
Top customers (all-time total_spent — canonical, use for ANY "best/top customer" question): ${ctx.top_customers_alltime.map((c, i) => `#${i+1} ${c.name} $${c.total_spent.toFixed(2)}`).join(', ') || 'no data'}
Month vs last month: ${ctx.monthly_comparison.change_pct > 0 ? '+' : ''}${ctx.monthly_comparison.change_pct.toFixed(1)}% ($${(ctx.monthly_comparison.this_month/100).toFixed(2)} vs $${(ctx.monthly_comparison.last_month/100).toFixed(2)})
Avg daily revenue: $${ctx.avg_daily_revenue.toFixed(2)}
Loyalty members: ${ctx.loyalty_stats.total_members} (${ctx.loyalty_stats.active_last_30d} active last 30d)
Pending purchase orders: ${ctx.pending_purchase_orders.length > 0 ? ctx.pending_purchase_orders.map(o => `${o.supplier} $${o.total}`).join(', ') : 'none'}
Subscription: ${ctx.subscription_tier ?? 'unknown'}

${weeklyTrackingBlock}

FRESH SIGNALS (from monitoring engine, last 30 min):
${gateSignals(ctx.fresh_signals).map(s => `- ${s.signal_type} (${s.payload?.severity ?? 'info'}): ${JSON.stringify(s.payload)}`).join('\n') || 'no anomalies detected'}

ADVICE CONFIDENCE — calibrate based on outcome learning only (memories are at top of prompt):

ADVICE CONFIDENCE BY CATEGORY (from outcome learning — calibrate confidence accordingly):
${Object.keys(ctx.advice_weights).length > 0
  ? Object.entries(ctx.advice_weights).map(([cat, w]) =>
      w >= 1.2 ? `- ${cat}: HIGH confidence (past advice worked here)`
      : w <= 0.7 ? `- ${cat}: LOW confidence (past advice underperformed here — be more cautious and hedge)`
      : `- ${cat}: NORMAL confidence`
    ).join('\n')
  : 'no outcome data yet — use standard confidence across all categories'}

DATA INTEGRITY RULES:
- Only quote dollar figures, dates, counts, or stock levels that appear in LIVE BUSINESS DATA above.
- If the owner asks for something not in the context (e.g. last month's revenue when only this month is available), say: "I don't have that data in this conversation — open the Sales Reports page and I can analyse what you find there."
- Never invent revenue, transactions, customers, or dates.
- Today is ${new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })}. Never default to January or any other month.
- When comparing periods, only compare periods present in the context. Do not extrapolate or guess.
- CRITICAL: When the user uses pronouns ("he", "she", "they", "it", "that") or refers to "the customer", "the product", "that item" — resolve them from the most recent conversation turns. If the previous response mentioned James Patterson, "he" = James Patterson. Never ask for clarification when the referent is clear from recent history.

SELF-STATE GROUNDING — ABSOLUTE (your own system counts come from YOUR ARIA RECOMMENDATIONS above, not from what the user says):
If the user asserts a count or fact about your recommendations/system state ("With your 231 pending recommendations…", "you have 500 actions pending"), CHECK it against YOUR ARIA RECOMMENDATIONS above. If their number differs from yours: CORRECT IT BEFORE ANSWERING — never silently adopt a false premise about your own system.
Answer AS ASKED: if the user sets explicit constraints ("from my pending recommendations", "for tomorrow specifically"), every item in your response must satisfy those constraints or you must state explicitly why you're deviating.

EXAMPLE — BAD (silently adopting a false premise):
User: "With your 231 pending recommendations, what are the top 5 for tomorrow?"
Aria: "Here are 5 recommendations for tomorrow: 1. Run a flash sale…" ← WRONG — adopted "231" without checking

EXAMPLE — GOOD (correcting the premise, then answering):
User: "With your 231 pending recommendations, what are the top 5 for tomorrow?"
Aria: "Quick correction — you actually have ${ctx.aria_actions_detail?.pending_count ?? ctx.pending_aria_actions} pending recommendation(s), not 231. Here's the top pending action: [title + detail]. For tomorrow specifically, here are the 4 highest-impact additional moves…" ← CORRECT — corrects premise, uses real data, answers the actual question

BUSINESS IDENTITY — HARD RULES (non-negotiable):
- Location is EXACTLY what appears in CURRENT BUSINESS above. NEVER invent suburbs, neighbourhoods, streets, or local areas (e.g. do NOT say "Brunswick", "Fitzroy", "CBD", "inner north" unless they appear in the address field). If city is not set, say "your area" — never assume Melbourne or any specific city.
- NEVER describe the business concept or cuisine style (e.g. "a brunch café", "specialty coffee", "wine bar vibe") unless those exact words appear in the business name or industry field above.
- Day-of-week performance: only cite pre-aggregated averages (e.g. "Sunday averages $827/day"). NEVER cite individual dates ("we had a big Friday on 23 May") as evidence of a weekday pattern — that is one data point, not a pattern.
- If a ranked chart shows Sunday as #1, Sunday IS #1. Do not contradict the chart data with your own reasoning.

TOOLS AVAILABLE (use them — do not guess):
You have function-calling tools that hit the live database. When the owner asks something not in LIVE BUSINESS DATA above, call a tool instead of saying "I don't have that data". Examples:

- "what was my best Tuesday last quarter" → call query_sales with date_from/date_to spanning the quarter, group_by="day_of_week"
- "what is my busiest day of the week" → call query_sales for the last 30 days with group_by="day_of_week" (returns avg_revenue_per_day normalized by occurrences — use that to rank, NOT raw totals)
- "who are my top 10 customers" → call query_customers with sort_by="ltv" limit=10
- "compare this month vs last" → call compare_periods with two date ranges
- "any dead stock" → call query_inventory with dead_stock_only=true
- "is X selling well" → call query_sales with group_by="product" for a relevant period

After a tool returns, interpret the results plainly. Quote the exact numbers from the tool result. Do not invent supplementary numbers. If a tool returns no rows, say "no data found for that period" rather than fabricating.

You can chain tools in one response — call query_sales first to find a pattern, then query_inventory to check stock for the products you found, then write your conclusion. Up to 5 tool calls per response.
- "how many online orders today" / "what's our online revenue this week" → call query_online_orders with period=today/week/month

## OUTPUT CAPABILITIES

You can produce ANY type of output the owner asks for. Use live_render blocks to generate custom HTML/SVG visuals. Use standard blocks for simple structured output.

### When to use live_render (unlimited custom output)
Use live_render whenever the owner asks for:
- A specific visual that doesn't fit standard block types
- A custom colour, layout, or style ("make it green", "use our brand colours")
- A heatmap, radar chart, timeline, Gantt chart, traffic light, gauge, etc.
- A complex comparison layout
- A formatted document they can save or print
- Anything where you'd naturally say "here's a custom visual for that"

For live_render, generate complete self-contained HTML with:
- Inline CSS in <style> tags
- Inline data as JavaScript variables (const data = [...])
- Pure SVG for simple charts and diagrams (preferred — no external dependencies)
- The visual MUST work without any external data calls — embed all data inline
- Design style: clean, minimal, professional. Font: Inter. Background: #fafafa. Borders: 1px solid #e5e5e5. Accents: #d9f54e (lime).

### live_render block format (wrap in <json_blocks>[...]</json_blocks>)
{
  "type": "live_render",
  "title": "Optional label above the visual",
  "height": 350,
  "html": "<complete HTML fragment here — all data embedded as JS variables>",
  "downloadable": true
}

### CRITICAL — narrative before blocks (non-negotiable)
UNLESS BREVITY INTENT FIRES (see BREVITY block below):
ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. Never output a block without preceding narrative text. If you have data to show in a chart or table, explain what it means first, then add the block. A response that starts with or only contains a block is always wrong.
This rule is SUSPENDED when the user's message matches a BREVITY signal — emit ONE block + at most one sentence, no advisory.

### AUTONOMOUS FORMAT SELECTION — choose the right block based on question type, not just what the owner says:
| Question type | Minimum output |
|---|---|
| Trend over time ("this week", "by day", "monthly change") | styled_chart (line or area) + narrative |
| Ranking / "top N" ("top 10 products", "best customers") | data_table (match exact N rows requested) + one-sentence takeaway |
| Single metric / KPI ("what's my revenue", "how many sales") | kpi_card + 2–3 sentence context |
| Yes/no / advisory ("should I", "is it worth", "would you") | narrative ONLY — do NOT force a chart |
| Custom visual explicitly requested | live_render with all data embedded as JS variables |
| Comparison ("this week vs last") | comparison_table OR two styled_charts side-by-side |
Rules: (1) Always choose the MINIMUM block set that answers the question. (2) Never add a chart to a yes/no question. (3) Always write narrative first, block second. (4) If the owner specifies a format ("show as a bar chart"), honour their choice.

### Standard blocks (use for simple structured output, wrap in <json_blocks>[...]</json_blocks>)
- "chart": simple bar/line/pie via Recharts
- "metric_row": 2-4 metric cards with big numbers
- "action_list": priority action items with buttons
- "html": simple HTML snippet

### Rich output blocks (new — match to what the owner asks for)
- "styled_chart": chart with explicit chart_type ("bar"|"line"|"pie"|"area") and color. Use when owner specifies a chart type or colour.
  Fields: chart_type, color (hex), title, data [{name, value}], x_label?, y_label?, show_legend?, show_grid?
- "data_table": sortable, filterable table with Export CSV button. Use when owner asks for "table", "rows", "list of".
  Fields: title, columns [{key, label, format?}], rows [{}], sortable?, downloadable?
- "spreadsheet": preview table + download button. Use when owner asks for "spreadsheet", "export", "download", "CSV", "Excel".
  Fields: filename, headers [], rows [[]], auto_download? (set true to trigger download immediately on render)
- "kpi_card": single big number with trend arrow. Use when owner asks for a single metric or KPI.
  Fields: label, value, format? ("currency"|"number"|"percent"), trend? (number: positive=up), trend_label?, color?
- "comparison_table": side-by-side metric comparison. Use when owner asks to "compare", "vs", "this week vs last week".
  Fields: title, left_label, right_label, rows [{metric, left, right, format?}], show_delta?

OUTPUT FORMAT — match the output type to what the owner asks for:
⚠️ SPREADSHEET OVERRIDE (non-negotiable): If the user mentions "spreadsheet", "CSV", "excel", "download", or "export" in ANY form → ALWAYS emit { type: "spreadsheet", auto_download: true } as the FIRST block. Never substitute data_table when spreadsheet is explicitly requested. Emit BOTH spreadsheet AND data_table together when export is requested.
When the owner asks for a "graph", "chart", "visualise", or specifies a chart type → use "styled_chart" with their preferred chart_type and color if specified.
When the owner asks for a "table", "tabular", "rows", "list of" → use "data_table" with downloadable: true.
When the owner asks for a "spreadsheet", "export", "download", "CSV", "Excel" → use "spreadsheet" with auto_download: true as the FIRST block; also emit data_table alongside it.
When the owner asks to "compare", "vs", "this week vs last week" → use "comparison_table" with the two periods clearly labelled.
When the owner wants a single metric/KPI/number → use "kpi_card" with appropriate format and trend if data supports it.
When the owner specifies a colour ("in green", "red chart") → pass it as a hex in the color field.
You can return MULTIPLE blocks — e.g. both a styled_chart AND a spreadsheet if the owner wants both a visual and a download.

### RICH RENDERER SELECTION (intent-driven — use these in addition to static keyword matching)

Before emitting any block, read the user's phrasing and infer their desired output format.

STEP 1 — INFER OUTPUT INTENT FROM PHRASING:

| User phrasing signals | Inferred intent |
|---|---|
| "show me", "visualise", "chart", "graph", "plot" | visual renderer (chart/clay_chart/styled_chart) |
| "just tell me", "what is", "how much", "quick number" | single number (bold_metric or animated_kpi) |
| "break it down", "overview", "summary of multiple" | multi-metric (bento_grid or metric_row) |
| "trend", "over time", "by hour/day/week" | time-series (styled_chart line/area or clay_chart) |
| "compare", "vs", "versus", "difference between" | comparison_table or two charts side by side |
| "export", "spreadsheet", "CSV", "download", "save", "excel" | spreadsheet (auto_download:true) FIRST + data_table |
| "list", "what happened", "activity", "events", "today's" | activity_stream or data_table |
| "why", "explain", "reason", "how did you decide" | ai_reasoning block |
| "should I", "what do you recommend", "what's the best" | council_split or action_list |
| "alert", "anomaly", "warning", "problem", "issue" | alert_card |
| "summarise the week/month", "weekly", "monthly total" | aurora_summary |
| "target", "goal", "progress", "how close am I" | progress_bars |
| anything ambiguous | pick the richest renderer that fits the data shape |

STEP 2 — MATCH DATA SHAPE TO RENDERER (when intent is ambiguous):

| Data shape | Default renderer | Alternate |
|---|---|---|
| Single number, no delta | bold_metric dark:true | animated_kpi variant:"a" |
| Single number + % change | animated_kpi (rotate variant a/b/c) | kpi_card |
| 2–4 metrics together | bento_grid | metric_row |
| Ranked list of items | data_table sortable:true downloadable:true | activity_stream |
| Time-series bar data | clay_chart | styled_chart bar |
| Time-series line/trend | styled_chart line or area | clay_chart |
| Goals vs actuals | progress_bars | comparison_table |
| Week/month summary | aurora_summary | bold_metric |
| Warning or anomaly | alert_card severity:"critical"/"warning" | pushback |
| Reasoning/explanation | ai_reasoning + confidence | text block |
| Loading complex query | kinetic_text FIRST, then real blocks | — |

CRITICAL RENDERER RULES:
- NEVER use keyword matching alone — read the full sentence for intent
- SPREADSHEET: any mention of "spreadsheet", "CSV", "excel", "export", "download" → emit spreadsheet block FIRST with auto_download:true, then data_table. Never substitute.
- VARIATION: rotate animated_kpi variants a→b→c across answers. Alternate bold_metric dark:true/false. Same question answered twice can render differently — correct behaviour, not a bug.
- NEVER emit alert_card for non-anomaly content — it always signals danger to the user
- ALWAYS emit kinetic_text as the very first block when a complex multi-tool query will take time, then follow with the real blocks once data is ready
- Can return MULTIPLE blocks together — e.g. aurora_summary + progress_bars + activity_stream for a weekly debrief
- UNLESS BREVITY INTENT FIRES (see BREVITY block below): ALWAYS write 2 full paragraphs of narrative BEFORE the json_blocks tag, even for simple queries. This rule is SUSPENDED when the user's message matches a BREVITY signal — emit ONE block + at most one sentence, no advisory.

### BREVITY INTENT — STRICT OVERRIDE

THIS BLOCK OVERRIDES THE "2 PARAGRAPHS NARRATIVE" RULES ABOVE. When a BREVITY signal fires, treat those rules as if they don't exist for this response.

When the user's message matches BREVITY signals, the 2-paragraph narrative rule is SUSPENDED. Output exactly one block plus at most one short sentence. NO advisory recommendations, NO multi-step plans, NO mentions of campaigns / outreach / bundles / strategy unless the user explicitly asked for advice.

BREVITY signals (case-insensitive):
- Starts with: "just tell me", "just ", "quickly", "tldr", "tl;dr", "in one number", "single number"
- Contains AND is short (<60 chars): "how much", "what's my", "what is my", "today's", "this week's", "this month's"

When BREVITY fires:
- "just tell me how much did I make this week" → ONE bold_metric block. Max 0–1 sentence before. NO advisory.
- "what's my revenue today" → ONE animated_kpi block. Max 0–1 sentence. NO advisory unless revenue=$0 AND user asked "why" — otherwise just the number.
- "today's orders" → ONE bold_metric or animated_kpi. Number only.

EXAMPLES of CORRECT brevity responses:

User: "just tell me — how much did I make this week?"
CORRECT: <json_blocks>[{"type":"bold_metric","label":"This week","value":"$741","sub":"vs $4,419.90 same week last month, -83.2%"}]</json_blocks>
WRONG: any response containing the words "bundle", "activate", "customers", "outreach", "lever", "gap", "crisis", "single move".

User: "what's my revenue today?"
CORRECT: <json_blocks>[{"type":"animated_kpi","label":"Revenue today","value":"$0.00","variant":"a"}]</json_blocks>
WRONG: any response that suggests next steps, mentions weekly comparison, or includes more than one block.

When BREVITY fires: NEVER emit council_read, comparison_table, alert_card, or ai_reasoning. These are advisory-mode blocks only.

ADVISORY MODE — DEFAULT (unchanged)
When BREVITY does NOT fire, the 2-paragraph narrative rule applies as before. The user has time and wants full reasoning. Advisory mode is the default for: "why", "what should I do", "help me", "what's wrong", "analyze", "deep dive", "tell me about", "explain".

### GROUNDING RULE — STRICT

For any question that requests, references, or implies a NUMERIC FACT about the business (revenue, sales, orders, customers, products, inventory, hours, dates, comparisons, trends, totals, averages), you MUST call query_business_data (or another data tool) at least once BEFORE composing the response. Do not infer numbers from context, recent messages, or business profile data. Every dollar figure, count, percentage, or date range in your response must come from a tool call made in THIS turn.

This rule OVERRIDES quick-answer shortcuts. Even a "what's my revenue today" with an obvious $0 expected answer MUST be grounded — call the tool.

NUMERIC SIGNALS (case-insensitive — if any match, tool use is mandatory):
- Currency: $, dollar, AUD, cents, revenue, sales, profit, cost, spend, made, earned, lost
- Counts: how many, how much, count, total, number of, sold, orders, customers, visits
- Time windows: today, yesterday, this week, last week, this month, last month, since, vs, compared to, year to date, ytd
- Comparisons: more than, less than, increased, decreased, dropped, up, down, %, percent
- Specific products / customers / dates by name

FORBIDDEN without a tool call this turn:
- Any specific dollar amount (e.g. "$741", "$4,442.90")
- Any percentage with a number (e.g. "down 83.7%")
- Any count (e.g. "11 customers", "143 orders")
- Phrases like "you made", "you've sold", "your top X", "compared to last X"
- Framings like "structural crisis", "tracking okay", "down 83%" that imply you computed something

CORRECT examples:
- User: "what's my revenue today?"
  CORRECT: [call query_business_data: entity=sales, period=today] then "Today's revenue is $0.00." (one block, from tool result)
  WRONG: "Today's revenue is $0.00 — you're in a structural crisis. This week you've made $722.50..." (the framing and weekly number are fabricated)

- User: "how many customers visited this week?"
  CORRECT: [call query_business_data: entity=customers, period=this_week] then number from result
  WRONG: any number stated without a tool call this turn

ESCAPE — if a tool returns no data or an error, say so plainly: "I couldn't pull that data right now — try again in a moment." NEVER fill the gap with a guess.

### Plain text
For explanations, advice, writing tasks, emails, analysis in words — just reply in the text field. No block needed unless a visual adds value.

### Examples of what you can now do

Owner: "Show me a heatmap of my sales by hour and day"
→ fetch data with get_hourly_sales, then return live_render with a colour-coded HTML table

Owner: "Give me a traffic light dashboard — red if revenue is down vs last week, green if up"
→ call compare_periods, then return live_render with coloured circles + labels

Owner: "I want a gauge chart showing my labour cost ratio"
→ return live_render with an SVG gauge at the current ratio

Owner: "Make me a weekly schedule I can print"
→ return live_render with a printable HTML table, height: 600, downloadable: true

Owner: "Show me my top 10 products in a bar chart"
→ call get_product_sales_detail, then return live_render with inline SVG bar chart

CRITICAL: When you generate live_render HTML, the data MUST already be embedded in the HTML as static values. Fetch the data using your tools FIRST, then embed it into the HTML string. The iframe cannot make database calls.

## NON-VISUAL TASKS

You also handle anything that doesn't need a visual:

WRITING TASKS:
- "Write me an email to send to..." → write the email in the text response
- "Draft an SMS for my loyalty customers" → write the SMS
- "Help me respond to this negative review: [review]" → write the response
- "Write terms and conditions for my layby policy" → write them

ANALYSIS TASKS:
- "What would happen if I raised prices by 10%?" → run the numbers, explain in prose
- "Should I hire another staff member?" → analyse labour cost ratio, revenue per staff
- "Which products should I stop stocking?" → analyse velocity and margin

ADVICE TASKS:
- "How should I handle a customer who is unhappy?" → give practical advice
- "What are my GST obligations?" → explain in plain English
- "Is my labour cost too high?" → benchmark against industry standards (AU retail: 25-35%)

TECHNICAL HELP (you CAN do this — do not refuse):
You have full knowledge of the Aria OS tech stack and can help with:

CODE & DEBUGGING:
- Paste any error → diagnose root cause + give exact fix
- Explain what any Next.js route, component, or lib file does
- Write TypeScript/SQL/shell commands for Aria OS patterns
- Identify common bugs: null access, missing awaits, wrong column names, RLS blocks

ARIA OS ARCHITECTURE YOU KNOW:
- Routes: src/app/api/{area}/route.ts — always export const POST/GET/PATCH/DELETE = withErrorCapture(...)
- DB: Supabase Postgres, service role in supabaseAdmin, anon key in createServerSupabaseClient()
- RLS: 28+ tables block anon key silently — use supabaseAdmin for server routes
- Vercel: 22 function limit in vercel.json, crons max daily (0 9 * * *), maxDuration 60s
- Column names: pos_sales.total_amount (not total), staff_members.first_name+last_name (not name),
  pos_sale_items.line_total (not total_price), pos_timesheets (not pos_timesheet_sessions)
- Model IDs: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-opus-4-5-20251101

DASHBOARD PROBLEM DIAGNOSIS — HOW TO RESPOND:
When intent is 'troubleshoot' and the addendum contains BROKEN ROUTES or SENTRY ERRORS:
1. Lead immediately with what is confirmed broken: "Your [route name] is confirmed failing right now."
2. Explain what that route does in plain English (not tech jargon): "This is the route that loads your POS product list."
3. Give the most likely cause based on the error + your knowledge of the codebase. Be specific — mention the actual file path, table name, or common failure mode.
4. Tell them what to do: either "this usually fixes itself in a few minutes" OR "this needs a code fix — here's what's wrong."
5. Include the Sentry link if available so they can share it with their developer.
6. If ALL routes are ok but the user says something is broken: explain that the backend is healthy, so this is likely a browser/cache issue — ask them to try hard-refresh (Ctrl+Shift+R) or incognito mode.

NEVER say "I can't see your dashboard" when you have live route health data.
NEVER say "contact support" when you can give a specific diagnosis.
ALWAYS distinguish: backend broken (route returning 500) vs frontend broken (route ok but UI bug) vs user error (route ok, correct usage).

VERCEL LOG READING:
When user pastes a Vercel error or runtime log:
1. Identify the route (from the path in the log)
2. Diagnose the specific error (null access, timeout, DB error, import error)
3. Give the exact file path + line to fix
4. Provide the corrected code snippet

SQL HELP:
Write Supabase-compatible SQL using the correct table/column names above.
Always use service role for admin queries. Never use RLS-blocked tables with anon key.

When asked a technical question: ANSWER IT. Never say "I can't help with code."

For ALL of these: just answer in the text field. No block needed.
The owner is talking to an AI business co-owner who knows everything about running an Australian small business and can help with anything.

${buildNavGrounding()}

RESPONSE STYLE - CRITICAL:
You are a senior business advisor, not a chatbot. Every response must be substantive.

ALWAYS give detailed answers:
- Analyse deeply - don't just state facts, explain what they mean for the business
- Structure: context, finding, implication, action
- Use numbers, percentages, comparisons - be specific
- Weave web search findings in naturally
- Minimum 3-4 paragraphs for any business question
- Bold key figures and recommendations

NEVER give a one-line answer to a business question. Match ChatGPT/Gemini depth with the advantage of having the owner's actual live data.`

  // MS14 PHASE 6 — HOUSE RULES reach every answer. Appended AFTER the IRON RULES and the
  // grounding rules above (which always win) and BEFORE any owner-built agent overlay, so the
  // owner's standing instructions outrank an agent's lens but never a safety rule.
  if (ctx.house_rules && ctx.house_rules.length > 0) {
    const { formatHouseRulesBlock } = await import('@/lib/aria/house-rules')
    systemPrompt += formatHouseRulesBlock(ctx.house_rules)
  }

  // Inject memories at top of prompt so they frame every response
  if (ctx.memories.length > 0) {
    const memoryBlock = '\n\nWHAT I KNOW ABOUT ' + ctx.business_name.toUpperCase() + ' (from our history — use this to personalise every response):\n' +
      ctx.memories.map((m: { kind: string; content: string }) => '• [' + m.kind + '] ' + m.content).join('\n') +
      '\n\nThese are facts about this specific business. Reference them naturally — don\'t say "I remember" just use the knowledge.'
    systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + '\n\nYou are Aria')
  }

  // ASK-ARIA-E2E-AUDIT (P4 over-answering): a plain DATA LOOKUP ("who is my best customer", "what's my top
  // seller") must answer concisely — the name/figure + at most one line of context — and SUPPRESS advisory
  // sections (no "what this means / next move", no multi-step plan, no campaign/bundle strategy) unless the
  // owner explicitly asked for advice. Suspends the default 2-paragraph narrative for these lookups.
  if (isDataLookup) {
    systemPrompt += `\n\n### BREVITY OVERRIDE IS ACTIVE FOR THIS RESPONSE — this message is a direct DATA LOOKUP.\nTreat this EXACTLY as a BREVITY INTENT response (see the BREVITY INTENT block): output the requested name/figure plus AT MOST one short sentence of context, then STOP. The "2 paragraphs of narrative" rule and the "advisory mode is the default" rule are SUSPENDED for this response. ABSOLUTELY DO NOT add recommendations, "what this means", "next move", multi-step plans, or any re-engagement / outreach / campaign / loyalty / bundle / discount / "prime candidate" suggestions — the owner asked a factual question, NOT for advice. If they want advice they will ask. Lead with the answer and stop.`
  }

  // 4. Add troubleshoot addendum if needed
  if (intent.type === 'troubleshoot' || intent.type === 'escalate') {
    const tsCtx = await buildTroubleshootContext(bid)
    systemPrompt += buildTroubleshootAddendum(tsCtx)
  }

  // 4b. Append any enabled skills (per-business, owner-curated) so Aria takes on the requested role
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { data: skills } = await supabaseAdmin.from('aria_skills')
      .select('name, system_prompt_addition, kind')
      .eq('business_id', bid).eq('enabled', true).limit(8)
    const skillRows = (skills ?? []) as Array<{ name: string; system_prompt_addition: string; kind?: string | null }>
    // MS13 PHASE 5 — legacy skills keep their existing placement (RULE 0: unchanged behaviour).
    const legacySkills = skillRows.filter(s => (s.kind ?? 'skill') !== 'agent')
    if (legacySkills.length > 0) {
      const block = legacySkills
        .map((s: { name: string; system_prompt_addition: string }) => `[${s.name}] ${s.system_prompt_addition}`)
        .join('\n')
      systemPrompt += '\n\nACTIVE SKILLS (the owner has asked you to take on these roles — stack their lenses across your reply):\n' + block
    }
    // Owner-built AGENTS are a delimited, sanitised, LOWEST-PRECEDENCE overlay appended at the
    // very END of the prompt — below the constitution and the grounding rules, never inside the
    // authority section. An @mention narrows the overlay to that agent.
    const agentRows = skillRows.filter(s => s.kind === 'agent')
    if (agentRows.length > 0) {
      const { buildAgentOverlay } = await import('@/lib/aria/agents/overlay')
      const mentioned = agentRows.filter(a => new RegExp('@' + a.name.toLowerCase().replace(/\s+/g, '[-\\s]?'), 'i').test(message))
      const active = mentioned.length > 0 ? mentioned : agentRows
      systemPrompt += buildAgentOverlay(active.map(a => ({ name: a.name, instructions: a.system_prompt_addition })))
    }
  } catch (e) { console.error('[aria/ask] skills execution failed (non-blocking):', e) }

  // 4c. Inject detected output format hint so Claude picks the right block type
  if (outputFmt.wants_download) {
    systemPrompt += '\n\nOUTPUT HINT: Owner wants a download/export — use "spreadsheet" block with auto_download: true.'
  } else if (outputFmt.wants_comparison) {
    systemPrompt += '\n\nOUTPUT HINT: Owner wants a comparison — use "comparison_table" block with clear left/right period labels and show_delta: true.'
  } else if (outputFmt.wants_chart) {
    const chartHint = [`use "styled_chart" block with chart_type: "${outputFmt.chart_type ?? 'bar'}"`, outputFmt.chart_color ? `color: "${outputFmt.chart_color}"` : ''].filter(Boolean).join(', ')
    systemPrompt += `\n\nOUTPUT HINT: Owner wants a chart — ${chartHint}.`
  } else if (outputFmt.wants_table) {
    systemPrompt += '\n\nOUTPUT HINT: Owner wants a table — use "data_table" block with downloadable: true.'
  }

  // 5. Build proper multi-turn history for Claude
  // Strip prior "broken" assistant messages for image/generation requests
  // so Claude doesn't use its own hallucinated refusals as evidence
  const isImageRequest = /poster|image|graphic|visual|banner|flyer|photo|picture|generate.*image|create.*image/i.test(message)
  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of ctx.conversation_history) {
    if (m.role === 'user' || m.role === 'assistant') {
      const msgContent = String(m.content)
      // Skip prior assistant messages that claimed image gen was broken (hallucination artifacts)
      if (isImageRequest && m.role === 'assistant' && (
        msgContent.includes("isn't configured") ||
        msgContent.includes("not configured") ||
        msgContent.includes("configuration issue") ||
        msgContent.includes("needs to be set up") ||
        msgContent.includes("admin needs to") ||
        msgContent.includes("DALL-E") ||
        msgContent.includes("OpenAI integration")
      )) {
        continue // drop this stale refusal from history
      }
      historyMessages.push({ role: m.role as 'user' | 'assistant', content: msgContent })
    }
  }

  // Inject floating-panel client-side history when no DB conversation exists
  if (clientMessages.length > 1 && historyMessages.length === 0) {
    for (const m of clientMessages.slice(0, -1)) {
      if (m.role === 'user' || m.role === 'assistant') {
        historyMessages.push({ role: m.role, content: m.content })
      }
    }
  }

  // Detect image attachments before model routing so we can upgrade the model
  const hasImages = attachments.some(a => a.kind === 'image')

  // Build multimodal user prompt — text + images + extracted document text
  let userPrompt: string | unknown[] = message
  if (attachments.length > 0) {
    const { attachmentsToContentBlocks, buildImageAnalysisPrompt } = await import('@/lib/aria/attachments')

    // Long document processing — map-reduce for PDFs > 10 pages
    const longDoc = attachments.find(a => a.kind === 'pdf_text' && (a.page_count ?? 0) > 10)
    if (longDoc?.extracted_text) {
      try {
        const { processLongDocument } = await import('@/lib/aria/documents/long-doc-processor')
        const pages = longDoc.extracted_text.split('--- PAGE BREAK ---')
        const docResult = await processLongDocument(pages, message, bid)
        systemPrompt += '\n\nLONG DOCUMENT SYNTHESIS (map-reduce across ' + docResult.page_count + ' pages):\n' + docResult.full_synthesis.slice(0, 4000)
        if (docResult.key_facts.length > 0) {
          systemPrompt += '\n\nKEY FACTS EXTRACTED:\n' + docResult.key_facts.slice(0, 20).join('\n')
        }
      } catch (e) {
        console.error('[aria/ask] long doc processing failed:', (e as Error).message)
      }
    }

    // Build the image analysis prompt if images present
    const imageCount = attachments.filter(a => a.kind === 'image').length
    const effectiveMessage = hasImages ? buildImageAnalysisPrompt(message, imageCount) : message

    userPrompt = attachmentsToContentBlocks(effectiveMessage, attachments)
  }

  // ── Cost-optimised model routing ─────────────────────────────────────────
  // Haiku first by default. Escalate to Sonnet only for genuinely complex
  // requests. Opus only for explicit escalation. This is 12x cheaper than
  // the previous "Sonnet first" logic while maintaining output quality for
  // the vast majority of questions.

  const ym = new Date().toISOString().slice(0, 7)
  const [{ data: spend }, { data: sub }] = await Promise.all([
    supabaseAdmin.from('aria_monthly_spend').select('sonnet_cents, haiku_cents').eq('business_id', bid).eq('year_month', ym).maybeSingle(),
    supabaseAdmin.from('business_subscriptions').select('sonnet_monthly_budget_cents, tier').eq('business_id', bid).eq('status', 'active').maybeSingle(),
  ])

  // Monthly Sonnet budget — used as a hard cap, not as the default
  const planDefaults: Record<string, number> = { starter: 1000, growth: 3000, pro: 8000 }
  const sonnetBudget = sub?.sonnet_monthly_budget_cents ?? planDefaults[sub?.tier ?? ''] ?? 3000
  const sonnetUsed = spend?.sonnet_cents ?? 0
  const sonnetExhausted = sonnetUsed >= sonnetBudget

  // Signals that this request genuinely needs Sonnet
  const needsSonnet =
    intent.complexity === 'complex' ||
    intent.type === 'troubleshoot' ||
    intent.type === 'technical' ||
    hasImages ||
    attachments.length > 0 ||
    /(live.?render|generate.?html|heatmap|complex.?chart|analysis|compare.*week|profit.*if|what.*happen|should.*hire|strategy|forecast|predict|multi.?step|deep.?dive|breakdown|reconcil|cash.?flow.*analysis)/i.test(message)

  // Signals that even Haiku needs to be careful (bigger context window needed)
  const needsTools =
    /(export|download|report|spreadsheet|csv|pdf|send|sms|email|restock|reorder|purchase.?order|schedule|roster|invoice|generate|create|update|set.?price|change.?price)/i.test(message) ||
    attachments.length > 0

  let routedModel: 'haiku' | 'sonnet' | 'opus'

  if (intent.type === 'escalate') {
    routedModel = 'opus'
  } else if (sonnetExhausted) {
    routedModel = 'haiku'
  } else if (needsSonnet) {
    routedModel = 'sonnet'
  } else {
    routedModel = 'haiku'
  }

  console.log('[ask-aria] route', {
    bid,
    sonnetUsed,
    budget: sonnetBudget,
    exhausted: sonnetExhausted,
    needsSonnet,
    model: routedModel,
    intent: intent.type,
    complexity: intent.complexity,
  })

  // Phase 5: chain-of-thought forcing for complex strategy questions
  if (intent.complexity === 'complex' && intent.type === 'question' && routedModel !== 'haiku') {
    systemPrompt += '\n\n## REASONING PROTOCOL\nFor complex questions, reason step-by-step before answering:\n1. What are the key business factors at play?\n2. What does the data reveal?\n3. What are the main risks or tradeoffs?\nThen give a specific, actionable recommendation.'
  }

  // Phase 9.1: Force web research for questions about market/industry/current data
  const RESEARCH_TRIGGERS = /\b(what are the (latest|current|recent)|look up|find out|what is the (current|going rate|average|market|industry)|industry (average|benchmark|standard|rate)|market (rate|price|average|data)|trends? in|how does .{1,30} compare|benchmark|competitor analysis)\b/i
  if (RESEARCH_TRIGGERS.test(message)) {
    systemPrompt += '\n\n## WEB RESEARCH REQUIRED\nThis question requires current market or industry data. You MUST use the web_search tool before answering. Search for the most recent relevant data. Do not guess or hallucinate statistics — look them up and reference the source.'
  }

  // Haiku does not support extended thinking — only enable it for Sonnet/Opus.
  const useThinking = routedModel !== 'haiku' && (intent.complexity === 'complex' || intent.type === 'troubleshoot' || intent.type === 'escalate')
  const thinkingBudget = 4000 // all tiers capped at 4000 until first paying customers are live

  // ARIA_POS_TOOLS includes the Tavily web_search tool (structured results with title+URL for citations)
  const allTools = [...ARIA_POS_TOOLS]

  // FIX 2 — INTENT-SCOPED SLIM CONTEXT for data lookups. A factual lookup FETCHES what it needs via read tools,
  // so it doesn't need the full ~30k pre-assembled system prompt + all ~30 tools (which cost the same as a
  // strategic ask — shipping ~43k input tokens even for "who is my best customer"). Send a compact grounded
  // prompt + the read-tool subset; strategic/council/action questions keep the rich context. Quality preserved
  // — the model still calls the data tools and names the real figures, just without the kitchen sink.
  // PROMPT-CACHE-1 §1 — the slim prompt and tool subset now live in lib/aria/slim-context.ts, VERBATIM,
  // so they can be measured against Anthropic's minimum cacheable prefix without a live call. Caching on
  // this path silently stopped on 25 Jun (zero reads AND zero writes across 118 calls) and nothing
  // surfaced it, because Anthropic does not error on a too-short prefix — it just doesn't cache.
  let effectiveSystemPrompt = systemPrompt
  let effectiveTools = allTools
  if (isDataLookup && !isImageRequest) {
    effectiveTools = slimTools()
    effectiveSystemPrompt = slimSystemPrompt(ctx.business_name)
  }

  // ── IMAGE FAST-PATH ──────────────────────────────────────────────────────
  // Skip the entire Anthropic tool loop for image requests.
  // The loop (2 API calls + image gen) takes 20-50s and regularly hits the 60s limit.
  // Instead: extract prompt from message, call generateImage directly, return immediately.
  if (isImageRequest) {
    console.log('[aria/ask] image fast-path triggered for:', message.slice(0, 80))
    const { generateImageDirect } = await import('@/lib/aria/image-direct')
    const imgResult = await generateImageDirect(message, bid)
    const responseText = imgResult.ok
      ? `Here's your poster! It was generated based on your request.`
      : `Sorry, I couldn't generate the image. ${imgResult.error ?? 'Please try again.'}`
    let savedConvId = conversationId
    try {
      savedConvId = await upsertConversation(bid, userId, conversationId, message, responseText, 'generate_image')
    } catch (e) { console.error('[aria/ask] upsertConversation failed (image):', (e as Error).message) }
    const downloads = imgResult.ok && imgResult.download_url ? [{
      filename: imgResult.filename ?? 'poster.png',
      download_url: imgResult.download_url,
      rows: 0,
      format: 'png',
    }] : []
    if (savedConvId && downloads.length > 0) {
      try {
        const { data: conv } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', savedConvId).eq('business_id', bid).single()
        const msgs = Array.isArray((conv as any)?.messages) ? (conv as any).messages : []
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.downloads = downloads
          await supabaseAdmin.from('aria_conversations').update({ messages: msgs }).eq('id', savedConvId).eq('business_id', bid)
        }
      } catch (e) { console.error('[non-fatal]', e) }
    }
    return NextResponse.json({ response: responseText, conversation_id: savedConvId, intent: 'generate_image', downloads })
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Force tool_choice for image generation requests — prevents hallucinated responses
  const imageToolChoice = isImageRequest
    ? { type: 'tool' as const, name: 'generate_image' }
    : undefined

  // Token limits by model — Haiku is fast, Sonnet has more capacity
  const maxTokens = routedModel === 'haiku'
    ? (needsTools ? 2500 : 2000)
    : routedModel === 'sonnet'
    ? (useThinking ? 4096 : 3500)
    : 4096

  // ── API-RESILIENCE-1 — provider failover + circuit breaker ───────────────
  // The tool-loop is Anthropic-only (cross-provider tool-calling is the separate API-RESILIENCE-2
  // epic). When Anthropic is down we don't die: we answer from the ALREADY-ASSEMBLED ground truth
  // (systemPrompt) via the ariaChat fallback chain (gemini → openai → haiku). No NEW live queries,
  // but a real grounded answer from this session's snapshot. GROUNDING-TEETH still applies.
  let degradedProvider: string | null = null
  let toolResult: ToolLoopResult

  const circuit = await isAnthropicCircuitOpen()
  if (circuit.open) {
    // Circuit OPEN — skip the dead provider's tool-loop entirely (saves the full per-request timeout).
    console.warn('[aria/ask] Anthropic circuit OPEN — serving degraded grounded answer', 'business', bid)
    const deg = await degradedGroundedAnswer({ groundTruth: systemPrompt, message, history: historyMessages, maxTokens, skipAnthropic: true, businessId: bid })
    degradedProvider = deg.provider
    if (circuit.incidentId) await recordAnthropicFallbackProvider(circuit.incidentId, deg.provider)
    toolResult = { raw: deg.reply, tool_calls: [], iterations: 0, thinking_tokens: 0, cost_cents: 0, latency_ms: 0, success: deg.provider !== 'none' }
  } else {
    try {
    toolResult = await callAnthropicWithTools({
      // MS16 phase 4 — the only streaming call site.
      // S1 phase 1 — the sink accumulates so a stop can persist the partial, and `signal` carries
      // the owner's cancellation into the SDK call itself.
      onToken: tokenSink,
      signal,
      model: routedModel,
      systemPrompt: effectiveSystemPrompt,
      userPrompt,
      priorMessages: historyMessages,
      tools: effectiveTools,
      // ALSO (audit Phase 4): destructive / outbound tools must NOT auto-fire from a chat answer. Intercept
      // them and return a not-executed notice so Aria proposes the change and asks the owner to confirm via
      // the action flow, rather than silently changing a price or sending a message mid-answer.
      executeTool: (name, input) => {
        if (GATED_TOOL_WRITES.has(name)) {
          const verb = name === 'update_product_price' ? 'change a price' : name === 'send_email_now' ? 'send an email' : 'send an SMS'
          return Promise.resolve({ not_executed: true, requires_confirmation: true, tool: name, message: `For safety I don't ${verb} automatically. Confirm and I'll do it.` })
        }
        return executePOSTool(name, input, bid)
      },
      maxTokens,
      maxIterations: routedModel === 'haiku' ? 4 : 8,
      thinking: useThinking ? { enabled: true, budget_tokens: thinkingBudget } : undefined,
      timeoutMs: routedModel === 'haiku' ? 30_000 : 55_000,
      businessId: bid,
      agentKey: 'ask_aria',
      role: 'chat',
      toolChoice: imageToolChoice,
      requestSummary: message.slice(0, 100),
    })
    } catch (e) {
      // S1 PHASE 1 — STOPPED, NOT FAILED. Persist whatever streamed, marked incomplete, and return
      // it as a normal (non-error) response so the thread stays usable and the next action works.
      if (e instanceof AbortedByCaller || signal?.aborted) {
        const partial = streamedSoFar.trim()
        let stoppedConvId: string | null = conversationId
        try {
          stoppedConvId = await upsertConversation(
            bid, userId, conversationId, message,
            partial || '(stopped before Aria wrote anything)',
            'stopped', undefined, true,
          )
        } catch (persistErr) {
          console.error('[aria/ask] could not persist the stopped turn:', (persistErr as Error).message)
        }
        return NextResponse.json({
          response: partial,
          conversation_id: stoppedConvId,
          intent: 'stopped',
          stopped: true,
          incomplete: true,
          blocks: null,
          followups: [],
        })
      }
      throw e
    }

    const emptyResult = toolResult.success && (!toolResult.raw || toolResult.raw.trim().length === 0)
    if (!toolResult.success || emptyResult) {
      // FIX 1 — CROSS-PROVIDER FALLBACK: ANY failure (transient OR provider-level: out-of-credit/billing/auth/
      // rate-limit) falls over to a DIFFERENT provider (Gemini), never a customer-facing 500. When the WHOLE
      // Anthropic provider is unreachable, skip it in the degrade chain (skipAnthropic) so we go straight to
      // Gemini instead of wasting a timeout re-hitting a dead provider. The previous code 500'd on a credit/
      // billing error ("Aria is temporarily unavailable") instead of failing over — that was the bug.
      const errMsg = toolResult.error_message ?? 'empty tool-loop result'
      const providerDown = isAnthropicUnreachable(errMsg)
      const rec = await recordAnthropicFailure(errMsg)
      const deg = await degradedGroundedAnswer({ groundTruth: systemPrompt, message, history: historyMessages, maxTokens, skipAnthropic: providerDown, businessId: bid })
      degradedProvider = deg.provider
      if (rec.incidentId) await recordAnthropicFallbackProvider(rec.incidentId, deg.provider)
      console.warn('[aria/ask] degraded answer served by', deg.provider, 'business', bid, 'providerDown:', providerDown)
      toolResult = { raw: deg.reply, tool_calls: [], iterations: 0, thinking_tokens: 0, cost_cents: 0, latency_ms: 0, success: deg.provider !== 'none' }
    } else {
      // Healthy Anthropic response — close any open circuit.
      await recordAnthropicSuccess()
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  // FIX 1 — log WHICH provider served this turn when we failed over, so fallback firing is visible in
  // aria_ai_calls (gemini→'google', openai→'openai'). The failed Anthropic attempt already logged its own row.
  if (degradedProvider) {
    void logAICallSafe({
      business_id: bid, agent_key: 'ask_aria', role: 'chat',
      provider: degradedProvider === 'gemini' ? 'google' : degradedProvider === 'openai' ? 'openai' : degradedProvider === 'haiku' ? 'anthropic' : 'other',
      success: degradedProvider !== 'none',
      request_summary: 'cross_provider_fallback',
      response_summary: `served_by:${degradedProvider}`,
    })
  }

  // ── API-RESILIENCE-1B — total outage (EVERY provider down) ───────────────
  // The fallback chain returned provider 'none' → not a single hiccup, the whole AI layer is offline.
  // Never return empty (the old bad-reply symptom) and never 500: serve a cached last-good answer if
  // a recent similar one exists (clearly labelled stale), else a calm terminal message that reassures
  // the owner their POS/payments/data are unaffected (those are Supabase/Stripe — no LLM dependency).
  if (degradedProvider === 'none') {
    await recordTotalOutage(toolResult.error_message ?? 'all providers returned empty')

    const cached = await findCachedAnswer(bid, message)
    const isCached = !!cached
    const reply = cached
      ? `Aria's thinking cap is off for a moment — here's your most recent related answer from ${cached.relative} (your live data may have changed since):\n\n${cached.answer}`
      : 'Aria\'s thinking cap is off for a moment — your data is safe and everything else (POS, payments, stock, customers, bookings) keeps working as normal. Give it another go in a bit.'

    let outageConvId = conversationId
    try { outageConvId = await upsertConversation(bid, userId, conversationId, message, reply, 'ai_outage') }
    catch (e) { console.error('[aria/ask] outage upsertConversation failed:', (e as Error).message) }

    console.error('[aria/ask] TOTAL OUTAGE served', JSON.stringify({ cached: isCached }), 'business', bid)
    return NextResponse.json({
      response: reply,
      conversation_id: outageConvId ?? conversationId,
      intent: 'ai_outage',
      degraded_provider: true,
      total_outage: true,
      cached: isCached || undefined,
      note: isCached
        ? 'Cached answer — live data may have changed since it was generated.'
        : 'All AI providers are briefly offline. Your business data and POS are unaffected.',
    }, { status: 200 })
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (useThinking) {
    console.log('[aria/ask] extended_thinking', JSON.stringify({ budget: thinkingBudget, used_tokens: toolResult.thinking_tokens, ms: toolResult.latency_ms }), 'business', bid)
  }

  if (toolResult.tool_calls.length > 0) {
    console.log('[aria/ask] tool_calls', JSON.stringify(toolResult.tool_calls.map(t => ({ name: t.name, ms: t.ms }))), 'business', bid)
  }

  const rawResponse = toolResult.raw
  const action = extractAction(rawResponse)
  let cleanResponse = stripAction(rawResponse)

  // I8 SELF-VERIFY — Aria self-checks complex non-haiku responses BEFORE emitting (moved out of the
  // fire-and-forget waitUntil so a flagged contradiction can actually shape the output). The reviewer
  // FLAGS contradictions only — it never restates/asserts numbers, so nothing here enters _anchor_values.
  // On a CORRECTION verdict: prepend a light, traceable hedge (option c — surgical, lowest cost; never a
  // silent delete) and log the contradiction. Complementary to V2 Check 6 / advisor_guard (which run later).
  if (intent.complexity === 'complex' && routedModel !== 'haiku' && !isImageRequest && !degradedProvider && cleanResponse.length > 100) {
    try {
      const verifierResult = await callAnthropic<{ verdict: string }>(
        {
          model: 'haiku',
          systemPrompt: 'You are a factual accuracy reviewer for an AI business assistant. Given the business context, question, and response — check only for clear numerical errors or invented facts. If accurate, respond "OK". If you find an error, respond "CORRECTION: [brief description]". Be lenient — only flag obvious factual errors. Do NOT restate or assert any numbers yourself.',
          userPrompt: 'Context: revenue this month AUD ' + Math.round(ctx.revenue_month_cents / 100) + ', top products: ' + (ctx.top_products_month ?? []).slice(0, 3).map((p: { name: string }) => p.name).join(', ') + '\nQuestion: ' + message.slice(0, 200) + '\nResponse: ' + cleanResponse.slice(0, 800),
          maxTokens: 150,
          businessId: bid,
          agentKey: 'ask_aria_verifier',
          role: 'analysis', // REWRITE: role='analysis'
        },
        { verdict: 'OK' },
      )
      const contradiction = verifierResult.raw.startsWith('CORRECTION:') ? verifierResult.raw.trim().slice(0, 200) : null
      if (contradiction) {
        // Option (c): light hedge prepended before emission — visible + traceable, no silent deletion.
        cleanResponse = 'I want to double-check one figure here before you rely on it. ' + cleanResponse
        console.warn('[aria/verifier] self-verify flagged:', contradiction, 'for question:', message.slice(0, 80))
      }
      // PART 3 — log every invocation (no table writes beyond the audit log).
      void logAICallSafe({
        business_id: bid, agent_key: 'ask_aria_verifier', role: 'analysis', provider: 'other', success: true,
        request_summary: 'verify_synthesis',
        response_summary: JSON.stringify({ ok: !contradiction, contradiction_count: contradiction ? 1 : 0 }).slice(0, 200),
        learning_signal: contradiction ? `self_verify:${contradiction}`.slice(0, 100) : 'self_verify:passed',
      })
    } catch (e) { console.error('[aria/ask] self-verify failed (non-blocking):', e) }
  }
  // Tool call context is logged separately, NOT appended to user-visible message
  if (toolResult.tool_calls.length > 0) {
    console.log('[aria/ask] tool_calls completed:', toolResult.tool_calls.map(t =>
      `${t.name}(${JSON.stringify(t.input).slice(0, 80)})`
    ).join('; '))
  }
  const historyContent = cleanResponse

  // 6. Handle server-side actions
  let actionResult: Record<string, unknown> = {}

  if (action?.action === 'export') {
    try {
      const exportRes = await generateExport(
        bid,
        (action.subject ?? 'sales') as ExportSubject,
        (action.format ?? 'csv') as ExportFormat,
        String(action.period ?? 'month'),
      )
      actionResult = { type: 'export', ...exportRes }
    } catch (e) {
      actionResult = { type: 'export_error', message: (e as Error).message }
    }
  } else if (action?.action === 'escalate') {
    try {
      const ticket = await createSupportTicket({
        businessId: bid,
        // MS13 phase 3 — auth already established by the rail; the email is fetched only where
        // it is actually used (this escalate branch).
        userEmail: (await supabase.auth.getUser()).data.user?.email ?? 'unknown',
        subject: String(action.issue_summary ?? message).slice(0, 200),
        message,
        category: String(action.category ?? 'general'),
        conversationId: conversationId ?? undefined,
        ariaDiagnosis: cleanResponse,
      })
      actionResult = { type: 'escalate', ticket_id: ticket.id }

      // Mark conversation as escalated
      // SECURITY-CRITICAL-4 — the one spot in this file that omitted the .eq('business_id', bid)
      // scoping every other conversationId read/write in this route already applies.
      if (conversationId) {
        waitUntil((async () => { try { await supabaseAdmin.from('aria_conversations').update({ has_escalated: true }).eq('id', conversationId).eq('business_id', bid) } catch (e) { console.error('[non-fatal]', e) } })())
      }
    } catch (e) {
      actionResult = { type: 'escalate_error', message: (e as Error).message }
    }
  }

  // 7. Save conversation
  let savedConvId = conversationId
  try {
    savedConvId = await upsertConversation(bid, userId, conversationId, message, historyContent, intent.type, undefined, false, branchIntent)
  } catch (e) {
    console.error('[aria/ask] upsertConversation failed:', (e as Error).message, 'conv_id:', conversationId)
  }

  // Write any new memories from this conversation — non-blocking (regex, AI extraction, outcome)
  maybeWriteMemory(bid, message, historyContent).catch(() => {})
  extractAndStoreMemories(bid, message, historyContent, savedConvId).catch(() => {})
  maybeWriteOutcome(bid, message, historyContent, savedConvId).catch(() => {})
  // Summarise conversation for multi-session context — fire-and-forget
  if (savedConvId) {
    const _scid = savedConvId
    Promise.resolve(supabaseAdmin.from('aria_conversations').select('messages').eq('id', _scid).eq('business_id', bid).maybeSingle())
      .then(({ data: conv }) => {
        const msgs = Array.isArray((conv as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
          ? (conv as { messages: Array<{ role: string; content: string }> }).messages
          : []
        // SUMMARIZER-FIX-1 Part 4: main-path anchors from the already-built ctx (cents→dollars) —
        // same role as GROUNDING-TEETH's AVAILABLE_GROUND_TRUTH without extra queries
        const mainGroundTruth = JSON.stringify({
          revenue_today: +(ctx.revenue_today_cents / 100).toFixed(2),
          revenue_this_week_calendar: +(ctx.revenue_week_cents / 100).toFixed(2),
          revenue_this_month: +(ctx.revenue_month_cents / 100).toFixed(2),
        })
        summariseConversation(bid, msgs, _scid, mainGroundTruth).catch(() => {})
      }).catch(() => {})
  }

  // Track actual spend in DB for cost guard
  try {
    await trackSpend(bid, toolResult.cost_cents, 'chat')
    // Also track per-tool usage
    for (const tc of toolResult.tool_calls) {
      if (tc.name === 'generate_image') await trackSpend(bid, 4, 'image') // ~$0.04 for DALL-E 3
      if (tc.name === 'web_search') await trackSpend(bid, 1, 'web_search')
      if (tc.name === 'send_sms_now') await trackSpend(bid, 7, 'sms') // ~$0.07 ClickSend AU
    }
  } catch (e) { console.error('[ask/track-spend] failed', e) }

  // Extract download URLs from any tool that produced one (reports, images, PDFs)
  const downloads: Array<{ filename: string; download_url: string; rows: number; format: string }> = []
  const downloadProducers = ['generate_report', 'generate_image', 'generate_pdf']
  for (const tc of toolResult.tool_calls) {
    if (!downloadProducers.includes(tc.name)) continue
    const r = tc.result as Record<string, unknown> | null
    if (r?.ok && typeof r.download_url === 'string') {
      downloads.push({
        filename: String(r.filename ?? 'file'),
        download_url: r.download_url,
        rows: Number(r.rows ?? 0),
        format: String(r.format ?? 'xlsx'),
      })
    }
  }

  // Persist downloads in conversation so they survive page reload
  if (savedConvId && downloads.length > 0) {
    try {
      await upsertConversation(bid, userId, savedConvId, message, historyContent, intent.type, downloads, false, branchIntent)
    } catch (e) { console.error('[non-fatal]', e) }
  }

  // Extract rich blocks from the response if Aria included them
  let richBlocks = extractBlocks(rawResponse)
  // HEAL-1: validate and self-heal malformed/missing/wrong-type blocks
  // GROUND-1: toolsUsed lets Check 4 catch numeric answers produced with zero tool calls
  const validated = await validateAndHeal({
    userMessage: message,
    blocks: richBlocks,
    rawResponse,
    pipelinePath: 'main',
    businessId: bid,
    toolsUsed: toolResult.tool_calls.length,
  })
  if (validated.healed) richBlocks = validated.blocks
  // GROUND-1: a grounded re-answer replaces the ungrounded narrative text too
  if (validated.healed && validated.healedText) cleanResponse = validated.healedText
  // Phase 5.3: Prepend a task_plan block for complex analytical queries to show analysis steps
  if (intent.complexity === 'complex' && richBlocks && richBlocks.length > 0) {
    const analysisPlanBlock: import('@/lib/aria/ask-types').AskBlock = {
      type: 'task_plan',
      title: 'Aria analysed your business',
      steps: [
        { label: 'Loaded live business data', status: 'done' },
        { label: 'Identified patterns and trends', status: 'done' },
        { label: 'Formed recommendation', status: 'done' },
      ],
    }
    richBlocks.unshift(analysisPlanBlock)
  }
  let finalResponse = richBlocks ? stripBlocks(cleanResponse) : cleanResponse
  // BUG 3 guard: blocks without narrative — generate minimal description so the UI always shows text
  if (richBlocks && richBlocks.length > 0 && !finalResponse.trim()) {
    const firstBlock = richBlocks.find(b => b.type !== 'task_plan') as Record<string, unknown> | undefined
    const blockTitle = (firstBlock?.title as string) ?? (firstBlock?.type as string) ?? 'data'
    finalResponse = `Here is the ${blockTitle} you requested based on your live business data.`
  }

  return NextResponse.json({
    response: finalResponse,
    conversation_id: savedConvId ?? conversationId,
    intent: intent.type,
    action: Object.keys(actionResult).length > 0 ? actionResult : null,
    cost_usd_cents: toolResult.cost_cents,
    downloads: downloads.length > 0 ? downloads : null,
    tool_calls: toolResult.tool_calls.map(t => ({ name: t.name, ms: t.ms })),
    blocks: richBlocks ?? undefined,
    used_council: false,
    ai_mode: routedModel,
    model_used: routedModel,
    sonnet_used_cents: sonnetUsed,
    sonnet_budget_cents: sonnetBudget,
    sonnet_percent_used: Math.min(100, Math.round((sonnetUsed / Math.max(1, sonnetBudget)) * 100)),
    healed: validated.healed || undefined,
    heal_reason: validated.healReason,
    // LOGGING-FIX-1 Part 3: serving-path observability (debug-only) — 'brevity' when the
    // COUNCIL-PORT-1 gate diverted a short-factual question here, otherwise plain main brain
    served_by: isBrevityQuestion ? 'brevity' : 'main_brain',
    // API-RESILIENCE-1 — when Anthropic was down, this answer came from a backup provider using the
    // already-assembled data (no new live lookups). The dashboard shows an amber banner on this flag.
    degraded_provider: degradedProvider ? true : undefined,
    degraded_via: degradedProvider ?? undefined,
    note: degradedProvider ? 'Answered from your latest data — live lookups briefly paused.' : undefined,
  })
}

/**
 * MS16 PHASE 4 — SSE when the client asks for it, unchanged JSON when it doesn't.
 *
 * The stream carries three event types: `stage` (what Aria is doing — the avatar column's live
 * status line reads these), `token` (real deltas), and `done` (the full JSON payload the
 * non-streaming client already understands, so blocks, downloads, actions and provenance arrive
 * exactly as before). A client that cannot stream loses nothing.
 */
function wantsStream(req: Request): boolean {
  return (req.headers.get('accept') ?? '').includes('text/event-stream')
}

const _STREAMING_POST = async (req: Request, routeCtx: unknown, biz: BusinessContext): Promise<Response> => {
  if (!wantsStream(req)) return _POST(req, routeCtx, biz)

  const encoder = new TextEncoder()
  const line = (o: unknown) => encoder.encode(`data: ${JSON.stringify(o)}\n\n`)
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  const writer = writable.getWriter()

  void (async () => {
    try {
      await writer.write(line({ type: 'stage', stage: 'thinking' }))
      const res = await _POST(req, routeCtx, biz, (t: string) => {
        void writer.write(line({ type: 'token', text: t }))
      }, req.signal)
      const payload = await res.json().catch(() => ({ error: 'unreadable response' }))
      await writer.write(line({ type: 'done', payload }))
    } catch (e) {
      // A failure mid-stream must still tell the client something true.
      await writer.write(line({ type: 'error', message: (e as Error).message })).catch(() => {})
    } finally {
      await writer.close().catch(() => {})
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export const POST = withBusinessContext('aria/ask', _STREAMING_POST)
