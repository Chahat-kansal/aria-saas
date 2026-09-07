/**
 * THE PROPOSAL COUNCIL — named for its job, M13B phase 2. Was `lib/agents/council.ts`.
 *
 * Runs on a NIGHTLY CRON (`api/cron/council-session`), reads the business, and writes rows to
 * `agent_council_sessions` + `agent_council_proposals`. It PROPOSES; it never answers anyone.
 *
 * It is not the other council. `lib/aria/answer-council.ts` is triggered by an owner asking a
 * question and returns synthesised text. Both used to be called `council`, so
 * `import { … } from '@/lib/…/council'` read identically at every call site and meant two
 * completely different things. That is the whole reason for the rename — there is deliberately no
 * re-export shim, and `.eslintrc.json` blocks the old specifier so it cannot come back by muscle
 * memory.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart } from '@/lib/date-au'
import { callModel } from '@/lib/ai/gateway'
import type { AgentType, AgentDecision, AgentCouncilSession, AgentCouncilProposal } from './types'

// Explicit agent registry — maps each AgentType to its real class.
// (Previously a dynamic `./${agentType}-agent` import silently failed for every
// underscore-named agent because the files are hyphen-named, so 10 of 14 agents
// produced nothing. Static imports fix the names AND ensure the bundler includes them.)
import { ReorderAgent } from './reorder-agent'
import { PricingAgent } from './pricing-agent'
import { ScheduleAgent } from './schedule-agent'
import { MenuEngineeringAgent } from './menu-engineering-agent'
import { FlashRevenueAgent } from './flash-revenue-agent'
import { CLVAgent } from './clv-agent'
import { LabourOptimisationAgent } from './labour-optimisation-agent'
import { WasteEliminationAgent } from './waste-elimination-agent'
import { SupplierNegotiationAgent } from './supplier-negotiation-agent'
import { BasAgent } from './bas-agent'
import { ReputationDefenceAgent } from './reputation-defence-agent'
import { ReconciliationAgent } from './reconciliation-agent'
import { CustomerAcquisitionAgent } from './customer-acquisition-agent'
import { InventoryFinancingAgent } from './inventory-financing-agent'

type AgentCtor = { new(supabase: SupabaseClient): { run(bid: string): Promise<{ decisions: AgentDecision[] }> } }
const AGENT_REGISTRY: Record<string, AgentCtor> = {
  reorder: ReorderAgent as AgentCtor,
  pricing: PricingAgent as AgentCtor,
  schedule: ScheduleAgent as AgentCtor,
  menu_engineering: MenuEngineeringAgent as AgentCtor,
  flash_revenue: FlashRevenueAgent as AgentCtor,
  clv: CLVAgent as AgentCtor,
  labour_optimisation: LabourOptimisationAgent as AgentCtor,
  waste_elimination: WasteEliminationAgent as AgentCtor,
  supplier_negotiation: SupplierNegotiationAgent as AgentCtor,
  bas_compliance: BasAgent as AgentCtor,
  reputation_defence: ReputationDefenceAgent as AgentCtor,
  reconciliation: ReconciliationAgent as AgentCtor,
  customer_acquisition: CustomerAcquisitionAgent as AgentCtor,
  inventory_financing: InventoryFinancingAgent as AgentCtor,
}

const MODEL = 'claude-sonnet-4-5-20250929'

/**
 * M13C PHASE 1 — WHY AN AGENT DID NOT REPORT, AS A RECORD RATHER THAN A LOCAL VARIABLE.
 *
 * `agentErrors` was a `string[]` collected in the loop and dropped on return. Ninety-four nights of
 * failures went into it and nothing ever came out. This is the same information, typed, persisted
 * and returned.
 */
export type AgentFailureKind = 'not_registered' | 'timed_out' | 'threw'

export interface AgentFailure {
  agent_type: string
  kind: AgentFailureKind
  reason: string
}

/**
 * What the council can honestly say about its own run. Every number here is counted from the live
 * arrays in this function — none of it is a constant, and phase 3's narrative is built from it.
 */
export interface CouncilAgentHealth {
  agents_total: number
  agents_reported: number
  agents_failed: number
  agents_skipped_disabled: number
  failures: AgentFailure[]
  /**
   * M13C phase 2 — set when the proposal insert itself was REJECTED. Without this, N rejected
   * proposals and zero proposals are the same empty array, and the narrative would report a quiet
   * night for a night in which the council lost everything it produced.
   */
  proposal_persist_error: string | null
}

export interface CouncilSession {
  session: AgentCouncilSession
  proposals: AgentCouncilProposal[]
  plan_narrative: string
  projected_revenue_impact: number
  projected_cost_saving: number
  /** M13C phase 1 — returned, not just stored, so a caller can render it without a second query. */
  agent_health: CouncilAgentHealth
}

interface ConflictDescription {
  proposal_ids: string[]
  rule: string
  description: string
}

const ALL_AGENT_TYPES: AgentType[] = [
  'reorder', 'pricing', 'schedule',
  'menu_engineering', 'flash_revenue', 'clv', 'labour_optimisation',
  'waste_elimination', 'supplier_negotiation', 'bas_compliance',
  'reputation_defence', 'reconciliation', 'customer_acquisition', 'inventory_financing',
]

function mapActionTypeToProposalType(actionType: string): string {
  const map: Record<string, string> = {
    price_change: 'price_change',
    price_raise: 'price_change',
    price_lower: 'price_change',
    send_campaign: 'send_campaign',
    send_sms: 'send_campaign',
    send_email: 'send_campaign',
    create_reorder: 'create_reorder',
    reorder: 'create_reorder',
    purchase_order: 'create_reorder',
    run_promotion: 'run_promotion',
    promotion: 'run_promotion',
    adjust_roster: 'adjust_roster',
    roster_change: 'adjust_roster',
    send_offer: 'send_offer',
    offer: 'send_offer',
    markdown_product: 'markdown_product',
    markdown: 'markdown_product',
    hide_product: 'hide_product',
    hide: 'hide_product',
    create_bundle: 'create_bundle',
    bundle: 'create_bundle',
    send_review_request: 'send_review_request',
    review_request: 'send_review_request',
    update_menu_position: 'update_menu_position',
    menu_position: 'update_menu_position',
    labour_pct_alert: 'labour_pct_alert',
    labour_alert: 'labour_pct_alert',
  }
  return map[actionType] ?? 'send_campaign'
}

function getUrgency(impactDollars: number): 'critical' | 'high' | 'normal' | 'low' {
  if (impactDollars > 1000) return 'critical'
  if (impactDollars > 500) return 'high'
  if (impactDollars > 0) return 'normal'
  return 'low'
}

// I9 DEEP-REASONING: conflicts_with / synergises_with store the *proposal id* (uuid) of the
// conflicting/synergising proposal — a precise reference, not the ambiguous agent_type string
// (an agent can emit several proposals). Display/planner surfaces resolve id → agent_type for
// readability (see runCouncilSession grouped context + dashboard agents page). The one exception
// is the RULE_2 reorder→inventory_financing hint, which points at an agent that did NOT propose
// today, so there is no proposal id to reference — that entry stays the agent_type string.
function detectConflicts(proposals: AgentCouncilProposal[]): ConflictDescription[] {
  const conflicts: ConflictDescription[] = []

  // RULE 1: pricing_raise + discount on same product
  const priceChanges = proposals.filter(p => p.proposal_type === 'price_change' &&
    (p.proposal_data.new_price as number) > (p.proposal_data.current_price as number))
  const discounts = proposals.filter(p => p.proposal_type === 'run_promotion' || p.proposal_type === 'markdown_product')
  for (const pc of priceChanges) {
    for (const d of discounts) {
      const pcProductId = String(pc.proposal_data.product_id ?? '')
      const dProductId = String(d.proposal_data.product_id ?? '')
      if (pcProductId && dProductId && pcProductId === dProductId) {
        conflicts.push({
          proposal_ids: [pc.id, d.id],
          rule: 'RULE_1',
          description: 'Pricing agent raises price while flash revenue agent runs discount on same product',
        })
        pc.conflicts_with = [...(pc.conflicts_with ?? []), d.id]
        d.conflicts_with = [...(d.conflicts_with ?? []), pc.id]
      }
    }
  }

  // RULE 2: large_reorder + low_cash_runway
  const largeReorders = proposals.filter(p =>
    p.proposal_type === 'create_reorder' && Number(p.proposal_data.total_cost ?? 0) > 1000)
  const invFinancing = proposals.filter(p => p.agent_type === 'inventory_financing')
  for (const r of largeReorders) {
    const totalCost = Number(r.proposal_data.total_cost ?? 0)
    r.urgency = 'critical'
    if (invFinancing.length === 0) {
      r.synergises_with = [...(r.synergises_with ?? []), 'inventory_financing']
    }
    conflicts.push({
      proposal_ids: [r.id],
      rule: 'RULE_2',
      description: 'Large reorder ($' + totalCost + ') — verify cash runway before executing',
    })
  }

  // RULE 3: menu_deprioritise + waste_promote on same product
  const menuHide = proposals.filter(p =>
    p.proposal_type === 'hide_product' || p.proposal_type === 'update_menu_position')
  const wastePromote = proposals.filter(p => p.agent_type === 'waste_elimination')
  for (const mh of menuHide) {
    for (const wp of wastePromote) {
      const mhProductId = String(mh.proposal_data.product_id ?? '')
      const wpProductId = String(wp.proposal_data.product_id ?? '')
      if (mhProductId && wpProductId && mhProductId === wpProductId) {
        conflicts.push({
          proposal_ids: [mh.id, wp.id],
          rule: 'RULE_3',
          description: 'Menu agent wants to deprioritise product while waste agent wants to promote it',
        })
        mh.conflicts_with = [...(mh.conflicts_with ?? []), wp.id]
        wp.conflicts_with = [...(wp.conflicts_with ?? []), mh.id]
      }
    }
  }

  // RULE 4: CLV + flash revenue targeting same segment → synergy
  const clvCampaigns = proposals.filter(p => p.agent_type === 'clv' && p.proposal_type === 'send_campaign')
  const flashCampaigns = proposals.filter(p => p.agent_type === 'flash_revenue' && p.proposal_type === 'send_campaign')
  for (const c of clvCampaigns) {
    for (const f of flashCampaigns) {
      const cSeg = String(c.proposal_data.segment ?? c.proposal_data.customer_segment ?? '')
      const fSeg = String(f.proposal_data.segment ?? f.proposal_data.customer_segment ?? '')
      if (cSeg && fSeg && cSeg === fSeg) {
        c.synergises_with = [...(c.synergises_with ?? []), f.id]
        f.synergises_with = [...(f.synergises_with ?? []), c.id]
        conflicts.push({
          proposal_ids: [c.id, f.id],
          rule: 'RULE_4',
          description: 'CLV and Flash Revenue both target ' + cSeg + ' — merge into one coordinated outreach',
        })
      }
    }
  }

  // RULE 5: labour_pct_alert + add_staff from schedule
  const labourAlerts = proposals.filter(p => p.proposal_type === 'labour_pct_alert')
  const addStaff = proposals.filter(p => p.agent_type === 'schedule' && p.proposal_type === 'adjust_roster')
  if (labourAlerts.length > 0 && addStaff.length > 0) {
    for (const la of labourAlerts) {
      for (const as_ of addStaff) {
        conflicts.push({
          proposal_ids: [la.id, as_.id],
          rule: 'RULE_5',
          description: 'Labour agent says labour % too high but schedule agent wants to add a shift',
        })
        la.conflicts_with = [...(la.conflicts_with ?? []), as_.id]
        as_.conflicts_with = [...(as_.conflicts_with ?? []), la.id]
      }
    }
  }

  return conflicts
}

/**
 * Reads `agent_health` back off a stored session `plan`. Returns an UNKNOWN-shaped block for the 96
 * historical sessions that predate this field rather than a confident zero — a session that never
 * recorded its agents did not run zero agents, it ran an unknown number, and rendering that as 0 is
 * the same fabrication the narrative is being fixed for.
 */
export function readStoredAgentHealth(plan: unknown): CouncilAgentHealth {
  const h = (plan as { agent_health?: Partial<CouncilAgentHealth> } | null)?.agent_health
  if (!h || typeof h.agents_total !== 'number') {
    return { agents_total: -1, agents_reported: -1, agents_failed: -1, agents_skipped_disabled: -1, failures: [], proposal_persist_error: null }
  }
  return {
    agents_total: h.agents_total,
    agents_reported: h.agents_reported ?? -1,
    agents_failed: h.agents_failed ?? -1,
    agents_skipped_disabled: h.agents_skipped_disabled ?? 0,
    failures: Array.isArray(h.failures) ? h.failures : [],
    proposal_persist_error: typeof h.proposal_persist_error === 'string' ? h.proposal_persist_error : null,
  }
}

/**
 * What kind of failure this was. `Promise.race` rejects with the literal message 'timeout' when the
 * 25-second guard fires, and a timeout is a materially different fact from a crash: one says the
 * agent is too slow for the window it is given, the other says it is broken. Reported as one
 * category, they would stay indistinguishable — which is how this feature got here.
 */
export function classifyAgentFailure(err: unknown): AgentFailureKind {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return msg === 'timeout' ? 'timed_out' : 'threw'
}

/** The council's own account of its run. Counted, never assumed. */
export function summariseAgentHealth(params: {
  total: number
  reported: string[]
  skipped: string[]
  failures: AgentFailure[]
  proposalPersistError?: string | null
}): CouncilAgentHealth {
  return {
    agents_total: params.total,
    agents_reported: params.reported.length,
    agents_failed: params.failures.length,
    agents_skipped_disabled: params.skipped.length,
    failures: params.failures,
    proposal_persist_error: params.proposalPersistError ?? null,
  }
}

/**
 * M13C PHASE 3 — THE SENTENCE THE OWNER READS.
 *
 * ── WHAT IT SAID FOR 94 MORNINGS ───────────────────────────────────────────────────────────────
 *     proposals.length === 0
 *       ? 'No agent proposals today — all systems are in steady state.'
 *       : 'Aria reviewed N proposals and approved the highest-impact actions for today.'
 *
 * Two branches for at least five different nights. **Zero proposals and a healthy business rendered
 * identically**, so total agent failure and genuine calm produced the same reassuring sentence. 96
 * of 97 sessions said steady state; the council has produced 2 proposals in its entire life.
 *
 * ── WHAT SEPARATES THEM NOW ────────────────────────────────────────────────────────────────────
 *   proposed          agents ran and produced something.
 *   quiet             agents ran, all of them, and found nothing. THE ONLY CASE THAT IS CALM.
 *   incomplete        some agents did not report. Not a quiet night — an unfinished check.
 *   nothing_ran       none reported. A fault, stated as one.
 *   lost              proposals were produced and the insert was REJECTED. The worst case, and the
 *                     one that previously looked exactly like calm.
 *   unknown           the session did not record its agents. Says so, and invents no counts.
 *
 * ⚠️ EVERY NUMBER COMES FROM THE HEALTH BLOCK, WHICH IS COUNTED FROM THE LIVE ARRAYS. There is no
 * constant "14" in this function — `agents_total` is `ALL_AGENT_TYPES.length` at the time of the
 * run, so adding a fifteenth agent changes the sentence without anyone editing it.
 *
 * ⚠️ AND IT REFUSES TO GUESS. `readStoredAgentHealth` returns -1 for the 96 historical sessions that
 * predate the health block. Rendering those as "0 of 0 agents checked" would be exactly the
 * fabrication this function exists to remove, so -1 produces the `unknown` sentence instead.
 * GROUNDING-TEETH: an honest "I did not record that" beats a plausible number.
 */
export type CouncilNarrativeCase =
  | 'proposed' | 'quiet' | 'incomplete' | 'nothing_ran' | 'lost' | 'unknown'

export interface CouncilNarrative {
  case: CouncilNarrativeCase
  text: string
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

export function buildCouncilNarrative(health: CouncilAgentHealth, proposalsCount: number): CouncilNarrative {
  const { agents_total: total, agents_reported: reported, agents_failed: failed,
          agents_skipped_disabled: skipped, proposal_persist_error: lostErr } = health

  // The council produced work and could not save it. Said first, because it is the only case where
  // the owner is missing something that actually existed.
  if (lostErr) {
    return {
      case: 'lost',
      text: 'Overnight checks produced recommendations but they could not be saved, so there is '
        + 'nothing to show you. This is a fault on my side, not a quiet night — it has been logged.',
    }
  }

  // No health was recorded. Do not invent a count for it.
  if (total < 0 || reported < 0) {
    return {
      case: 'unknown',
      text: proposalsCount > 0
        ? 'Reviewed ' + proposalsCount + ' ' + plural(proposalsCount, 'recommendation', 'recommendations')
          + ' from overnight checks. This session did not record which checks ran.'
        : 'This session did not record which overnight checks ran, so I cannot tell you whether '
          + 'nothing needed doing or nothing reported.',
    }
  }

  const expected = total - skipped
  const off = skipped > 0 ? ' (' + skipped + ' ' + plural(skipped, 'is', 'are') + ' switched off)' : ''

  if (reported === 0 && expected > 0) {
    return {
      case: 'nothing_ran',
      text: 'None of the ' + expected + ' overnight ' + plural(expected, 'check', 'checks') + ' reported back'
        + off + ', so I have nothing to tell you about last night. That is a fault, not a quiet night '
        + '— it has been logged and I will flag it again if it repeats.',
    }
  }

  const incomplete = failed > 0
  const ran = reported + ' of ' + expected + ' overnight ' + plural(expected, 'check', 'checks')

  if (proposalsCount > 0) {
    return {
      case: incomplete ? 'incomplete' : 'proposed',
      text: 'Reviewed ' + proposalsCount + ' ' + plural(proposalsCount, 'recommendation', 'recommendations')
        + ' and approved the highest-impact actions for today.'
        + (incomplete
            ? ' ' + failed + ' of ' + expected + ' ' + plural(failed, 'check', 'checks')
              + ' did not report, so this is not the full picture — I have logged that.'
            : ''),
    }
  }

  if (incomplete) {
    return {
      case: 'incomplete',
      text: ran + ' reported' + off + '. The other ' + failed + ' did not, so last night\'s check is '
        + 'incomplete — I have logged it and will flag it again if it repeats. Nothing in what did '
        + 'report needs you today.',
    }
  }

  return {
    case: 'quiet',
    text: 'All ' + expected + ' overnight ' + plural(expected, 'check', 'checks') + ' reported' + off
      + ' and nothing needs you today.',
  }
}

export async function runCouncilSession(business_id: string): Promise<CouncilSession> {
  const today = new Date().toISOString().split('T')[0]

  // STEP 1: GET OR CREATE TODAY'S SESSION
  const { data: existing, error: existingErr } = await supabaseAdmin
    .from('agent_council_sessions')
    .select('*')
    .eq('business_id', business_id)
    .eq('session_date', today)
    .maybeSingle()
  // A failed lookup here reads as "no session today" and starts a duplicate one. Non-fatal — the
  // upsert below is idempotent on (business_id, session_date) — but never silent again.
  if (existingErr) console.error('[council] session lookup failed:', existingErr.message)

  if (existing?.status === 'complete') {
    const { data: existingProposals, error: existingProposalsErr } = await supabaseAdmin
      .from('agent_council_proposals')
      .select('*')
      .eq('session_id', existing.id)
    if (existingProposalsErr) console.error('[council] replay proposal read failed:', existingProposalsErr.message)
    return {
      session: existing as AgentCouncilSession,
      proposals: (existingProposals ?? []) as AgentCouncilProposal[],
      plan_narrative: existing.plan_narrative ?? '',
      projected_revenue_impact: Number(existing.projected_revenue_impact ?? 0),
      projected_cost_saving: Number(existing.projected_cost_saving ?? 0),
      // Replayed from the stored plan rather than recomputed — this branch ran no agents today, and
      // claiming a fresh 14-of-14 here would be inventing a run that did not happen.
      agent_health: readStoredAgentHealth(existing.plan),
    }
  }

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('agent_council_sessions')
    .upsert({ business_id, session_date: today, status: 'running' }, { onConflict: 'business_id,session_date' })
    .select()
    .single()

  if (sessionErr || !session) {
    throw new Error('Failed to create council session: ' + (sessionErr?.message ?? 'unknown'))
  }

  // STEP 2: GET OWNER PRIORITY
  const { data: settingsRow, error: settingsErr } = await supabaseAdmin
    .from('agent_settings')
    .select('config, mode')
    .eq('business_id', business_id)
    .eq('agent_type', 'council')
    .maybeSingle()
  // A failed read silently falls back to 'balanced'/'suggest' — which is the safe default, but the
  // owner's actual choice being unreadable is worth knowing about.
  if (settingsErr) console.error('[council] council settings read failed, using defaults:', settingsErr.message)
  const priority = (settingsRow?.config as Record<string,unknown> | null)?.priority as string ?? 'balanced'
  const mode = (settingsRow?.mode as string | null) ?? 'suggest'

  // STEP 3: RUN ALL ENABLED AGENTS IN PARALLEL
  const agentPhaseStart = Date.now()
  const agentDecisions: AgentDecision[] = []
  // M13C PHASE 1 — WAS `const agentErrors: string[] = []`, pushed to at two sites and READ AT
  // NEITHER. Every agent failure for 94 nights went in here and was discarded when the function
  // returned: not logged, not stored, not returned. That single unread array is why "12 of 14
  // agents did not report" was unanswerable from production.
  const agentFailures: AgentFailure[] = []
  const agentsReported: string[] = []
  const agentsSkipped: string[] = []

  await Promise.allSettled(
    ALL_AGENT_TYPES.map(async (agentType) => {
      try {
        const { data: agentSettings, error: agentSettingsErr } = await supabaseAdmin
          .from('agent_settings')
          .select('enabled')
          .eq('business_id', business_id)
          .eq('agent_type', agentType)
          .maybeSingle()

        // ⚠️ A failed read here defaults the agent to ENABLED, so a broken settings query silently
        // runs an agent the owner switched off. Recorded as a failure rather than swallowed.
        if (agentSettingsErr) {
          agentFailures.push({ agent_type: agentType, kind: 'threw', reason: 'settings read failed: ' + agentSettingsErr.message.slice(0, 200) })
          return
        }
        if (agentSettings?.enabled === false) { agentsSkipped.push(agentType); return }

        // Resolve agent from the explicit registry (no fragile string transforms).
        const AgentClass = AGENT_REGISTRY[agentType] ?? null
        if (!AgentClass) {
          agentFailures.push({ agent_type: agentType, kind: 'not_registered', reason: 'no class in AGENT_REGISTRY' })
          return
        }

        const result = await Promise.race([
          // M13D phase 3 — THE SERVICE-ROLE CLIENT, PASSED EXPLICITLY. This is the line that has
          // been silently unauthorised since 4 June: the agent built its own anon cookie client, a
          // cron has no cookies, and RLS rejected every decision and run-log it tried to write.
          // The council already holds supabaseAdmin and is a cron-only path, so it is entitled to
          // pass one — and phase 3's guard checks that nothing outside a cron does.
          new AgentClass(supabaseAdmin).run(business_id),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
        ])
        if (result && 'decisions' in result) {
          agentDecisions.push(...result.decisions)
          agentsReported.push(agentType)
        } else {
          // Reached the end of run() and returned nothing recognisable. Not an exception, and not a
          // report either — which is exactly the state that used to be indistinguishable from calm.
          agentFailures.push({ agent_type: agentType, kind: 'threw', reason: 'run() resolved without a decisions array' })
        }
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e)
        agentFailures.push({
          agent_type: agentType,
          kind: classifyAgentFailure(e),
          reason: msg.slice(0, 300),
        })
      }
    })
  )

  // ── M13C PHASE 1 · STEP 3b: THE FAILURES BECOME A RECORD ──────────────────────────────────────
  //
  // ⚠️ WHERE THIS GOES, AND WHY NOT WHERE THE SPRINT SAID.
  //
  // The sprint asked for `business_events` as the interim home. IT CANNOT BE: `business_events` has
  // a CHECK constraint of `entity_type IN ('decision','job')` and `event_type IN ('proposed',
  // 'approved','declined','expired','job_created','job_completed','job_failed')`. An
  // `entity_type='council_session'` row is REJECTED WITH SQLSTATE 23514 — proven against production
  // inside a rolled-back DO block, not inferred. Writing there would have reproduced the exact
  // silent-rejection failure this sprint exists to end.
  //
  // `agent_runs` is the right home and already exists: one row per agent run, with an `errors` jsonb
  // column built for precisely this. The same probe confirmed both shapes ACCEPTED.
  //
  // ⚠️ AND IT IS WRITTEN WITH supabaseAdmin, WHICH IS THE WHOLE POINT — see the parked finding in
  // RUN-M13C.md. `BaseAgent` writes its own `agent_runs` row through the ANON, cookie-based client,
  // which under RLS in a cron writes nothing. The council holds a service-role client, so it can
  // record on the agents' behalf without changing anyone's authorisation.
  if (agentFailures.length > 0) {
    const failureRows = agentFailures.map(f => ({
      business_id,
      agent_type: f.agent_type,
      started_at: new Date(agentPhaseStart).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - agentPhaseStart,
      decisions_count: 0,
      errors: [f.kind + ': ' + f.reason],
      triggered_by: 'council',
    }))
    const { error: runsErr } = await supabaseAdmin.from('agent_runs').insert(failureRows)
    // W6. The record of a failure that fails to record is the failure this sprint is about.
    if (runsErr) console.error('[council] agent_runs failure rows REJECTED:', runsErr.message, '— agents:', agentFailures.map(f => f.agent_type).join(','))
  }

  // STEP 4: CONVERT DECISIONS TO PROPOSALS
  const proposalRows = agentDecisions.map(d => ({
    session_id: session.id,
    business_id,
    agent_type: d.agent_type,
    proposal_type: mapActionTypeToProposalType(String(d.decision_data.action_type ?? '')),
    proposal_data: d.decision_data,
    projected_impact_dollars: d.projected_impact_cents / 100,
    confidence: d.confidence_score,
    urgency: getUrgency(d.projected_impact_cents / 100),
    conflicts_with: null as string[] | null,
    synergises_with: null as string[] | null,
  }))

  // M13C PHASE 2 — W6 ON THE PROPOSAL INSERT. It discarded its error, so a REJECTED insert and a
  // genuinely empty night produced the identical empty array, and the narrative called both steady
  // state. Now the rejection is carried into the health block and said out loud by phase 3.
  //
  // Not thrown: the session is still worth completing and the chair still has something to say
  // about what the agents found. What must never happen is reporting the night as quiet.
  let proposalPersistError: string | null = null
  const { data: insertedProposals, error: proposalInsertErr } = await supabaseAdmin
    .from('agent_council_proposals')
    .insert(proposalRows)
    .select()
  if (proposalInsertErr) {
    proposalPersistError = proposalInsertErr.message.slice(0, 300)
    console.error('[council] agent_council_proposals insert REJECTED —', proposalRows.length, 'proposals lost:', proposalInsertErr.message)
  }

  const proposals = (insertedProposals ?? []) as AgentCouncilProposal[]

  // Built HERE, after the insert, so it carries whether the proposals actually landed. Built before
  // it, the block could only ever say `proposal_persist_error: null` — a health report that cannot
  // express the failure it is meant to report is the shape this whole sprint is about.
  const agentHealth = summariseAgentHealth({
    total: ALL_AGENT_TYPES.length,
    reported: agentsReported,
    skipped: agentsSkipped,
    failures: agentFailures,
    proposalPersistError,
  })

  // STEP 5: CONFLICT DETECTION
  const conflicts = detectConflicts(proposals)

  // Persist conflict updates
  for (const p of proposals) {
    if ((p.conflicts_with && p.conflicts_with.length > 0) ||
        (p.synergises_with && p.synergises_with.length > 0) ||
        p.urgency === 'critical') {
      await supabaseAdmin
        .from('agent_council_proposals')
        .update({
          conflicts_with: p.conflicts_with,
          synergises_with: p.synergises_with,
          urgency: p.urgency,
        })
        .eq('id', p.id)
    }
  }

  // STEP 6: FETCH BUSINESS SNAPSHOT + CALL SONNET
  const todayStart = new Date(toAESTStart(todayAEST())) // TZ-1: true AEST-midnight instant
  const yesterday = new Date(todayStart); yesterday.setDate(yesterday.getDate() - 1)
  const [todaySalesRes, yestSalesRes, cashRes, agentPerfRes] = await Promise.all([
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', business_id).gte('created_at', todayStart.toISOString()).neq('status', 'voided'),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', business_id).gte('created_at', yesterday.toISOString()).lt('created_at', todayStart.toISOString()).neq('status', 'voided'),
    supabaseAdmin.from('cash_flow_forecasts').select('ending_balance').eq('business_id', business_id).order('forecast_date', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('agent_decisions').select('agent_type, outcome').eq('business_id', business_id).eq('status', 'auto_executed').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
  ])

  const todayRev = (todaySalesRes.data ?? []).reduce((s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0)
  const yesterdayRev = (yestSalesRes.data ?? []).reduce((s: number, r: { total_amount: number | null }) => s + Number(r.total_amount ?? 0), 0)
  const cashEstimate = Number((cashRes.data as { ending_balance?: number } | null)?.ending_balance ?? 0)

  const agentPerf: Record<string, number> = {}
  for (const d of (agentPerfRes.data ?? []) as Array<{ agent_type: string; outcome: unknown }>) {
    agentPerf[d.agent_type] = (agentPerf[d.agent_type] ?? 0) + 1
  }

  // conflicts_with now holds proposal ids — resolve them to agent_type names so the planner
  // reads "pricing", not an opaque uuid (the readable conflict descriptions also flow in below).
  const idToAgentType = new Map(proposals.map(p => [p.id, p.agent_type]))
  const grouped: Record<string, unknown[]> = {}
  for (const p of proposals) {
    if (!grouped[p.agent_type]) grouped[p.agent_type] = []
    grouped[p.agent_type].push({
      id: p.id,
      type: p.proposal_type,
      data: p.proposal_data,
      impact_dollars: p.projected_impact_dollars,
      confidence: p.confidence,
      urgency: p.urgency,
      conflicts: (p.conflicts_with ?? []).map(ref => idToAgentType.get(ref) ?? ref),
    })
  }

  const councilContext = {
    business_id,
    session_date: today,
    owner_priority: priority,
    today_revenue_so_far: todayRev,
    yesterday_revenue: yesterdayRev,
    current_cash_estimate: cashEstimate,
    proposals: grouped,
    conflicts: conflicts.map(c => c.description),
    agent_performance: agentPerf,
  }

  let planResult: {
    decisions: Array<{ proposal_id: string; decision: string; reasoning: string; modified_data?: Record<string, unknown> }>
    plan_narrative: string
    projected_revenue_impact: number
    projected_cost_saving: number
    priority_focus: string
    conflicts_resolved: string[]
  } = {
    decisions: [],
    // M13C phase 3 — WAS a two-branch ternary in which zero proposals rendered as
    // "all systems are in steady state", so 94 nights of total agent failure read as calm.
    // Six cases now, every count taken from the health block rather than assumed.
    plan_narrative: buildCouncilNarrative(agentHealth, proposals.length).text,
    projected_revenue_impact: proposals.reduce((s, p) => s + p.projected_impact_dollars, 0),
    projected_cost_saving: 0,
    priority_focus: priority,
    conflicts_resolved: [],
  }

  if (proposals.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      // M13 PHASE 5 — THROUGH THE GATEWAY. This file constructed its own Anthropic client and did
      // its own cost logging via trackAICall; both are gone. Same model (MODEL is the sonnet id and
      // 'sonnet' is what the provider maps it from), same system prompt, same single user message,
      // same 2,000-token ceiling. What changes is that the call now lands in aria_ai_calls once, at
      // the boundary, with provider/model/tokens/latency/cost/outcome — instead of whatever this
      // call site remembered to record.
      //
      // trackAICall is removed IN THE SAME EDIT rather than left alongside, so the cost is counted
      // once and not twice. That is the brief's rule and it is the whole reason a gateway is worth
      // having: one place that knows what a call cost.
      const res = await callModel<Record<string, unknown>>(
        {
          businessId: business_id,
          agentKey: 'agents_council',
          role: 'analysis',
          model: 'sonnet',
          maxTokens: 2000,
          systemPrompt: 'You are the Aria Revenue Council chair for an Australian small business. Your role is to evaluate all agent proposals for today and produce a single coordinated action plan that maximises ' + priority + ' without agents working against each other. Be specific. Reference actual $ amounts and product names from the proposals. Resolve conflicts by choosing the higher-impact option that aligns with the owner\'s priority. Respond with valid JSON only, no markdown fences.',
          userPrompt: JSON.stringify(councilContext),
          requestSummary: 'council plan: ' + priority,
        },
        {},
      )
      const parsed = res.data
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
        planResult = { ...planResult, ...parsed }
      }
    } catch (e) {
      console.warn('[council] chair call failed:', (e as Error).message)
    }
  }

  // STEP 7: UPDATE PROPOSALS WITH COUNCIL DECISIONS
  for (const dec of planResult.decisions) {
    await supabaseAdmin
      .from('agent_council_proposals')
      .update({
        council_decision: dec.decision,
        council_reasoning: dec.reasoning,
        modified_proposal_data: dec.modified_data ?? null,
      })
      .eq('id', dec.proposal_id)
  }

  // STEP 8: UPDATE SESSION
  const { data: completedSession, error: completeErr } = await supabaseAdmin
    .from('agent_council_sessions')
    .update({
      // M13C phase 1 — `agent_health` rides in the `plan` jsonb because agent_council_sessions has
      // no metadata/errors column and DDL is not mine to write. The dedicated column is proposed and
      // PARKED in RUN-M13C.md; `plan` is written on every run including the zero-proposal ones, so
      // nothing is lost in the meantime and the session row answers "what happened" on its own.
      plan: { ...(planResult as unknown as Record<string, unknown>), agent_health: agentHealth },
      plan_narrative: planResult.plan_narrative,
      projected_revenue_impact: planResult.projected_revenue_impact,
      projected_cost_saving: planResult.projected_cost_saving,
      proposals_count: proposals.length,
      conflicts_detected: conflicts.length,
      owner_priority: priority as 'growth' | 'margin' | 'retention' | 'balanced',
      status: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', session.id)
    .select()
    .single()
  // ⚠️ THE MOST IMPORTANT ONE IN THIS FILE. This update is what marks the session complete and
  // stores the narrative and the health block. Discarded, a rejection meant the session stayed
  // 'running' for ever while the function returned as though the night had gone fine — reporting
  // success for work that was not saved.
  if (completeErr) console.error('[council] SESSION COMPLETION UPDATE REJECTED — narrative and agent_health NOT saved:', completeErr.message)

  // STEP 9: EXECUTE APPROVED PROPOSALS (if mode='auto')
  let executedActions = 0
  if (mode === 'auto') {
    const { executeProposal } = await import('./council-executor')
    const approved = proposals.filter(p => p.council_decision === 'approved' || p.council_decision === 'modified')
    for (const p of approved) {
      try {
        const result = await executeProposal(p, supabaseAdmin)
        await supabaseAdmin
          .from('agent_council_proposals')
          .update({ executed_at: new Date().toISOString(), outcome_data: result.outcome })
          .eq('id', p.id)
        if (result.success) executedActions++
      } catch (e) { console.error('[non-fatal]', e) }
    }
    if (executedActions > 0 && completedSession) {
      await supabaseAdmin
        .from('agent_council_sessions')
        .update({ executed_actions: executedActions })
        .eq('id', session.id)
    }
  }

  // Refresh proposals after council decisions
  const { data: finalProposals, error: finalErr } = await supabaseAdmin
    .from('agent_council_proposals')
    .select('*')
    .eq('session_id', session.id)
  if (finalErr) console.error('[council] final proposal re-read failed, returning the pre-decision set:', finalErr.message)

  return {
    session: (completedSession ?? session) as AgentCouncilSession,
    proposals: (finalProposals ?? proposals) as AgentCouncilProposal[],
    plan_narrative: planResult.plan_narrative,
    projected_revenue_impact: planResult.projected_revenue_impact,
    projected_cost_saving: planResult.projected_cost_saving,
    agent_health: agentHealth,
  }
}
