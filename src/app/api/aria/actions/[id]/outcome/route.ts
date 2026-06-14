export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { adjustAdviceWeight } from '@/lib/aria/hypothesis/outcome-learning'

// PLAN-PERSISTENCE-1 (I5) Part 5 — Owner-provided outcome.
// The owner's explicit answer to "how did X go?" is the highest-signal outcome we can get. This
// records it on aria_outcomes (notes always; verdict ONLY when the owner gives an explicit
// worked=true/false — never parsed from free-text notes), overriding the cron's automatic 7d/30d
// verdict for that action, and feeds the verdict into advice weights.
async function _POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { worked?: boolean; notes?: string }
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null
  // Verdict comes ONLY from the explicit boolean — never inferred from notes text (DO-NOT).
  const verdict = typeof body.worked === 'boolean' ? (body.worked ? 'worked' : 'backfired') : null
  if (!notes && verdict === null) {
    return NextResponse.json({ error: 'Provide notes and/or worked:boolean' }, { status: 400 })
  }

  // Ownership: the action's business must belong to the caller.
  const { data: action } = await supabase
    .from('aria_actions')
    .select('id, business_id, title, category, updated_at, businesses!inner(user_id)')
    .eq('id', params.id)
    .eq('businesses.user_id', user.id)
    .maybeSingle()
  if (!action) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const a = action as Record<string, unknown>
  const businessId = String(a.business_id)
  const category = (a.category as string | null) ?? null
  const now = new Date().toISOString()

  // Find the most recent outcome row already tracking this action (admin client — RLS-safe write path).
  const { data: existing } = await supabaseAdmin
    .from('aria_outcomes')
    .select('id, acted_on_at, outcome_verdict')
    .eq('business_id', businessId)
    .eq('action_id', params.id)
    .order('recommended_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) {
    const e = existing as Record<string, unknown>
    const update: Record<string, unknown> = {}
    if (notes !== null) update.notes = notes
    if (!e.acted_on_at) update.acted_on_at = now
    update.acted_on = true
    if (verdict !== null) {
      update.outcome_verdict = verdict
      update.outcome_checked_at = now
    }
    const { error } = await supabaseAdmin.from('aria_outcomes').update(update).eq('id', e.id as string)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabaseAdmin.from('aria_outcomes').insert({
      business_id: businessId,
      action_id: params.id,
      recommendation_type: 'owner_reported',
      recommendation_detail: (a.title as string | null)?.slice(0, 1000) ?? null,
      recommended_at: (a.updated_at as string | null) ?? now,
      acted_on: true,
      acted_on_at: now,
      category,
      notes,
      ...(verdict !== null ? { outcome_verdict: verdict, outcome_checked_at: now } : {}),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Feed the owner's explicit verdict into the per-category advice weights (the learning loop).
  if (verdict !== null && category) {
    try { await adjustAdviceWeight(businessId, category, verdict) }
    catch (e) { console.error('[actions/outcome] adjustAdviceWeight failed:', (e as Error).message) }
  }

  return NextResponse.json({ ok: true, verdict, notes_saved: notes !== null })
}

export const POST = withErrorCapture('aria/actions/[id]/outcome', _POST)
