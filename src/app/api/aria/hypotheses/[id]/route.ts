export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { waitUntil } from '@vercel/functions'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _PATCH(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { status?: string; rejection_reason?: string }
  const status = body.status
  if (!status || !['accepted', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'status must be accepted or rejected' }, { status: 400 })
  }

  const { data: hyp } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('id,business_id,title,description,category,predicted_impact_cents,predicted_impact_label,risk_level,confidence,evidence_summary')
    .eq('id', params.id)
    .maybeSingle()
  if (!hyp) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const h = hyp as Record<string, unknown>

  const { data: biz } = await supabaseAdmin
    .from('businesses')
    .select('user_id')
    .eq('id', h.business_id as string)
    .maybeSingle()
  if (!biz || (biz as Record<string, unknown>).user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date().toISOString()

  if (status === 'rejected') {
    await supabaseAdmin.from('aria_hypotheses').update({
      status: 'rejected',
      rejected_at: now,
      rejection_reason: body.rejection_reason?.slice(0, 500) ?? null,
    }).eq('id', params.id)
    return NextResponse.json({ ok: true })
  }

  // Accepted: create an aria_action linked to this hypothesis
  const { data: action } = await supabaseAdmin
    .from('aria_actions')
    .insert({
      business_id: h.business_id as string,
      title: (h.title as string).slice(0, 200),
      category: h.category as string | null,
      priority: h.risk_level === 'low' ? 'low' : h.risk_level === 'high' ? 'high' : 'medium',
      recommendation: h.description as string | null,
      reason: (h.evidence_summary as string | null) ?? '',
      expected_impact: (h.predicted_impact_label as string | null) ?? '',
      confidence: String(h.confidence ?? 0.6),
      status: 'approved',
      source: 'hypothesis_engine',
      payload: { hypothesis_id: params.id, predicted_impact_cents: h.predicted_impact_cents },
    })
    .select('id')
    .maybeSingle()

  await supabaseAdmin.from('aria_hypotheses').update({
    status: 'accepted',
    accepted_at: now,
    action_id: (action as Record<string, unknown> | null)?.id ?? null,
  }).eq('id', params.id)

  // Trigger outcome learning baseline snapshot (fire-and-forget)
  const actionId = (action as Record<string, unknown> | null)?.id as string | undefined
  if (actionId) {
    waitUntil((async () => {
      try {
        const { onActionApproved } = await import('@/lib/aria/hypothesis/outcome-learning')
        await onActionApproved(actionId, h.business_id as string)
      } catch { /* non-fatal */ }
    })())
  }

  return NextResponse.json({ ok: true, action_id: actionId ?? null })
}

export const PATCH = withErrorCapture('aria/hypotheses/[id]', _PATCH)
