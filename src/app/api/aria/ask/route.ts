export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { callAnthropic, callAnthropicWithTools } from '@/lib/aria/providers/anthropic'
import { ARIA_POS_TOOLS, executePOSTool } from '@/lib/aria-tools'
import { classifyIntent } from '@/lib/aria/ask/intent'
import { buildAskAriaContext } from '@/lib/aria/ask/business-context'
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
): Promise<string> {
  const pair = [
    { role: 'user', content: userMsg, ts: new Date().toISOString() },
    { role: 'assistant', content: assistantMsg, ts: new Date().toISOString() },
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
      await supabaseAdmin.from('aria_conversations').update({
        messages: [...msgs, ...pair],
        message_count: (Number(existing.message_count) || 0) + 2,
        last_message_at: new Date().toISOString(),
        last_intent: intentType,
      }).eq('id', conversationId)
      return conversationId
    }
  }

  const title = userMsg.slice(0, 60)
  const { data: created } = await supabaseAdmin.from('aria_conversations').insert({
    business_id: businessId,
    user_id: userId,
    title,
    messages: pair,
    message_count: 2,
    last_intent: intentType,
    last_message_at: new Date().toISOString(),
  }).select('id').single()

  return (created as { id: string }).id
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business found' }, { status: 404 })

  const body = await req.json() as { message?: string; conversation_id?: string }
  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 })

  const conversationId = body.conversation_id ?? null

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

  // 1. Classify intent
  const intent = await classifyIntent(message)

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
        const responseText = result.ok
          ? `Done — ${result.affected_count} item${result.affected_count !== 1 ? 's' : ''} updated.${result.rollback_available ? ' You can undo within 1 hour.' : ''}`
          : `Action failed: ${result.error}`
        let savedConvId = conversationId
        try {
          savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'action_executed')
        } catch (e) {
          console.error('[aria/ask] upsertConversation failed (action_executed):', (e as Error).message, 'conv_id:', conversationId)
        }
        return NextResponse.json({
          response: responseText,
          conversation_id: savedConvId ?? conversationId,
          intent: 'action_executed',
          action: { type: 'execution_result', ...result },
          cost_usd_cents: 0,
        })
      }
    }
  }

  // 1b. Detect action intent not caught by classifier
  const ACTION_KEYWORDS = /\b(update|change|mark|set|adjust|apply|create|make|give|reduce|increase)\b/i
  const ACTION_SUBJECTS = /\b(price|prices|stock|products?|inventory|staff|permission|discount)\b/i
  if (ACTION_KEYWORDS.test(message) && ACTION_SUBJECTS.test(message) && intent.type === 'question') {
    const planned = await planAction(message, bid)
    if (planned) {
      if (conversationId) {
        await supabase.from('aria_conversations').update({
          pending_action: planned,
          pending_action_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        }).eq('id', conversationId).eq('business_id', bid)
      }
      const previewText = `I'll ${planned.title.toLowerCase()}. Here's exactly what I'll do — confirm to proceed:`
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
        action: { action: 'preview', planned },
        cost_usd_cents: 0,
      })
    }
  }

  // 2. Build context
  const ctx = await buildAskAriaContext(bid, conversationId ?? undefined)

  // 3. Build system prompt
  let systemPrompt = `You are Aria, the AI business co-pilot built into Aria OS — an all-in-one operating system for Australian small businesses. You have deep knowledge of the business's own data, Aria OS's features, and Australian business regulations.

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

FRESH SIGNALS (from monitoring engine, last 30 min):
${ctx.fresh_signals.filter(s => ['alert','critical','watch'].includes(String((s.payload?.severity ?? 'info')))).map(s => `- ${s.signal_type} (${s.payload.severity}): ${JSON.stringify(s.payload)}`).join('\n') || 'no anomalies detected'}

WHAT I KNOW ABOUT THIS BUSINESS (from prior conversations and outcomes — use to personalise responses, never contradict):
${ctx.memories.length > 0 ? ctx.memories.map(m => `- [${m.kind}${m.topic ? '/' + m.topic : ''}] ${m.content}`).join('\n') : 'no memories yet — this is one of our first conversations'}

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

TOOLS AVAILABLE (use them — do not guess):
You have function-calling tools that hit the live database. When the owner asks something not in LIVE BUSINESS DATA above, call a tool instead of saying "I don't have that data". Examples:

- "what was my best Tuesday last quarter" → call query_sales with date_from/date_to spanning the quarter, group_by="day"
- "who are my top 10 customers" → call query_customers with sort_by="ltv" limit=10
- "compare this month vs last" → call compare_periods with two date ranges
- "any dead stock" → call query_inventory with dead_stock_only=true
- "is X selling well" → call query_sales with group_by="product" for a relevant period

After a tool returns, interpret the results plainly. Quote the exact numbers from the tool result. Do not invent supplementary numbers. If a tool returns no rows, say "no data found for that period" rather than fabricating.

You can chain tools in one response — call query_sales first to find a pattern, then query_inventory to check stock for the products you found, then write your conclusion. Up to 5 tool calls per response.
${ARTIFACT_INSTRUCTIONS}`

  // 4. Add troubleshoot addendum if needed
  if (intent.type === 'troubleshoot' || intent.type === 'escalate') {
    const tsCtx = await buildTroubleshootContext(bid)
    systemPrompt += buildTroubleshootAddendum(tsCtx)
  }

  // 5. Build proper multi-turn history for Claude
  const historyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const m of ctx.conversation_history) {
    if (m.role === 'user' || m.role === 'assistant') {
      historyMessages.push({ role: m.role as 'user' | 'assistant', content: String(m.content) })
    }
  }

  const userPrompt = message

  const model = intent.type === 'escalate' ? 'opus' : 'sonnet'

  const useThinking = intent.complexity === 'complex' || intent.type === 'troubleshoot' || intent.type === 'escalate'
  const thinkingBudget = intent.type === 'escalate' ? 4000 : 2000

  const toolResult = await callAnthropicWithTools({
    model,
    systemPrompt,
    userPrompt,
    priorMessages: historyMessages,
    tools: ARIA_POS_TOOLS,
    executeTool: (name, input) => executePOSTool(name, input, bid),
    maxTokens: useThinking ? 4096 : 2048,
    maxIterations: 5,
    thinking: useThinking ? { enabled: true, budget_tokens: thinkingBudget } : undefined,
    timeoutMs: useThinking ? 45_000 : 25_000,
    businessId: bid,
    agentKey: 'ask_aria',
    role: 'chat',
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
  const toolSummary = toolResult.tool_calls.length > 0
    ? '\n\n[Context from data lookup: ' + toolResult.tool_calls.map(t =>
        `${t.name}(${JSON.stringify(t.input).slice(0, 80)}) → ${JSON.stringify(t.result).slice(0, 200)}`
      ).join('; ') + ']'
    : ''
  const historyContent = cleanResponse + toolSummary

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
        void (async () => { try { await supabaseAdmin.from('aria_conversations').update({ has_escalated: true }).eq('id', conversationId) } catch { /* non-fatal */ } })()
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

  return NextResponse.json({
    response: cleanResponse,
    conversation_id: savedConvId ?? conversationId,
    intent: intent.type,
    action: Object.keys(actionResult).length > 0 ? actionResult : null,
    cost_usd_cents: toolResult.cost_cents,
  })
}

export const POST = withErrorCapture('aria/ask', _POST)
