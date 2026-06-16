import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { todayAEST, toAESTStart } from '@/lib/date-au'
import { trackAICall } from '@/lib/aria/ai-telemetry'
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

type AgentCtor = { new(): { run(bid: string): Promise<{ decisions: AgentDecision[] }> } }
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

export interface CouncilSession {
  session: AgentCouncilSession
  proposals: AgentCouncilProposal[]
  plan_narrative: string
  projected_revenue_impact: number
  projected_cost_saving: number
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

export async function runCouncilSession(business_id: string): Promise<CouncilSession> {
  const today = new Date().toISOString().split('T')[0]

  // STEP 1: GET OR CREATE TODAY'S SESSION
  const { data: existing } = await supabaseAdmin
    .from('agent_council_sessions')
    .select('*')
    .eq('business_id', business_id)
    .eq('session_date', today)
    .maybeSingle()

  if (existing?.status === 'complete') {
    const { data: existingProposals } = await supabaseAdmin
      .from('agent_council_proposals')
      .select('*')
      .eq('session_id', existing.id)
    return {
      session: existing as AgentCouncilSession,
      proposals: (existingProposals ?? []) as AgentCouncilProposal[],
      plan_narrative: existing.plan_narrative ?? '',
      projected_revenue_impact: Number(existing.projected_revenue_impact ?? 0),
      projected_cost_saving: Number(existing.projected_cost_saving ?? 0),
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
  const { data: settingsRow } = await supabaseAdmin
    .from('agent_settings')
    .select('config, mode')
    .eq('business_id', business_id)
    .eq('agent_type', 'council')
    .maybeSingle()
  const priority = (settingsRow?.config as Record<string,unknown> | null)?.priority as string ?? 'balanced'
  const mode = (settingsRow?.mode as string | null) ?? 'suggest'

  // STEP 3: RUN ALL ENABLED AGENTS IN PARALLEL
  const agentDecisions: AgentDecision[] = []
  const agentErrors: string[] = []

  await Promise.allSettled(
    ALL_AGENT_TYPES.map(async (agentType) => {
      try {
        const { data: agentSettings } = await supabaseAdmin
          .from('agent_settings')
          .select('enabled')
          .eq('business_id', business_id)
          .eq('agent_type', agentType)
          .maybeSingle()

        if (agentSettings?.enabled === false) return

        // Resolve agent from the explicit registry (no fragile string transforms).
        const AgentClass = AGENT_REGISTRY[agentType] ?? null
        if (!AgentClass) {
          agentErrors.push(agentType + ': not registered')
          return
        }

        const result = await Promise.race([
          new AgentClass().run(business_id),
          new Promise<null>((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000)),
        ])
        if (result && 'decisions' in result) {
          agentDecisions.push(...result.decisions)
        }
      } catch (e) {
        agentErrors.push(agentType + ': ' + (e as Error).message)
      }
    })
  )

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

  const { data: insertedProposals } = await supabaseAdmin
    .from('agent_council_proposals')
    .insert(proposalRows)
    .select()

  const proposals = (insertedProposals ?? []) as AgentCouncilProposal[]

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
    plan_narrative: proposals.length === 0
      ? 'No agent proposals today — all systems are in steady state.'
      : 'Aria reviewed ' + proposals.length + ' proposals and approved the highest-impact actions for today.',
    projected_revenue_impact: proposals.reduce((s, p) => s + p.projected_impact_dollars, 0),
    projected_cost_saving: 0,
    priority_focus: priority,
    conflicts_resolved: [],
  }

  if (proposals.length > 0 && process.env.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const msg = await trackAICall(
        { route: 'agents/council', model: MODEL, businessId: business_id, purpose: 'council_plan' },
        () => anthropic.messages.create({
          model: MODEL,
          max_tokens: 2000,
          system: 'You are the Aria Revenue Council chair for an Australian small business. Your role is to evaluate all agent proposals for today and produce a single coordinated action plan that maximises ' + priority + ' without agents working against each other. Be specific. Reference actual $ amounts and product names from the proposals. Resolve conflicts by choosing the higher-impact option that aligns with the owner\'s priority. Respond with valid JSON only, no markdown fences.',
          messages: [{ role: 'user', content: JSON.stringify(councilContext) }],
        })
      )
      const raw = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : '{}'
      const parsed = JSON.parse(raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''))
      if (parsed && typeof parsed === 'object') {
        planResult = { ...planResult, ...parsed }
      }
    } catch (e) {
      console.warn('[council] sonnet call failed:', (e as Error).message)
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
  const { data: completedSession } = await supabaseAdmin
    .from('agent_council_sessions')
    .update({
      plan: planResult as unknown as Record<string, unknown>,
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
  const { data: finalProposals } = await supabaseAdmin
    .from('agent_council_proposals')
    .select('*')
    .eq('session_id', session.id)

  return {
    session: (completedSession ?? session) as AgentCouncilSession,
    proposals: (finalProposals ?? proposals) as AgentCouncilProposal[],
    plan_narrative: planResult.plan_narrative,
    projected_revenue_impact: planResult.projected_revenue_impact,
    projected_cost_saving: planResult.projected_cost_saving,
  }
}
