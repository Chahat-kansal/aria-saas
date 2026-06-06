export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { waitUntil } from '@vercel/functions'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { checkRateLimit } from '@/lib/rate-limit'
import { callAnthropic, callAnthropicWithTools } from '@/lib/aria/providers/anthropic'
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools'
import type { AskBlock } from '@/lib/aria/ask-types'
import { classifyIntent, detectOutputFormat } from '@/lib/aria/ask/intent'
import { buildAskAriaContext, type ContextScope } from '@/lib/aria/ask/business-context'
// buildSystemPrompt replaced by inline Aria OS prompt below
import { ARTIFACT_INSTRUCTIONS } from '@/lib/aria-system-prompt'
import { checkCostCeiling } from '@/lib/aria-cost-guard'
import { buildTroubleshootContext, buildTroubleshootAddendum } from '@/lib/aria/ask/troubleshoot'
import { createSupportTicket } from '@/lib/aria/ask/escalate'
import { generateExport } from '@/lib/aria/ask/files'
import type { ExportFormat, ExportSubject } from '@/lib/aria/ask/files'
import { planAction, isConfirmation } from '@/lib/aria/ask/action-planner'
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

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).limit(1).maybeSingle()
  return data?.id ?? null
}

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

// Builds deterministic factual sentences from VERBATIM_* fields in tool results.
// Numbers are printed by code from SQL rows — the LLM never generates them.
function buildFactsBlock(toolCalls: Array<{ name: string; input: unknown; result: unknown }>): string | null {
  const parts: string[] = []
  for (const tc of toolCalls) {
    const r = tc.result as Record<string, unknown>
    if (!r || typeof r !== 'object') continue
    if (typeof r.VERBATIM_RANKING === 'string' && r.VERBATIM_RANKING) {
      const segs = (r.VERBATIM_RANKING as string).split(' | ')
      parts.push(
        '**Revenue by day of week** (avg per day, normalized for occurrences in period):\n' +
        segs.map(s => '• ' + s).join('\n')
      )
    }
    if (typeof r.VERBATIM_RESULT === 'string' && r.VERBATIM_RESULT) {
      const subject = typeof r.subject === 'string' ? r.subject : 'items'
      const titleMap: Record<string, string> = {
        products: 'Top products by revenue',
        customers: 'Top customers by spend',
        staff: 'Top staff by sales',
        payment_methods: 'Payment methods by revenue',
        categories: 'Top categories by revenue',
      }
      const label = titleMap[subject] ?? 'Top ' + subject
      const segs = (r.VERBATIM_RESULT as string).split(' | ')
      parts.push('**' + label + '**:\n' + segs.map(s => '• ' + s).join('\n'))
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null
}

// Builds data_table AskBlocks from VERBATIM_* tool results so rows render via code, not LLM.
function buildFactsAskBlocks(toolCalls: Array<{ name: string; input: unknown; result: unknown }>): AskBlock[] {
  const blocks: AskBlock[] = []
  for (const tc of toolCalls) {
    const r = tc.result as Record<string, unknown>
    if (!r || typeof r !== 'object' || !Array.isArray(r.rows)) continue
    if (typeof r.VERBATIM_RANKING === 'string') {
      blocks.push({
        type: 'data_table',
        title: 'Revenue by Day of Week',
        columns: [
          { key: 'rank', label: '#' },
          { key: 'key', label: 'Day' },
          { key: 'avg_revenue_per_day', label: 'Avg Revenue/Day', format: 'currency' as const },
          { key: 'day_count', label: 'Days in Period' },
          { key: 'total_revenue', label: 'Total Revenue', format: 'currency' as const },
        ],
        rows: (r.rows as Array<Record<string, unknown>>).map(row => ({
          rank: row.rank,
          key: row.key,
          avg_revenue_per_day: row.avg_revenue_per_day,
          day_count: row.day_count,
          total_revenue: row.total_revenue,
        })),
        sortable: true,
        downloadable: true,
      })
    }
    if (typeof r.VERBATIM_RESULT === 'string') {
      const subject = typeof r.subject === 'string' ? r.subject : ''
      const titleMap: Record<string, string> = {
        products: 'Top Products by Revenue',
        customers: 'Top Customers by Spend',
        staff: 'Top Staff by Sales',
        payment_methods: 'Payment Methods',
        categories: 'Top Categories',
      }
      const colMap: Record<string, Array<{ key: string; label: string; format?: 'currency' | 'number' }>> = {
        products: [{ key: 'rank', label: '#' }, { key: 'name', label: 'Product' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'qty', label: 'Qty Sold' }],
        customers: [{ key: 'rank', label: '#' }, { key: 'name', label: 'Customer' }, { key: 'total_spend', label: 'Spent', format: 'currency' }, { key: 'visit_count', label: 'Visits' }],
        staff: [{ key: 'rank', label: '#' }, { key: 'name', label: 'Staff' }, { key: 'sales', label: 'Revenue', format: 'currency' }, { key: 'transactions', label: 'Sales' }],
        payment_methods: [{ key: 'rank', label: '#' }, { key: 'method', label: 'Method' }, { key: 'revenue', label: 'Revenue', format: 'currency' }, { key: 'transactions', label: 'Txns' }],
        categories: [{ key: 'rank', label: '#' }, { key: 'category', label: 'Category' }, { key: 'revenue', label: 'Revenue', format: 'currency' }],
      }
      blocks.push({
        type: 'data_table',
        title: titleMap[subject] ?? 'Rankings',
        columns: colMap[subject] ?? [{ key: 'rank', label: '#' }, { key: 'name', label: 'Name' }],
        rows: r.rows as Array<Record<string, unknown>>,
        sortable: true,
        downloadable: true,
      })
    }
  }
  return blocks
}

async function upsertConversation(
  businessId: string,
  userId: string,
  conversationId: string | null,
  userMsg: string,
  assistantMsg: string,
  intentType: string,
  downloads?: Array<{ filename: string; download_url: string; rows: number; format: string }>,
): Promise<string> {
  console.log('[upsertConversation] called for biz:', businessId, 'user:', userId, 'existing:', conversationId)
  const pair = [
    { role: 'user', content: userMsg, ts: new Date().toISOString() },
    { role: 'assistant', content: assistantMsg, ts: new Date().toISOString(), downloads: downloads ?? [] },
  ]

  if (conversationId) {
    const { data: existing } = await supabaseAdmin
      .from('aria_conversations')
      .select('messages, message_count')
      .eq('id', conversationId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (existing) {
      const msgs = Array.isArray(existing.messages) ? existing.messages : []
      const { error: updateErr } = await supabaseAdmin.from('aria_conversations').update({
        messages: [...msgs, ...pair],
        message_count: (Number(existing.message_count) || 0) + 2,
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

  const title = userMsg.slice(0, 60)
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

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkRateLimit('ai', user.id)
  if (!rl.ok) return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  // Accept both JSON and multipart/form-data (for file attachments)
  const contentType = req.headers.get('content-type') ?? ''
  let message = ''
  let conversationId: string | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let attachments: any[] = []

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
    const body = await req.json() as { message?: string; conversation_id?: string }
    message = (body.message ?? '').trim()
    conversationId = body.conversation_id ?? null
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
    try { planConvId = await upsertConversation(bid, user.id, conversationId, 'Save plan', planReply, 'plan_saved') } catch (_e) { /* non-fatal */ }
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
  const intent = await classifyIntent(message)
  const outputFmt = detectOutputFormat(message)

  // 1a. Check if a pending action awaits confirmation
  if (conversationId) {
    const { data: convPending } = await supabase.from('aria_conversations')
      .select('pending_action,pending_action_expires_at')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()

    if (convPending?.pending_action && isConfirmation(message)) {
      const expired = convPending.pending_action_expires_at &&
        new Date(String(convPending.pending_action_expires_at)) < new Date()
      if (!expired) {
        const result = await executeAction(
          convPending.pending_action as PlannedAction, bid, user.id, conversationId, message,
        )
        await supabase.from('aria_conversations').update({
          pending_action: null, pending_action_expires_at: null,
        }).eq('id', conversationId)

        // If action failed — return plain error, no council
        if (!result.ok) {
          const errText = `Action failed: ${result.error ?? 'Unknown error'}`
          let failConvId = conversationId
          try { failConvId = await upsertConversation(bid, user.id, conversationId, message, errText, 'action_executed') } catch (e) { console.error('[silent-catch]', e) }
          return NextResponse.json({
            response: errText,
            conversation_id: failConvId ?? conversationId,
            intent: 'action_executed',
            action: { type: 'execution_result', ...result },
            cost_usd_cents: 0,
          })
        }

        // Action succeeded — run council so Aria reflects on what changed
        const execSummary = `${(convPending.pending_action as PlannedAction).title} — ${result.affected_count} item${result.affected_count !== 1 ? 's' : ''} updated.${result.rollback_available ? ' Reversible within 1 hour.' : ''}`
        let postCouncil: CouncilOutput | null = null
        try {
          const bizCtxForAction = await getBusinessContext(bid)
          postCouncil = await runAriaCouncil(bizCtxForAction + '\n\nRECENT_ACTION: ' + execSummary, bid, 'ask_aria')
        } catch (e) {
          console.error('[aria/ask] post-action council failed, using summary:', (e as Error).message)
        }
        const responseText = postCouncil?.final_briefing ?? execSummary
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'action_executed')
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

  // 1b. Detect action intent not caught by classifier
  // NOTE: only trigger if NOT a strategic/advisory question — those go to council
  const ACTION_KEYWORDS = /\b(update|change|mark|set|adjust|apply|create|make|give|reduce|increase)\b/i
  const ACTION_SUBJECTS = /\b(price|prices|stock|products?|inventory|staff|permission|discount)\b/i
  const isStrategicQuestion = /should|recommend|best|strategy|improve|why|how can|what would|advice|suggest|analyse|analyze|compare|forecast|plan|opportunity|risk|growth|optimise|optimize/i.test(message)
  // Actions that are too risky to execute immediately — propose-only (save plan, don't execute)
  const PROPOSE_ONLY_TYPES = new Set(['bulk_price_update', 'create_roster'])
  if (ACTION_KEYWORDS.test(message) && ACTION_SUBJECTS.test(message) && intent.type === 'question' && !isStrategicQuestion) {
    const planned = await planAction(message, bid)
    if (planned) {
      if (conversationId) {
        await supabase.from('aria_conversations').update({
          pending_action: planned,
          pending_action_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }).eq('id', conversationId).eq('business_id', bid)
      }
      const propose_only = PROPOSE_ONLY_TYPES.has(planned.type)
      const previewText = propose_only
        ? `I've drafted a plan: ${planned.title}. This type of change needs your review before execution — I'll save it to your Actions dashboard.`
        : `I can ${planned.title.toLowerCase()}. Choose how to proceed:`
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, user.id, conversationId, message, previewText, 'action_request')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (action_request):', (e as Error).message, 'conv_id:', conversationId)
      }
      return NextResponse.json({
        response: previewText,
        conversation_id: savedConvId ?? conversationId,
        intent: 'action_request',
        action: { action: 'fork', planned, propose_only },
        cost_usd_cents: 0,
      })
    }
  }

  // 2b-pre. Multi-domain path — parallel agents for broad business overview questions
  const MULTI_DOMAIN_TRIGGERS = /\b(weekly review|full summary|how (is|are) (everything|my business)|give me (an? )?overview|how (did|am) (i|we) (do|doing)|complete briefing|all (of )?my metrics|overall (performance|status))\b/i
  const isMultiDomain = intent.type === 'question' && MULTI_DOMAIN_TRIGGERS.test(message)

  if (isMultiDomain) {
    try {
      const { data: bizInfo } = await supabaseAdmin.from('businesses').select('industry, subscription_tier').eq('id', bid).maybeSingle()
      const tasks = buildBriefingTasks(bid, (bizInfo as { industry?: string } | null)?.industry ?? 'retail')
      const parallelResult = await runParallelAriaAgents(bid, tasks, (bizInfo as { subscription_tier?: string } | null)?.subscription_tier ?? 'starter')
      const responseText = 'Here\'s your full business overview:\n\n' + parallelResult.merged
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'multi_domain')
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
  const deliverableKind = classifyDeliverableKind(message)
  if (deliverableKind && !isMultiDomain) {
    try {
      const { data: bizInfoD } = await supabaseAdmin.from('businesses').select('industry').eq('id', bid).maybeSingle()
      const result = await generateDeliverable(bid, conversationId ?? null, message, deliverableKind, (bizInfoD as { industry?: string } | null)?.industry ?? 'retail')
      const responseText = 'Here\'s your ' + result.title + ':\n\n[DELIVERABLE:' + result.outputId + ']'
      let savedConvId = conversationId
      try {
        savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'deliverable')
      } catch (e) {
        console.error('[aria/ask] upsertConversation failed (deliverable):', (e as Error).message)
      }
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
      const bgConvId = await upsertConversation(bid, user.id, conversationId, message, 'Working on it in the background — I\'ll notify you when done.', 'background_task').catch(() => conversationId)
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

  // 2b. Strategic council path — skip buildAskAriaContext (19 DB queries wasted) for council requests
  if (isStrategicQuestion) {
    try {
      const bizCtx = await getBusinessContext(bid)
      const council = await runAriaCouncil(bizCtx + '\n\nOWNER_QUESTION: ' + message, bid, 'ask_aria', message)
      if (council?.final_briefing) {
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, user.id, conversationId, message, council.final_briefing, intent.type)
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (council):', (e as Error).message)
        }
        // Fire-and-forget memory extraction + conversation summarisation for council responses
        extractAndStoreMemories(bid, message, council.final_briefing, savedConvId).catch(() => {})
        if (savedConvId) {
          const _cid = savedConvId
          Promise.resolve(supabaseAdmin.from('aria_conversations').select('messages').eq('id', _cid).maybeSingle())
            .then(({ data: conv }) => {
              const msgs = Array.isArray((conv as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
                ? (conv as { messages: Array<{ role: string; content: string }> }).messages
                : []
              summariseConversation(bid, msgs, _cid).catch(() => {})
            }).catch(() => {})
        }
        return NextResponse.json({
          blocks: council.ask_blocks ?? [{ type: 'lead', content: council.final_briefing }],
          followups: council.ask_followups ?? [],
          used_council: true,
          response: council.final_briefing,
          conversation_id: savedConvId ?? conversationId,
          intent: intent.type,
          action: null,
          cost_usd_cents: 0,
          downloads: null,
          tool_calls: [],
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

  // 3. Build system prompt
  let systemPrompt = `You are Aria, the autonomous AI business co-pilot for Aria OS — for Australian small businesses.

⛔ IRON RULES — ABSOLUTE — NEVER BREAK THESE:

1. **NEVER COMPUTE NUMBERS YOURSELF.** Every revenue figure, ranking, average, or count you state MUST come from a tool result returned in this conversation. If you don't have a tool result for it, call the tool. Do not aggregate, average, or rank raw rows in your head — call query_sales with group_by="day_of_week" and use the returned avg_revenue_per_day. Do not add up totals from individual sale rows — call get_summary. The tool computes; you narrate.

2. **NEVER STATE LOCATION, HOURS, CUISINE, OR BUSINESS CONCEPT** unless get_business_profile returned that field as non-null. If the business has no city set, say "your location" — never say "Melbourne", "Sydney", "CBD", "Brunswick", or any place. If hours are not set, say "your opening hours" — never invent them. If the industry is "Café" but no cuisine detail is set, never add "specialty coffee" or "brunch spot".

3. **ABSTAIN OVER GUESS.** If data is absent, say so plainly. "I don't have staff performance data for this period — served_by is not recorded for these sales." Never fill silence with plausible-sounding invented numbers or facts.

4. **VERBATIM PASS-THROUGH — COPY DIGITS, KEEP ORDER.** Tool results containing a VERBATIM_RANKING or VERBATIM_RESULT field must be narrated character-for-character. (a) Copy each dollar value digit-for-digit — if the field says $826.76, you write $826.76, not $827 or $863. (b) Keep the exact order the tool returned — never reorder. (c) For day-of-week, always rank by avg_revenue_per_day (NOT total_revenue) — use the returned rank field, do not recompute. (d) If you lack a tool result for a specific figure, call the tool — never fill a number from memory.

YOU CAN TAKE REAL ACTION using these tools. Don't just describe what could be done — DO IT.

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
• send_sms_now: send SMS via Twilio
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
   - If it says "Twilio not configured" → tell user "SMS isn't set up — admin needs to add Twilio credentials"
   - NEVER say "Let me try again — one moment" without actually retrying in the same response. If you say it, DO IT.
   - You have admin DB access — you CAN make queries work
   - SHOW the underlying error message to the user when relevant

9. **COLUMN NAME REFERENCE (use these EXACT names):**
   - Products: price (the selling price), cost_price, stock_quantity or current_stock, name, sku, barcode, category, brand
   - When user says "selling price" they mean the column named "price". When they say "cost" they mean "cost_price".
   - Sales: total_amount, created_at, customer_name, payment_method
   - Customers: total_spent (or total_spend for Square data), visit_count, last_visit
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
"Square sync failing": Check square_connections exists AND token_expires_at > now(). square_connected=true on businesses table can be stale.
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
Pending Aria actions: ${ctx.pending_aria_actions}
Open support tickets: ${ctx.open_support_tickets}
Top products this month: ${ctx.top_products_month.map(p => `${p.name} ($${p.revenue.toFixed(2)})`).join(', ') || 'no data'}
Top customers this month: ${ctx.top_customers_month.map(c => `${c.name} ($${c.total_spent.toFixed(2)}, ${c.visits} visits)`).join(', ') || 'no data'}
Month vs last month: ${ctx.monthly_comparison.change_pct > 0 ? '+' : ''}${ctx.monthly_comparison.change_pct.toFixed(1)}% ($${(ctx.monthly_comparison.this_month/100).toFixed(2)} vs $${(ctx.monthly_comparison.last_month/100).toFixed(2)})
Avg daily revenue: $${ctx.avg_daily_revenue.toFixed(2)}
Loyalty members: ${ctx.loyalty_stats.total_members} (${ctx.loyalty_stats.active_last_30d} active last 30d)
Pending purchase orders: ${ctx.pending_purchase_orders.length > 0 ? ctx.pending_purchase_orders.map(o => `${o.supplier} $${o.total}`).join(', ') : 'none'}
Subscription: ${ctx.subscription_tier ?? 'unknown'}

FRESH SIGNALS (from monitoring engine, last 30 min):
${ctx.fresh_signals.filter(s => ['alert','critical','watch'].includes(String((s.payload?.severity ?? 'info')))).map(s => `- ${s.signal_type} (${s.payload.severity}): ${JSON.stringify(s.payload)}`).join('\n') || 'no anomalies detected'}

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

BUSINESS IDENTITY — HARD RULES (non-negotiable):
- Location is EXACTLY what appears in CURRENT BUSINESS above. NEVER invent suburbs, neighbourhoods, streets, or local areas (e.g. do NOT say "Brunswick", "Fitzroy", "CBD", "inner north" unless they appear in the address field). If city is not set, say "your area" — never assume Melbourne or any specific city.
- NEVER describe the business concept or cuisine style (e.g. "a brunch café", "specialty coffee", "wine bar vibe") unless those exact words appear in the business name or industry field above.
- Day-of-week performance: only cite pre-aggregated averages (e.g. "Sunday averages $827/day"). NEVER cite individual dates ("we had a big Friday on 23 May") as evidence of a weekday pattern — that is one data point, not a pattern.
- If a ranked chart shows Sunday as #1, Sunday IS #1. Do not contradict the chart data with your own reasoning.

TOOLS AVAILABLE (use them — do not guess):
You have function-calling tools that hit the live database. When the owner asks something not in LIVE BUSINESS DATA above, call a tool instead of saying "I don't have that data". Examples:

- "what was my best Tuesday last quarter" → call query_sales with date_from/date_to spanning the quarter, group_by="day_of_week"
- "what is my busiest day of the week" → call query_sales for the last 30 days with group_by="day_of_week" (returns avg_revenue_per_day normalized by occurrences AND a VERBATIM_RANKING string — copy VERBATIM_RANKING digit-for-digit, do NOT recompute or reorder)
- "who are my top 10 customers" → call query_customers with sort_by="ltv" limit=10
- "compare this month vs last" → call compare_periods with two date ranges
- "any dead stock" → call query_inventory with dead_stock_only=true
- "is X selling well" → call query_sales with group_by="product" for a relevant period

After a tool returns, interpret the results plainly. Quote the exact numbers from the tool result — if a VERBATIM_RANKING or VERBATIM_RESULT field is present, copy it character-for-character. Do not invent supplementary numbers. If a tool returns no rows, say "no data found for that period" rather than fabricating.

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
ALWAYS write at least 2 full paragraphs of narrative analysis BEFORE the <json_blocks> tag. Never output a block without preceding narrative text. If you have data to show in a chart or table, explain what it means first, then add the block. A response that starts with or only contains a block is always wrong.

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
When the owner asks for a "graph", "chart", "visualise", or specifies a chart type → use "styled_chart" with their preferred chart_type and color if specified.
When the owner asks for a "table", "tabular", "rows", "list of" → use "data_table" with downloadable: true.
When the owner asks for a "spreadsheet", "export", "download", "CSV", "Excel" → use "spreadsheet" with auto_download: true.
When the owner asks to "compare", "vs", "this week vs last week" → use "comparison_table" with the two periods clearly labelled.
When the owner wants a single metric/KPI/number → use "kpi_card" with appropriate format and trend if data supports it.
When the owner specifies a colour ("in green", "red chart") → pass it as a hex in the color field.
You can return MULTIPLE blocks — e.g. both a styled_chart AND a spreadsheet if the owner wants both a visual and a download.

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

${ARTIFACT_INSTRUCTIONS}

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

  // Inject memories at top of prompt so they frame every response
  if (ctx.memories.length > 0) {
    const memoryBlock = '\n\nWHAT I KNOW ABOUT ' + ctx.business_name.toUpperCase() + ' (from our history — use this to personalise every response):\n' +
      ctx.memories.map((m: { kind: string; content: string }) => '• [' + m.kind + '] ' + m.content).join('\n') +
      '\n\nThese are facts about this specific business. Reference them naturally — don\'t say "I remember" just use the knowledge.'
    systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + '\n\nYou are Aria')
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
      .select('name, system_prompt_addition')
      .eq('business_id', bid).eq('enabled', true).limit(8)
    if (skills && skills.length > 0) {
      const block = skills
        .map((s: { name: string; system_prompt_addition: string }) => `[${s.name}] ${s.system_prompt_addition}`)
        .join('\n')
      systemPrompt += '\n\nACTIVE SKILLS (the owner has asked you to take on these roles — stack their lenses across your reply):\n' + block
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
      savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'generate_image')
    } catch (e) { console.error('[aria/ask] upsertConversation failed (image):', (e as Error).message) }
    const downloads = imgResult.ok && imgResult.download_url ? [{
      filename: imgResult.filename ?? 'poster.png',
      download_url: imgResult.download_url,
      rows: 0,
      format: 'png',
    }] : []
    if (savedConvId && downloads.length > 0) {
      try {
        const { data: conv } = await supabaseAdmin.from('aria_conversations').select('messages').eq('id', savedConvId).single()
        const msgs = Array.isArray((conv as any)?.messages) ? (conv as any).messages : []
        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg?.role === 'assistant') {
          lastMsg.downloads = downloads
          await supabaseAdmin.from('aria_conversations').update({ messages: msgs }).eq('id', savedConvId)
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

  const toolResult = await callAnthropicWithTools({
    model: routedModel,
    systemPrompt,
    userPrompt,
    priorMessages: historyMessages,
    tools: allTools,
    executeTool: (name, input) => executePOSTool(name, input, bid),
    maxTokens,
    maxIterations: routedModel === 'haiku' ? 4 : 8,
    thinking: useThinking ? { enabled: true, budget_tokens: thinkingBudget } : undefined,
    timeoutMs: routedModel === 'haiku' ? 30_000 : 55_000,
    businessId: bid,
    agentKey: 'ask_aria',
    role: 'chat',
    toolChoice: imageToolChoice,
  })

  if (useThinking) {
    console.log('[aria/ask] extended_thinking', JSON.stringify({ budget: thinkingBudget, used_tokens: toolResult.thinking_tokens, ms: toolResult.latency_ms }), 'business', bid)
  }

  if (toolResult.tool_calls.length > 0) {
    console.log('[aria/ask] tool_calls', JSON.stringify(toolResult.tool_calls.map(t => ({ name: t.name, ms: t.ms }))), 'business', bid)
  }

  const rawResponse = toolResult.raw
  const action = extractAction(rawResponse)
  const cleanResponse = stripAction(rawResponse)

  // ─── DETERMINISTIC FACTS INJECTION ─────────────────────────────────────────
  // When tool results contain VERBATIM_* fields, CODE builds the factual sentences
  // from the SQL rows directly. The LLM is then called ONLY for prose interpretation
  // — it is forbidden from writing any number. This structurally prevents digit drift.
  const factsText = buildFactsBlock(toolResult.tool_calls)
  const factsAskBlocks = buildFactsAskBlocks(toolResult.tool_calls)
  let factsInterpretation = ''
  if (factsText) {
    try {
      const interpRes = await callAnthropic<Record<string, unknown>>(
        {
          model: 'haiku',
          systemPrompt: 'You are a business insight writer. The exact data figures are already shown to the user above your response. Your ONLY job: write 1-2 sentences about what this means for the business, and one action to take. ABSOLUTE RULES: (1) DO NOT write any dollar sign ($), any number, any percentage (%), or any numeric rank. (2) Words only — e.g. "your strongest day", "leads by a clear margin", "your quietest period". (3) Max 60 words. Writing a number is an error.',
          userPrompt: 'Owner question: ' + message + '\n\nFacts already shown to user:\n' + factsText,
          maxTokens: 150,
          businessId: bid,
          agentKey: 'ask_aria',
          role: 'narrative',
        },
        {},
      )
      factsInterpretation = interpRes.raw
    } catch (e) {
      console.error('[aria/ask] facts interpretation failed (non-blocking):', (e as Error).message)
    }
  }
  // ───────────────────────────────────────────────────────────────────────────

  // Phase 6: Haiku verification pass for complex Sonnet/Opus responses
  if (intent.complexity === 'complex' && routedModel !== 'haiku' && !isImageRequest && cleanResponse.length > 100) {
    waitUntil((async () => {
      try {
        const verifierResult = await callAnthropic<{ verdict: string }>(
          {
            model: 'haiku',
            systemPrompt: 'You are a factual accuracy reviewer for an AI business assistant. Given the business context, question, and response — check only for clear numerical errors or invented facts. If accurate, respond "OK". If you find an error, respond "CORRECTION: [brief description]". Be lenient — only flag obvious factual errors.',
            userPrompt: 'Context: revenue this month AUD ' + Math.round(ctx.revenue_month_cents / 100) + ', top products: ' + (ctx.top_products_month ?? []).slice(0, 3).map((p: { name: string }) => p.name).join(', ') + '\nQuestion: ' + message.slice(0, 200) + '\nResponse: ' + cleanResponse.slice(0, 800),
            maxTokens: 150,
            businessId: bid,
            agentKey: 'ask_aria_verifier',
            role: 'classify',
          },
          { verdict: 'OK' },
        )
        if (verifierResult.raw.startsWith('CORRECTION:')) {
          console.warn('[aria/verifier] factual correction flagged:', verifierResult.raw, 'for question:', message.slice(0, 80))
        }
      } catch (e) { console.error('[aria/ask] verifier failed (non-blocking):', e) }
    })())
  }
  // Tool call context is logged separately, NOT appended to user-visible message
  if (toolResult.tool_calls.length > 0) {
    console.log('[aria/ask] tool_calls completed:', toolResult.tool_calls.map(t =>
      `${t.name}(${JSON.stringify(t.input).slice(0, 80)})`
    ).join('; '))
  }
  // When facts were code-built, historyContent uses accurate figures — not the LLM's raw text
  const historyContent = factsText
    ? (factsText + (factsInterpretation ? '\n\n' + factsInterpretation : ''))
    : cleanResponse

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
        userEmail: user.email ?? 'unknown',
        subject: String(action.issue_summary ?? message).slice(0, 200),
        message,
        category: String(action.category ?? 'general'),
        conversationId: conversationId ?? undefined,
        ariaDiagnosis: cleanResponse,
      })
      actionResult = { type: 'escalate', ticket_id: ticket.id }

      // Mark conversation as escalated
      if (conversationId) {
        waitUntil((async () => { try { await supabaseAdmin.from('aria_conversations').update({ has_escalated: true }).eq('id', conversationId) } catch (e) { console.error('[non-fatal]', e) } })())
      }
    } catch (e) {
      actionResult = { type: 'escalate_error', message: (e as Error).message }
    }
  }

  // 7. Save conversation
  let savedConvId = conversationId
  try {
    savedConvId = await upsertConversation(bid, user.id, conversationId, message, historyContent, intent.type)
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
    Promise.resolve(supabaseAdmin.from('aria_conversations').select('messages').eq('id', _scid).maybeSingle())
      .then(({ data: conv }) => {
        const msgs = Array.isArray((conv as { messages?: Array<{ role: string; content: string }> } | null)?.messages)
          ? (conv as { messages: Array<{ role: string; content: string }> }).messages
          : []
        summariseConversation(bid, msgs, _scid).catch(() => {})
      }).catch(() => {})
  }

  // Track actual spend in DB for cost guard
  try {
    await trackSpend(bid, toolResult.cost_cents, 'chat')
    // Also track per-tool usage
    for (const tc of toolResult.tool_calls) {
      if (tc.name === 'generate_image') await trackSpend(bid, 4, 'image') // ~$0.04 for DALL-E 3
      if (tc.name === 'web_search') await trackSpend(bid, 1, 'web_search')
      if (tc.name === 'send_sms_now') await trackSpend(bid, 7, 'sms') // ~$0.07 Twilio AU
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
      await upsertConversation(bid, user.id, savedConvId, message, historyContent, intent.type, downloads)
    } catch (e) { console.error('[non-fatal]', e) }
  }

  // Extract rich blocks from the response if Aria included them.
  // When factsText is set, we skip LLM blocks entirely — code-built data_table is used instead.
  const richBlocks = factsText ? null : extractBlocks(rawResponse)
  // Phase 5.3: Prepend a task_plan block for complex analytical queries to show analysis steps
  if (!factsText && intent.complexity === 'complex' && richBlocks && richBlocks.length > 0) {
    const analysisPlanBlock: AskBlock = {
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

  let finalResponse: string
  let outputBlocks: AskBlock[] | undefined

  if (factsText) {
    // Numbers are code-built from SQL rows — accurate to the cent.
    // LLM prose (factsInterpretation) contains words only, no figures.
    finalResponse = factsText + (factsInterpretation ? '\n\n' + factsInterpretation : '')
    outputBlocks = factsAskBlocks.length > 0 ? factsAskBlocks : undefined
  } else {
    finalResponse = richBlocks ? stripBlocks(cleanResponse) : cleanResponse
    // BUG 3 guard: blocks without narrative — generate minimal description so the UI always shows text
    if (richBlocks && richBlocks.length > 0 && !finalResponse.trim()) {
      const firstBlock = richBlocks.find(b => b.type !== 'task_plan') as Record<string, unknown> | undefined
      const blockTitle = (firstBlock?.title as string) ?? (firstBlock?.type as string) ?? 'data'
      finalResponse = 'Here is the ' + blockTitle + ' you requested based on your live business data.'
    }
    outputBlocks = richBlocks ?? undefined
  }

  // Safety net: never return an empty response
  if (!finalResponse?.trim()) {
    console.error('[ask-debug] finalResponse empty — factsText:', factsText !== null ? 'set' : 'null', 'cleanResponse.len:', cleanResponse?.length ?? 0, 'rawResponse.len:', rawResponse?.length ?? 0)
    finalResponse = cleanResponse?.trim() || "I wasn't able to generate a response for that question. Please try rephrasing."
  }

  return NextResponse.json({
    response: finalResponse,
    conversation_id: savedConvId ?? conversationId,
    intent: intent.type,
    action: Object.keys(actionResult).length > 0 ? actionResult : null,
    cost_usd_cents: toolResult.cost_cents,
    downloads: downloads.length > 0 ? downloads : null,
    tool_calls: toolResult.tool_calls.map(t => ({ name: t.name, ms: t.ms })),
    blocks: outputBlocks,
    used_council: false,
    ai_mode: routedModel,
    model_used: routedModel,
    sonnet_used_cents: sonnetUsed,
    sonnet_budget_cents: sonnetBudget,
    sonnet_percent_used: Math.min(100, Math.round((sonnetUsed / Math.max(1, sonnetBudget)) * 100)),
  })
}

export const POST = withErrorCapture('aria/ask', _POST)
