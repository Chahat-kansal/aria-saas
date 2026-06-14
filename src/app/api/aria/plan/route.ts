export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { buildPlan } from '@/lib/aria/radar/plan-builder'
import { rollbackAction } from '@/lib/aria/ask/action-rollback'
import { onActionExecuted } from '@/lib/aria/hypothesis/outcome-learning'
import type { LossSignal } from '@/lib/aria/radar/loss-detector'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as Record<string, unknown>
  const { action, business_id, signal, aria_action_id, log_id } = body

  if (!business_id || !action) return NextResponse.json({ error: 'business_id and action required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses').select('id, name').eq('id', String(business_id)).eq('user_id', user.id).single()
  if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  // ── PREVIEW: build plan without saving ───────────────────────────────────
  if (action === 'preview') {
    if (!signal) return NextResponse.json({ error: 'signal required' }, { status: 400 })
    const plan = await buildPlan(String(business_id), signal as LossSignal)
    return NextResponse.json({ plan })
  }

  // ── SAVE: save plan to aria_actions as 'proposed' ─────────────────────────
  if (action === 'save') {
    if (!signal) return NextResponse.json({ error: 'signal required' }, { status: 400 })
    const plan = await buildPlan(String(business_id), signal as LossSignal)

    const categoryMap: Record<string, string> = {
      slow_period: 'revenue',
      margin_leak: 'pricing',
      lapsing_customers: 'customers',
      unanswered_reviews: 'reviews',
      profit_leak: 'revenue',
    }

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from('aria_actions')
      .insert({
        business_id: String(business_id),
        category: categoryMap[(signal as LossSignal).type] ?? 'revenue',
        title: plan.title,
        recommendation: plan.recommendation,
        status: 'proposed',
        source: 'morning_loss_radar',
        priority: 'medium',
        triggered_by: 'loss_radar',
        payload: plan.payload,
        expected_impact: ((signal as LossSignal).estimated_monthly_loss_aud || 0).toFixed(2),
      })
      .select('id')
      .single()

    if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })

    return NextResponse.json({ aria_action_id: saved.id, plan, saved: true })
  }

  // ── EXECUTE: execute and write audit log ─────────────────────────────────
  if (action === 'execute') {
    if (!signal) return NextResponse.json({ error: 'signal required' }, { status: 400 })
    const plan = await buildPlan(String(business_id), signal as LossSignal)

    if (plan.propose_only) {
      return NextResponse.json({ error: 'This action is propose-only and cannot be auto-executed.' }, { status: 400 })
    }

    let executionResult: { success: boolean; detail: string; rollback_data?: Record<string, unknown> } = { success: false, detail: '' }

    if (plan.action_type === 'winback_campaign') {
      executionResult = await executeWinbackCampaign(String(business_id), plan.payload, user.id)
    } else if (plan.action_type === 'draft_review_replies') {
      executionResult = await executeDraftReviewReplies(String(business_id), plan.payload)
    } else {
      return NextResponse.json({ error: 'Unknown executable action type: ' + plan.action_type }, { status: 400 })
    }

    if (!executionResult.success) {
      return NextResponse.json({ error: executionResult.detail }, { status: 500 })
    }

    // Update aria_action status if we have an ID
    if (aria_action_id) {
      await supabaseAdmin
        .from('aria_actions')
        .update({ status: 'executed', executed_at: new Date().toISOString(), executed_by_user_id: user.id })
        .eq('id', String(aria_action_id))
        .eq('business_id', String(business_id))
      // I4-VERIFY: this auto-execute path skips the 'approved' PATCH branch, so it was creating NO
      // linked outcome. Create it here at the terminal state (idempotent). Fire-and-forget.
      void onActionExecuted(String(aria_action_id), String(business_id))
        .catch((e) => console.error('[aria/plan] onActionExecuted failed:', (e as Error).message))
    }

    const sig = signal as LossSignal
    const { data: logEntry } = await supabaseAdmin
      .from('aria_action_log')
      .insert({
        business_id: String(business_id),
        action_type: plan.action_type,
        entity_type: sig.type,
        entity_ids: (sig.payload.customer_ids ?? sig.payload.review_ids ?? []) as string[],
        triggered_by: 'morning_loss_radar',
        message_excerpt: plan.title,
        executed_at: new Date().toISOString(),
        before_state: executionResult.rollback_data ?? {},
      })
      .select('id')
      .single()

    return NextResponse.json({
      success: true,
      detail: executionResult.detail,
      log_id: logEntry?.id ?? null,
      reversible: plan.reversible && Boolean(executionResult.rollback_data),
    })
  }

  // ── UNDO: rollback a log entry ────────────────────────────────────────────
  if (action === 'undo') {
    if (!log_id) return NextResponse.json({ error: 'log_id required' }, { status: 400 })
    const result = await rollbackAction(String(log_id), String(business_id), user.id)
    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Unknown action: ' + String(action) }, { status: 400 })
}

async function executeWinbackCampaign(
  businessId: string,
  payload: Record<string, unknown>,
  userId: string,
): Promise<{ success: boolean; detail: string; rollback_data?: Record<string, unknown> }> {
  const customerIds = (payload.customer_ids ?? []) as string[]
  const message = String(payload.message ?? 'We miss you! Come back this week for a special offer — just show this message.')

  if (customerIds.length === 0) return { success: false, detail: 'No customers to target' }

  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .insert({
      business_id: businessId,
      name: 'Loss Radar Winback — ' + new Date().toLocaleDateString('en-AU'),
      type: 'winback',
      channel: 'sms',
      target_type: 'list',
      message,
      status: 'draft',
      aria_generated: true,
      aria_rationale: 'Auto-drafted by Morning Loss Radar — ' + customerIds.length + ' lapsing customers',
      created_at: new Date().toISOString(),
      user_id: userId,
    })
    .select('id')
    .single()

  if (error) return { success: false, detail: error.message }

  return {
    success: true,
    detail: 'Winback campaign draft created for ' + customerIds.length + ' customer' + (customerIds.length !== 1 ? 's' : '') + '. Open Campaigns to review and send.',
    rollback_data: { campaign_id: (campaign as { id: string }).id, customer_ids: customerIds },
  }
}

async function executeDraftReviewReplies(
  businessId: string,
  payload: Record<string, unknown>,
): Promise<{ success: boolean; detail: string; rollback_data?: Record<string, unknown> }> {
  const reviews = (payload.reviews ?? []) as Array<{ id: string; rating: number; comment: string }>

  if (reviews.length === 0) return { success: false, detail: 'No reviews to draft replies for' }

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('name, industry')
    .eq('id', businessId)
    .maybeSingle()
  const bizName = (biz as { name?: string } | null)?.name ?? 'our business'

  const { runAriaModel } = await import('@/lib/aria/model-router')
  const updatedIds: string[] = []

  for (const review of reviews) {
    const result = await runAriaModel<{ reply: string }>({
      task: 'chat',
      systemPrompt: 'You are an Australian business owner replying to a Google review. Be empathetic, brief (2-3 sentences max), professional. Acknowledge the concern. Invite them back. No placeholders.',
      userPrompt: 'Business: ' + bizName + '\nRating: ' + review.rating + '/5\nReview: "' + review.comment + '"\n\nOutput JSON: { "reply": "..." }',
      maxTokens: 200,
    })

    const draft = result.data?.reply
    if (!draft) continue

    const { error } = await supabaseAdmin
      .from('google_reviews')
      .update({ ai_drafted_reply: draft })
      .eq('id', review.id)
      .eq('business_id', businessId)

    if (!error) updatedIds.push(review.id)
  }

  if (updatedIds.length === 0) return { success: false, detail: 'No review drafts could be saved' }

  return {
    success: true,
    detail: 'Draft replies created for ' + updatedIds.length + ' review' + (updatedIds.length !== 1 ? 's' : '') + '. Go to Reviews → each card will show the AI draft ready to publish.',
    rollback_data: { updated_review_ids: updatedIds },
  }
}

export const POST = withErrorCapture('aria/plan', _POST)
