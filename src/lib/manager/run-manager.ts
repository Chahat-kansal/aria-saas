import { supabaseAdmin } from '@/lib/supabase-admin'
import { computeHealthSignals } from '@/lib/aria/health-signals'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { safeBriefingContent, suppressUpbeatCloser } from '@/lib/aria/briefing-guard'
import { todayAEST } from '@/lib/date-au'
import { createDecision } from '@/lib/decisions/createDecision'
import { reviewProposal, type ProposalUnderReview, type RejectReason } from './review'
import { recordAutonomousAction } from './authority'
import type { Domain } from '@/lib/owner-app/decisions'

// MANAGER-AGENT-1 — the Store Manager loop: ASSIGN → REVIEW → CORRECT → CONSOLIDATE.
//
// The owner is the CEO. The domain agents do 100% of the labour. This layer assigns work to them,
// reviews what comes back, sends back what's wrong, and consolidates the survivors into ONE
// briefing. It does NO domain labour itself — every figure it reports comes from an agent's
// proposal or from ground truth, never from its own invention.
//
// ★ AUTHORITY: this loop cannot commit a marked action. Surviving proposals are routed through
// createDecision() (PH-1's gate, unedited) which files them as 'pending' for the owner's tap.
// Only invisible+reversible+free+unmarked actions go through recordAutonomousAction(), which
// itself throws on anything marked. There is no third path.

export interface ManagerRunResult {
  run_id: string
  business_id: string
  proposals_seen: number
  approved: number
  rejected: number
  rejections: Array<{ agent_type: string; title: string; reason_code: RejectReason; detail: string }>
  briefing_written: boolean
  autonomous_actions: number
}

interface AgentProposal extends ProposalUnderReview {
  domain: Domain
  kind: string
}

/**
 * REVIEW + CORRECT + CONSOLIDATE over a set of proposals the domain agents produced.
 *
 * ASSIGN note: triggering the agents themselves reuses the EXISTING orchestration (the h-dispatcher
 * crons and parallel-orchestrator already run the 14 BaseAgent subclasses on schedule) — this
 * function deliberately does not re-implement a runner. It is invoked with what those agents
 * proposed, which keeps the manager a review/consolidation layer rather than a second scheduler.
 */
export async function runManagerReview(
  business_id: string,
  proposals: AgentProposal[],
): Promise<ManagerRunResult> {
  const run_id = crypto.randomUUID()
  const result: ManagerRunResult = {
    run_id, business_id, proposals_seen: proposals.length,
    approved: 0, rejected: 0, rejections: [], briefing_written: false, autonomous_actions: 0,
  }

  // Ground truth for the review pass — the anchors an asserted figure must match, and the
  // dormant-vs-broken discriminator. Both are existing canonical sources, not new computation.
  const [health, snapshot] = await Promise.all([
    computeHealthSignals(business_id),
    getRevenueSnapshot(business_id, todayAEST()),
  ])
  const anchors = [
    ...health._anchor_numbers,
    snapshot.revenue, snapshot.transaction_count,
    ...proposals.map(p => (p.amount_cents ?? 0) / 100).filter(n => n > 0),
  ]

  const seenTitles = new Set<string>()
  const survivors: AgentProposal[] = []

  for (const p of proposals) {
    const verdict = reviewProposal(p, { health, anchors, seenTitles })

    if (verdict.verdict === 'rejected') {
      result.rejected++
      result.rejections.push({
        agent_type: p.agent_type, title: p.title,
        reason_code: verdict.reason_code!, detail: verdict.reason_detail ?? '',
      })
      // CORRECT — the rejected proposal is recorded with WHY and never reaches the owner raw.
      await supabaseAdmin.from('manager_reviews').insert({
        business_id, run_id, agent_type: p.agent_type, proposal_title: p.title,
        verdict: 'rejected', reason_code: verdict.reason_code, reason_detail: verdict.reason_detail,
      })
      continue
    }

    // APPROVED — routed through PH-1's gate. This is where the owner's authority is preserved:
    // the manager has done the labour, but the action sits 'pending' until the CEO taps it.
    const decisionId = await createDecision({
      business_id, domain: p.domain, kind: p.kind,
      title: p.title, subtitle: p.body,
      amount_cents: p.amount_cents ?? null,
      priority: p.priority ?? null,
      agent_type: p.agent_type,
      aria_reason: 'Reviewed and approved by the Store Manager from ' + p.agent_type + "'s proposal.",
      actor: 'aria',
    })

    result.approved++
    survivors.push(p)
    await supabaseAdmin.from('manager_reviews').insert({
      business_id, run_id, agent_type: p.agent_type, proposal_title: p.title,
      verdict: 'approved', decision_id: decisionId,
    })
  }

  // ── CONSOLIDATE — ONE briefing, written to the EXISTING canonical surface ────────────────────
  const content = buildBriefing({ survivors, result, health, snapshot })
  const { error: briefErr } = await supabaseAdmin.from('aria_daily_briefings').upsert({
    business_id,
    briefing_date: todayAEST(),
    content,
    source: 'manager',
    pipeline: 'parallel', // the canonical pipeline slot — repairs that surface, never a 2nd one
    generated_at: new Date().toISOString(),
    ground_truth: snapshot,
  }, { onConflict: 'business_id,briefing_date,pipeline' })
  result.briefing_written = !briefErr
  if (briefErr) console.error('[manager] briefing upsert failed:', briefErr.message)

  // ── The one thing the manager did entirely alone ─────────────────────────────────────────────
  // Writing its own review summary is invisible (internal record), reversible (a row), free, and
  // touches no customer/roster/money — the only class it may act on without the owner.
  try {
    await recordAutonomousAction(business_id, {
      action_kind: 'manager_review_pass',
      summary: 'Reviewed ' + result.proposals_seen + ' agent proposal(s): ' + result.approved +
        ' approved for your call, ' + result.rejected + ' sent back.',
      is_invisible: true, is_reversible: true, is_zero_cost: true, touches: [],
    }, run_id)
    result.autonomous_actions++
  } catch (e) {
    console.error('[manager] autonomy ledger refused the action (correct if it was marked):', (e as Error).message)
  }

  return result
}

/**
 * The consolidated owner narrative. GROUNDING-TEETH: every figure here comes from the real snapshot
 * or from a proposal that already passed review — the manager asserts nothing of its own. Where
 * there is no evidence, it SAYS so rather than filling the gap.
 */
function buildBriefing(args: {
  survivors: AgentProposal[]
  result: ManagerRunResult
  health: Awaited<ReturnType<typeof computeHealthSignals>>
  snapshot: Awaited<ReturnType<typeof getRevenueSnapshot>>
}): string {
  const { survivors, result, health, snapshot } = args
  const lines: string[] = []

  lines.push('Your team worked through ' + result.proposals_seen + ' item' + (result.proposals_seen === 1 ? '' : 's') + ' today.')

  // Honest data-confidence statement. INV-DECREMENT-VERIFY made the sale→movement path
  // correct-by-construction but coverage is UNDEFINED until real sales resume — so where there is
  // no post-fix evidence, the briefing says that instead of asserting a number.
  const dormant = health.pos_health.status === 'INSUFFICIENT_SAMPLE' || health.pos_health.completed_sales_7d === 0
  if (dormant) {
    lines.push(
      'No completed sales are recorded for this period, so there is nothing to read into today\'s trading — ' +
      'this is an absence of data, not a downturn.',
    )
  } else {
    lines.push('Today: $' + snapshot.revenue.toFixed(2) + ' across ' + snapshot.transaction_count + ' sale' +
      (snapshot.transaction_count === 1 ? '' : 's') + '.')
  }

  if (survivors.length > 0) {
    lines.push('')
    lines.push('Needs your call (' + survivors.length + '):')
    for (const s of survivors) lines.push('· ' + s.title)
    lines.push('Open Decisions to approve or decline each one.')
  } else {
    lines.push('')
    lines.push('Nothing needs your call right now.')
  }

  if (result.rejections.length > 0) {
    lines.push('')
    lines.push('Sent back to the team (' + result.rejections.length + ') — you did not need to see these:')
    for (const r of result.rejections) lines.push('· ' + r.agent_type + ': ' + r.detail)
  }

  // Route through the EXISTING guards — the manager is the layer that prevents the known briefing
  // failure classes, so its own output is held to them too (no scaffold leakage; no upbeat closer
  // sitting next to a real alert).
  const hasHighAlert = health.pos_health.status === 'DEGRADED'
  return safeBriefingContent(suppressUpbeatCloser(lines.join('\n'), hasHighAlert))
}
