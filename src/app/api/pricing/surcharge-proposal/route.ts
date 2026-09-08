export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

import { NextResponse } from 'next/server'
import { withBusinessContext, type BusinessContext } from '@/lib/api/with-error-capture'
import { createDecision } from '@/lib/decisions/createDecision'
import { callModel } from '@/lib/ai/gateway'
import {
  buildPricingProposal, policyComparison,
  type RecoveryPolicy, type RoundingStyle,
} from '@/lib/aria/compute/surcharge-policy'
import type { ItemImpact } from '@/lib/aria/compute/item-card-impact'
import { SURCHARGE_BAN_FACTS } from '@/lib/aria/compute/card-cost'

/**
 * M14 PHASE 3 — THE PROPOSAL. IT PROPOSES AND IT DOES NOT PRICE.
 *
 * ⚠️ THIS ROUTE NEVER WRITES A PRICE. It writes ONE row into `aria_autopilot_actions` through
 * `createDecision` — the canonical propose path — carrying `action_type: 'bulk_price_update'`,
 * `domain: 'money'` and `status: 'pending'`. The price changes only when the owner approves through
 * `/api/owner/decisions`, which re-checks the role gate and demands a step-up token for a money
 * decision. `bulk_price_update` is `propose_only` in the capability registry, so a plan runner
 * cannot carry it out either.
 *
 * ⚠️ The reasoning sentence comes from `callModel` — the M13 gateway, the only door. A direct
 * Anthropic call here would fail the canon rail, and that would be correct.
 */

const POLICIES: RecoveryPolicy[] = ['recover_full', 'recover_half', 'absorb']
const ROUNDINGS: RoundingStyle[] = ['exact', 'nearest_5c', 'nearest_10c', 'nearest_50c']

async function _POST(req: Request, _ctx: unknown, { supabase, businessId }: BusinessContext) {
  const body = await req.json().catch(() => ({})) as {
    policy?: string; rounding?: string; window_days?: number; item_ids?: string[]
  }
  const policy = (POLICIES as string[]).includes(body.policy ?? '') ? body.policy as RecoveryPolicy : 'recover_full'
  const rounding = (ROUNDINGS as string[]).includes(body.rounding ?? '') ? body.rounding as RoundingStyle : 'nearest_10c'
  const windowDays = Math.min(Math.max(Number(body.window_days ?? 90), 1), 365)

  // ── the per-item picture, from the route that already builds it honestly ──────────────────────
  const origin = new URL(req.url).origin
  const impactRes = await fetch(origin + '/api/pricing/item-impact?days=' + windowDays, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })
  if (!impactRes.ok) {
    return NextResponse.json({ error: 'Could not read the per-item impact (' + impactRes.status + ').' }, { status: 502 })
  }
  const impact = await impactRes.json() as {
    ok: boolean; reason?: string
    summary?: { recovery_pct: number; recovery_tier: string; unknowns: string[]; cost_quality: unknown }
    items?: ItemImpact[]
  }
  if (!impact.ok || !impact.summary || !impact.items) {
    return NextResponse.json({ error: impact.reason ?? 'No per-item impact available.' }, { status: 200 })
  }

  const wanted = body.item_ids && body.item_ids.length > 0
    ? impact.items.filter(i => body.item_ids!.includes(i.id))
    : impact.items

  const built = buildPricingProposal({
    items: wanted,
    recovery_pct: impact.summary.recovery_pct,
    policy,
    rounding,
    window_days: windowDays,
  })
  if (!built.ok) {
    return NextResponse.json({ ok: false, reason: built.reason, provenance: built.provenance })
  }

  const changed = built.data.lines.filter(l => l.proposed_price !== l.current_price)

  // ⚠️ Nothing to propose is a real answer. A venue that does not surcharge loses nothing on 1
  // October, so there is no price to change — and creating an empty decision row would be noise
  // the owner has to dismiss.
  if (changed.length === 0) {
    return NextResponse.json({
      ok: true,
      created: false,
      reason: impact.summary.recovery_pct === 0
        ? 'You do not add a card fee today, so nothing is lost on 1 October and no price needs to move.'
        : 'The chosen policy does not move any price.',
      proposal: built.data,
      comparison: null,
      provenance: built.provenance,
    })
  }

  // ── the reasoning sentence, through the ONE door ──────────────────────────────────────────────
  const sample = changed.slice(0, 6).map(l => l.name + ' $' + l.current_price.toFixed(2) + ' → $' + l.proposed_price.toFixed(2)).join('; ')
  let reasoning = 'Recovering the card fee you will stop collecting on 1 October, at '
    + built.data.applied_pct + '% across ' + changed.length + ' items.'
  const ai = await callModel({
    businessId,
    agentKey: 'pricing',
    role: 'analysis',
    model: 'haiku',
    maxTokens: 220,
    temperature: 0.2,
    requestSummary: 'surcharge-ban price proposal reasoning',
    systemPrompt:
      'You write one short paragraph for an Australian cafe owner explaining a proposed price change. '
      + 'Rules: plain English, calm, no exclamation marks, no scare language. '
      + 'NEVER say surcharging becomes illegal — the Reserve Bank lifts its prohibition on the card '
      + 'networks\' no-surcharge rules and the networks are expected to forbid it under scheme rules. '
      + 'Do NOT invent any number. Use only the numbers given to you. Two sentences at most.',
    userPrompt:
      'Change date: ' + SURCHARGE_BAN_FACTS.effective + '. '
      + 'The venue currently recovers a card fee worth ' + impact.summary.recovery_pct + '% of takings. '
      + 'Policy chosen: ' + policy + ', applied as ' + built.data.applied_pct + '%. '
      + 'Items changing: ' + changed.length + '. Examples: ' + sample + '. '
      + 'Estimated effect over a year: ' + (built.data.total_revenue_effect == null ? 'unknown' : '$' + built.data.total_revenue_effect.toFixed(2)) + '.',
  })
  if (ai.ok && ai.raw.trim()) reasoning = ai.raw.trim()

  // ── ONE decision row. This is the only write, and it changes no price. ────────────────────────
  const decisionId = await createDecision({
    business_id: businessId,
    domain: 'money',
    kind: 'surcharge_ban_reprice',
    title: 'Reprice ' + changed.length + ' items before 1 October',
    subtitle: 'Card surcharging ends. ' + built.data.applied_pct + '% across ' + changed.length + ' items.',
    amount_cents: built.data.total_revenue_effect == null ? null : Math.round(built.data.total_revenue_effect * 100),
    action_type: 'bulk_price_update',
    requires_stepup: built.data.requires_stepup,
    aria_reason: reasoning,
    payload: {
      source: 'm14_surcharge_ban',
      policy,
      rounding,
      applied_pct: built.data.applied_pct,
      window_days: windowDays,
      // The executor's own vocabulary, so no new branch is needed in action-executor.ts.
      price_change_type: 'percentage',
      price_change_value: built.data.applied_pct,
      // Explicit per-item prices, so an owner editing one line does not have to trust the percent.
      lines: changed.map(l => ({
        product_id: l.id, name: l.name,
        from: l.current_price, to: l.proposed_price,
        rounding_drift: l.rounding_drift,
      })),
      total_rounding_drift: built.data.total_rounding_drift,
      unknowns: impact.summary.unknowns,
      rba_source: SURCHARGE_BAN_FACTS.source,
    },
  })

  if (!decisionId) {
    return NextResponse.json({ error: 'The proposal could not be recorded. Nothing was changed.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    created: true,
    decision_id: decisionId,
    requires_stepup: built.data.requires_stepup,
    stepup_reason: built.data.stepup_reason,
    reasoning,
    proposal: built.data,
    // The owner's choice, shown on their own best-selling item rather than an invented $5 coffee.
    comparison: policyComparison(changed[0].current_price, impact.summary.recovery_pct, rounding),
    provenance: built.provenance,
  })
}

export const POST = withBusinessContext('pricing/surcharge-proposal', _POST)
