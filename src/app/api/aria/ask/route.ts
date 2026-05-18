export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { callAnthropic } from '@/lib/aria/providers/anthropic'
import { classifyIntent } from '@/lib/aria/ask/intent'
import { buildAskAriaContext } from '@/lib/aria/ask/business-context'
import { buildSystemPrompt } from '@/lib/aria/ask/system-prompt'
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
        const savedConvId = await upsertConversation(bid, user.id, conversationId, message, responseText, 'action_executed').catch(() => null)
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
      const savedConvId = await upsertConversation(bid, user.id, conversationId, message, previewText, 'action_request').catch(() => null)
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
  let systemPrompt = buildSystemPrompt(ctx)

  // 4. Add troubleshoot addendum if needed
  if (intent.type === 'troubleshoot' || intent.type === 'escalate') {
    const tsCtx = await buildTroubleshootContext(bid)
    systemPrompt += buildTroubleshootAddendum(tsCtx)
  }

  // 5. Prepend conversation history for context
  const historyText = ctx.conversation_history.length > 0
    ? ctx.conversation_history.map(m => `${m.role}: ${m.content}`).join('\n') + '\n\n'
    : ''

  const userPrompt = `${historyText}User: ${message}`

  const model = intent.type === 'escalate' ? 'opus' : 'sonnet'

  const llmResult = await callAnthropic<Record<string, unknown>>(
    {
      model,
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      businessId: bid,
      agentKey: 'ask_aria',
      role: 'chat',
    },
    {},
  )

  const rawResponse = llmResult.raw
  const action = extractAction(rawResponse)
  const cleanResponse = stripAction(rawResponse)

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
  const savedConvId = await upsertConversation(bid, user.id, conversationId, message, cleanResponse, intent.type).catch(() => null)

  return NextResponse.json({
    response: cleanResponse,
    conversation_id: savedConvId ?? conversationId,
    intent: intent.type,
    action: Object.keys(actionResult).length > 0 ? actionResult : null,
    cost_usd_cents: llmResult.cost_cents,
  })
}

export const POST = withErrorCapture('aria/ask', _POST)
