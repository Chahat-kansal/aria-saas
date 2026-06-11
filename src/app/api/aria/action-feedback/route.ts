export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// POST — record founder feedback or a click-through event on an autopilot action.
// Body (explicit feedback):  { id: string, feedback: 'positive'|'negative', founder_note?: string }
// Body (click from briefing): { business_id: string, event: 'clicked', prompt?: string }
// Body (click on action):    { id: string, event: 'clicked', prompt?: string }
export async function POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    id?: string
    business_id?: string
    feedback?: 'positive' | 'negative'
    founder_note?: string
    event?: string
    prompt?: string
  }

  // ── Click event from briefing card (business_id, no action id) ──────────
  if (body.event === 'clicked' && body.business_id && !body.id) {
    // Verify user owns this business
    const { data: biz } = await supabaseAdmin
      .from('businesses').select('id')
      .eq('id', body.business_id).eq('user_id', user.id).maybeSingle()
    if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // Log briefing click to most recent council ai_call for this business
    const { data: latestCall } = await supabaseAdmin
      .from('aria_ai_calls').select('id')
      .eq('business_id', body.business_id)
      .in('agent_key', ['council_synthesis', 'council_growth'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latestCall) {
      await supabaseAdmin.from('aria_ai_calls')
        .update({ learning_signal: 'clicked' })
        .eq('id', (latestCall as { id: string }).id)
    }
    return NextResponse.json({ ok: true })
  }

  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Ownership check — the action must belong to a business this user owns
  const { data: action } = await supabaseAdmin
    .from('aria_autopilot_actions')
    .select('id, business_id, action_id, outcome_data')
    .eq('id', body.id)
    .maybeSingle()

  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const a = action as { id: string; business_id: string; action_id: string | null; outcome_data: Record<string, unknown> | null }

  const { data: biz } = await supabaseAdmin
    .from('businesses').select('id')
    .eq('id', a.business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (body.feedback === 'positive' || body.feedback === 'negative') {
    await supabaseAdmin.from('aria_autopilot_actions')
      .update({
        outcome: body.feedback,
        founder_feedback: (body.founder_note ?? '').slice(0, 500) || null,
      })
      .eq('id', body.id)

    if (a.action_id) {
      await supabaseAdmin.from('aria_actions')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('id', a.action_id).eq('business_id', a.business_id)
    }

    // Write learning_signal to most recent council ai_call
    const { data: latestCall } = await supabaseAdmin
      .from('aria_ai_calls').select('id')
      .eq('business_id', a.business_id)
      .in('agent_key', ['council_growth', 'council_risk', 'council_strategy', 'council_synthesis'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (latestCall) {
      await supabaseAdmin.from('aria_ai_calls')
        .update({ learning_signal: body.feedback })
        .eq('id', (latestCall as { id: string }).id)
    }

    return NextResponse.json({ ok: true, outcome: body.feedback })
  }

  if (body.event === 'clicked') {
    const existing = (a.outcome_data as Record<string, unknown> | null) ?? {}
    const clicks = Array.isArray(existing.clicks) ? existing.clicks as string[] : []
    clicks.push(new Date().toISOString())
    await supabaseAdmin.from('aria_autopilot_actions')
      .update({ outcome_data: { ...existing, clicks, last_clicked_prompt: (body.prompt ?? '').slice(0, 200) } })
      .eq('id', body.id)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'feedback or event required' }, { status: 400 })
}
