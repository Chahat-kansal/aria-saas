export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { awardPointsViaLedger } from '@/lib/loyalty/award-ledger'

async function _GET(_req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const { data } = await supabase.from('community_backfill_review_queue')
    .select('id, awards_pending, identity_count, created_at').eq('business_id', businessId).eq('status', 'pending').maybeSingle()
  return NextResponse.json({ pending: data ?? null })
}

// POST ?action=approve|reject — approve issues every proposed award using the EXACT snapshot
// captured when the proposal was queued (GROUNDING-TEETH: acts on real computed data, not a re-guess
// at approval time, which could differ if points changed in the interim). Same insert-first-then-
// issue idempotency as the daily cron path — safe even if approve is clicked twice.
async function _POST(req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const action = new URL(req.url).searchParams.get('action')
  if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })

  const { data: queued } = await supabase.from('community_backfill_review_queue')
    .select('id, proposal').eq('business_id', businessId).eq('status', 'pending').maybeSingle()
  if (!queued) return NextResponse.json({ error: 'No pending backfill proposal' }, { status: 404 })

  if (action === 'reject') {
    await supabase.from('community_backfill_review_queue').update({ status: 'rejected', resolved_at: new Date().toISOString() }).eq('id', queued.id)
    return NextResponse.json({ ok: true, issued: 0 })
  }

  const proposal = (queued.proposal ?? []) as Array<{ loyalty_identity_id: string; customer_id: string; level: number; snapshot_points: number; perk_reward_rule_id: string | null }>
  let issued = 0
  for (const p of proposal) {
    const { error: claimErr } = await supabaseAdmin.from('community_level_awards').insert({
      business_id: businessId, loyalty_identity_id: p.loyalty_identity_id, level: p.level, snapshot_points: p.snapshot_points, reward_rule_id: p.perk_reward_rule_id,
    })
    if (claimErr) continue // already issued since this proposal was queued — skip, never re-issue
    // Same semantics as the normal (non-backfill) path: the approved proposal is the real, already-
    // computed set of level-ups — issue exactly what it says, including any attached perk.
    if (p.perk_reward_rule_id) {
      try {
        const { data: rule } = await supabaseAdmin.from('loyalty_reward_rules').select('points_value').eq('id', p.perk_reward_rule_id).maybeSingle()
        const perkPoints = Math.max(0, Math.round(Number(rule?.points_value ?? 0)))
        if (perkPoints > 0) await awardPointsViaLedger(p.customer_id, businessId, perkPoints)
      } catch (e) {
        await supabaseAdmin.from('community_level_awards').update({ issue_error: String(e) })
          .eq('business_id', businessId).eq('loyalty_identity_id', p.loyalty_identity_id).eq('level', p.level)
      }
    }
    issued++
  }

  await supabase.from('community_backfill_review_queue').update({ status: 'approved', resolved_at: new Date().toISOString() }).eq('id', queued.id)
  return NextResponse.json({ ok: true, issued })
}

export const GET = withBusinessContext('dashboard/community/backfill-queue', _GET)
export const POST = withBusinessContext('dashboard/community/backfill-queue', _POST)
