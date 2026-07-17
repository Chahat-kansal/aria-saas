export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { planAction, isConfirmation } from '@/lib/aria/ask/action-planner'
import { executeAction } from '@/lib/aria/ask/action-executor'
import type { PlannedAction } from '@/lib/aria/ask/action-planner'

async function _POST(req: Request, _context: unknown, { supabase, userId, businessId: bid }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as { message?: string; conversation_id?: string; intent?: string }
  const message = String(body.message ?? '').trim()
  const conversationId = body.conversation_id ? String(body.conversation_id) : null
  const intent = String(body.intent ?? 'plan')

  if (intent === 'plan') {
    const planned = await planAction(message, bid)
    if (!planned) {
      return NextResponse.json({ error: 'Could not plan this action. Try rephrasing.' }, { status: 400 })
    }
    if (conversationId) {
      await supabase.from('aria_conversations').update({
        pending_action: planned,
        pending_action_expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      }).eq('id', conversationId).eq('business_id', bid)
    }
    return NextResponse.json({ planned_action: planned, status: 'awaiting_confirmation' })
  }

  if (intent === 'confirm') {
    if (!conversationId) return NextResponse.json({ error: 'No conversation ID' }, { status: 400 })
    if (!isConfirmation(message)) {
      return NextResponse.json({ error: 'Confirmation not detected', status: 'not_confirmed' })
    }
    const { data: conv } = await supabase.from('aria_conversations')
      .select('pending_action,pending_action_expires_at')
      .eq('id', conversationId).eq('business_id', bid).maybeSingle()

    if (!conv?.pending_action) {
      return NextResponse.json({ error: 'No pending action found', status: 'no_pending_action' })
    }
    if (conv.pending_action_expires_at && new Date(String(conv.pending_action_expires_at)) < new Date()) {
      return NextResponse.json({ error: 'Action expired — please request it again', status: 'expired' })
    }

    const rawPending = conv.pending_action
    const parsedPending: PlannedAction = typeof rawPending === 'string'
      ? JSON.parse(rawPending) as PlannedAction
      : rawPending as PlannedAction
    const result = await executeAction(parsedPending, bid, userId, conversationId, message)

    await supabase.from('aria_conversations').update({
      pending_action: null,
      pending_action_expires_at: null,
    }).eq('id', conversationId)

    return NextResponse.json({ execution_result: result, status: result.ok ? 'executed' : 'failed' })
  }

  if (intent === 'cancel') {
    if (conversationId) {
      await supabase.from('aria_conversations').update({
        pending_action: null,
        pending_action_expires_at: null,
      }).eq('id', conversationId)
    }
    return NextResponse.json({ status: 'cancelled' })
  }

  return NextResponse.json({ error: 'Unknown intent' }, { status: 400 })
}

export const POST = withBusinessContext('aria/ask/action', _POST)
