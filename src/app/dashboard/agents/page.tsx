'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBusinessContext } from '@/components/providers/BusinessProvider'
import type { AgentCouncilSession, AgentCouncilProposal } from '@/lib/agents/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface CouncilData {
  session: AgentCouncilSession | null
  proposals: AgentCouncilProposal[]
  pending_count: number
  auto_executed_count: number
  has_conflicts: boolean
}

interface HistorySession extends AgentCouncilSession {
  proposals: AgentCouncilProposal[]
}

interface AgentCard {
  type: string
  label: string
  color: string
  description: string
  icon: string
}

interface FlashIntervention {
  id: string
  triggered_by: string
  intervention_type: string
  channel: string
  target_count: number
  revenue_in_2h_before: number
  revenue_in_2h_after: number
  revenue_lift_pct: number | null
  executed_at: string
  expires_at: string | null
  cancelled_at: string | null
  message_text: string | null
  target_segment: string | null
}

interface FlashData {
  stats_7d: {
    total_interventions: number
    measured_count: number
    avg_lift_pct: number | null
    by_trigger: Record<string, number>
  }
  active_intervention: {
    id: string
    intervention_type: string
    channel: string
    message_text: string | null
    target_count: number
    executed_at: string
    expires_at: string | null
    triggered_by: string
  } | null
  interventions: FlashIntervention[]
  success_rates: Record<string, number>
  agent_enabled: boolean
  mode: string
}

interface ClvPortfolio {
  total_customer_count: number
  champion_count: number
  loyal_count: number
  potential_count: number
  at_risk_count: number
  dormant_count: number
  lost_count: number
  total_predicted_annual_revenue: number
  at_risk_annual_revenue: number
  top_20_pct_revenue_share: number
  if_rising_stars_add_1_visit: number
  interventions_sent: number
  interventions_responded: number
  response_rate_pct: number
  revenue_attributed_to_interventions: number
  avg_clv_champion?: number
  avg_clv_loyal?: number
  avg_clv_potential?: number
}

interface ClvOpportunity {
  id: string
  customer_id: string
  clv_tier: string
  intervention_priority: string
  predicted_annual_revenue: number
  predicted_3yr_clv: number
  avg_basket_size: number
  days_since_last_visit: number
  recommended_offer_type: string
  recommended_offer_value: number | null
  recommended_message: string | null
  intervention_rationale: string | null
  intervention_sent_at: string | null
  scored_at: string
  pos_customers: { name: string; email: string | null; phone: string | null } | null
}

type TabId = 'today' | 'agents' | 'history' | 'performance' | 'intelligence'

// ── Intelligence tab types ─────────────────────────────────────────────────────

interface IntelMemory {
  id: string
  kind: string
  content: string
  topic: string | null
  importance: number
  confidence: number
  source_type: string
  created_at: string
  reference_count: number | null
}

interface IntelCouncilRun {
  id: string
  mode: string
  created_at: string
  brains_succeeded: number
  brains_failed: number
  synthesis_succeeded: boolean
  fell_back_to_single_model: boolean
  duration_ms: number
  data_quality_score: number | null
  synthesis_model: string | null
  escalation_reason: string | null
  honesty_flags: string[] | null
}

interface IntelSummary {
  id: string
  conversation_date: string
  mode: string
  summary: string
  key_decisions: string[]
  key_concerns: string[]
  followup_promised: string[]
}

interface IntelQuality {
  overall_score: number
  pos_score: number
  customer_score: number
  inventory_score: number
  staff_score: number
  supplier_score: number
  missing_critical: string[]
  missing_helpful: string[]
  reliability_statement: string
  hedge_level: string
}
type Priority = 'growth' | 'margin' | 'retention' | 'balanced'

// ── Agent config ──────────────────────────────────────────────────────────────

const AGENT_CARDS: AgentCard[] = [
  { type: 'reorder', label: 'Smart Reorder', color: '#3B82F6', description: 'Monitors stock levels and triggers purchase orders before you run out.', icon: '📦' },
  { type: 'pricing', label: 'Pricing', color: '#F59E0B', description: 'Adjusts prices based on margin targets and competitor data.', icon: '💰' },
  { type: 'schedule', label: 'Roster', color: '#0D9488', description: 'Optimises staff scheduling against predicted demand.', icon: '👥' },
  { type: 'menu_engineering', label: 'Menu Engineering', color: '#2D5240', description: 'Repositions high-margin items and flags poor performers.', icon: '🍽️' },
  { type: 'flash_revenue', label: 'Flash Revenue', color: '#F97316', description: 'Detects slow periods and triggers targeted promotions in real time.', icon: '⚡' },
  { type: 'clv', label: 'Customer Lifetime Value', color: '#8B5CF6', description: 'Intervenes with lapsed customers before they churn.', icon: '💎' },
  { type: 'labour_optimisation', label: 'Labour Optimisation', color: '#0D9488', description: 'Keeps labour % within target and flags roster inefficiencies.', icon: '⏱️' },
  { type: 'waste_elimination', label: 'Waste Elimination', color: '#7FB897', description: 'Promotes near-expiry stock and reduces write-offs.', icon: '♻️' },
  { type: 'supplier_negotiation', label: 'Supplier Negotiation', color: '#EF4444', description: 'Identifies supplier price anomalies and negotiation opportunities.', icon: '🤝' },
  { type: 'bas_compliance', label: 'BAS Compliance', color: '#6366F1', description: 'Flags GST and BAS obligations based on cash flow patterns.', icon: '📋' },
  { type: 'reputation_defence', label: 'Reputation Defence', color: '#EC4899', description: 'Monitors reviews and triggers response workflows.', icon: '⭐' },
  { type: 'reconciliation', label: 'Reconciliation', color: '#64748B', description: 'Matches bank transactions to POS sales and flags gaps.', icon: '🔍' },
  { type: 'customer_acquisition', label: 'Customer Acquisition', color: '#10B981', description: 'Identifies high-value acquisition channels and triggers campaigns.', icon: '🎯' },
  { type: 'inventory_financing', label: 'Inventory Financing', color: '#EAB308', description: 'Flags cash-flow risk from large reorders and suggests financing options.', icon: '🏦' },
]

const URGENCY_ORDER: Record<string, number> = { critical: 0, high: 1, normal: 2, low: 3 }

// ── Helper components ─────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, { label: string; color: string }> = {
    critical: { label: 'Critical', color: '#EF4444' },
    high: { label: 'High', color: '#F97316' },
    normal: { label: 'Normal', color: '#EAB308' },
    low: { label: 'Low', color: '#9CA3AF' },
  }
  const u = map[urgency] ?? map.normal
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: u.color, background: u.color + '18', padding: '2px 8px', borderRadius: 99 }}>
      {urgency === 'critical' ? '🔴' : urgency === 'high' ? '🟠' : urgency === 'normal' ? '🟡' : '⚪'} {u.label}
    </span>
  )
}

function AgentBadge({ agentType }: { agentType: string }) {
  const agent = AGENT_CARDS.find(a => a.type === agentType)
  const color = agent?.color ?? '#6B7280'
  const label = agent?.label ?? agentType.replace(/_/g, ' ')
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: color + '18', padding: '2px 8px', borderRadius: 99, textTransform: 'capitalize' }}>
      {label}
    </span>
  )
}

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = pct >= 75 ? '#2D5240' : pct >= 50 ? '#EAB308' : '#EF4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 30 }}>{pct}%</span>
    </div>
  )
}

function ImpactChip({ dollars, label }: { dollars: number; label?: string }) {
  const formatted = dollars >= 1000 ? '$' + (dollars / 1000).toFixed(1) + 'k' : '$' + Math.round(dollars)
  return (
    <span style={{ fontSize: 12, fontWeight: 700, color: '#7FB897', background: 'rgba(127,184,151,0.12)', padding: '2px 10px', borderRadius: 99 }}>
      {label ?? '+'}{formatted}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { business } = useBusinessContext()
  const [tab, setTab] = useState<TabId>('today')
  const [council, setCouncil] = useState<CouncilData | null>(null)
  const [history, setHistory] = useState<HistorySession[]>([])
  const [historyTotals, setHistoryTotals] = useState({ revenue: 0, cost_saved: 0 })
  const [priority, setPriority] = useState<Priority>('balanced')
  const [mode, setMode] = useState<'suggest' | 'auto'>('suggest')
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState<Record<string, boolean>>({})
  const [executedCards, setExecutedCards] = useState<Record<string, { time: string; outcome: Record<string, unknown> }>>({})
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({})
  const [agentSettings, setAgentSettings] = useState<Record<string, { enabled: boolean; mode: string; config: Record<string, unknown> }>>({})
  const [runningAgents, setRunningAgents] = useState<Record<string, boolean>>({})
  const [agentRunResults, setAgentRunResults] = useState<Record<string, string>>({})
  const [showAutoModal, setShowAutoModal] = useState(false)
  const [savingPriority, setSavingPriority] = useState(false)

  // Menu engineering widget state
  const [menuScores, setMenuScores] = useState<Array<{ product_id: string; performance_tier: string; composite_score: number; scored_at: string; pos_products: { name: string; price: number } | null }>>([])
  const [menuActions, setMenuActions] = useState<Array<{ id: string; action_type: string; reasoning: string | null; executed_at: string; revenue_impact_actual: number | null }>>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [currentMenuMode, setCurrentMenuMode] = useState<string>('normal')

  // Flash Revenue widget state
  const [flashData, setFlashData] = useState<FlashData | null>(null)
  const [flashLoading, setFlashLoading] = useState(false)
  const [cancellingFlash, setCancellingFlash] = useState<string | null>(null)

  // Customer Intelligence (CLV) widget state
  const [clvPortfolio, setClvPortfolio] = useState<ClvPortfolio | null>(null)
  const [clvOpportunities, setClvOpportunities] = useState<ClvOpportunity[]>([])
  const [clvLoading, setClvLoading] = useState(false)
  const [clvTierFilter, setClvTierFilter] = useState<string>('')
  const [sendingClvId, setSendingClvId] = useState<string | null>(null)
  const [sentClvIds, setSentClvIds] = useState<Set<string>>(new Set())
  const [skippedClvIds, setSkippedClvIds] = useState<Set<string>>(new Set())
  const [expandedClvId, setExpandedClvId] = useState<string | null>(null)

  // Labour Optimisation widget state
  const [labourRealtime, setLabourRealtime] = useState<{ labour_pct: number; active_staff_count: number; cost_so_far: number; revenue_today: number; threshold_pct: number; target_pct: number; over_threshold: boolean } | null>(null)
  const [labourActions, setLabourActions] = useState<Array<{ id: string; action_type: string; target_date: string; target_hour_start: number | null; target_hour_end: number | null; staff_response: string | null; labour_cost_saving: number | null; message_sent: string | null; executed_at: string; staff_members?: { first_name: string; last_name: string } | null }>>([])
  const [labourLoading, setLabourLoading] = useState(false)
  const [labourPotentialSaving, setLabourPotentialSaving] = useState<number | null>(null)

  // Waste Elimination widget state
  const [wasteData, setWasteData] = useState<{
    today_predictions: Array<{ product_id: string; recommended_prep_qty: number; recommended_prep_time: string; prep_guide_narrative: string; prediction_confidence: number; actual_units_sold: number | null; actual_waste_units: number | null; promotion_triggered: boolean; pos_products: { name: string; shelf_life_hours: number | null } | null }>
    tomorrow_predictions: Array<{ product_id: string; recommended_prep_qty: number; recommended_prep_time: string; prep_guide_narrative: string; prediction_confidence: number; pos_products: { name: string; shelf_life_hours: number | null } | null }>
    waste_saved_this_month: number
    accuracy_this_month: number | null
  } | null>(null)
  const [wasteLoading, setWasteLoading] = useState(false)

  // Supplier Negotiation widget state
  const [negProfiles, setNegProfiles] = useState<Array<{ id: string; supplier_name: string; total_spend_12m: number; leverage_score: number; price_creep_pct: number; overcharge_count_12m: number; total_overcharge_12m: number; negotiation_priority: string; key_products: string[] | null; leverage_factors: string[] | null }>>([])
  const [negBriefs, setNegBriefs] = useState<Array<{ id: string; supplier_name: string; negotiation_goal: string; expected_outcome: string; success_probability: number; draft_email_subject: string | null; draft_email_body: string | null; draft_talking_points: string[] | null; annual_saving_if_successful: number; monthly_saving_if_successful: number; status: string; leverage_arguments: Array<{ argument: string; data_point: string; strength: string }> | null }>>([])
  const [negSummary, setNegSummary] = useState<{ total_suppliers: number; total_opportunity_annual: number; strongest_position: { supplier_name: string; leverage_score: number } | null; urgent_count: number; high_count: number } | null>(null)
  const [negWonSavings, setNegWonSavings] = useState(0)
  const [negLoading, setNegLoading] = useState(false)
  const [expandedBriefId, setExpandedBriefId] = useState<string | null>(null)
  const [updatingBriefId, setUpdatingBriefId] = useState<string | null>(null)

  // Customer acquisition / AEO state
  const [acqProfile, setAcqProfile] = useState<{ overall_aeo_score: number; google_business_score: number; review_velocity_score: number; content_freshness_score: number; missing_fields: string[] | null; improvement_recommendations: Array<{ field: string; action: string; impact: string; effort: string; priority: number }> | null } | null>(null)
  const [acqContent, setAcqContent] = useState<Array<{ id: string; content_type: string; title: string; content: string; target_queries: string[] | null; published_at: string | null; published_to: string[] | null }>>([])
  const [acqAeoSnaps, setAcqAeoSnaps] = useState<Array<{ query: string; appeared: boolean }>>([])
  const [acqLoading, setAcqLoading] = useState(false)
  const [runningAcq, setRunningAcq] = useState(false)

  // Reconciliation state
  const [reconDays, setReconDays] = useState<Array<{ id: string; recon_date: string; pos_sales_total: number; bank_deposits_total: number; variance_amount: number; status: string; bank_data_source: string; explanation: string | null }>>([])
  const [reconAnomalies, setReconAnomalies] = useState<Array<{ id: string; expense_category: string | null; expense_description: string | null; amount: number; deviation_pct: number | null; possible_causes: string[] | null; status: string }>>([])
  const [reconPL, setReconPL] = useState<Array<{ id: string; period_month: number; period_year: number; net_revenue: number; gross_margin_pct: number; ebitda: number; summary_narrative: string | null; revenue_vs_last_month_pct: number }>>([])
  const [reconTotalVariance7d, setReconTotalVariance7d] = useState(0)
  const [reconUnresolved, setReconUnresolved] = useState(0)
  const [reconLoading, setReconLoading] = useState(false)
  const [reconExpandedDay, setReconExpandedDay] = useState<string | null>(null)
  const [resolvingAnomalyId, setResolvingAnomalyId] = useState<string | null>(null)

  // Reputation state
  const [repReviews, setRepReviews] = useState<Array<{ id: string; platform: string; reviewer_name: string | null; rating: number; review_text: string | null; review_date: string | null; response_text: string | null; response_status: string; sentiment: string | null; is_crisis: boolean | null; key_themes: string[] | null }>>([])
  const [repStats, setRepStats] = useState<{ avg_rating: number | null; total_reviews: number; pending_responses: number; this_week_count: number } | null>(null)
  const [repAeoScore, setRepAeoScore] = useState<number | null>(null)
  const [repAeoSnapshots, setRepAeoSnapshots] = useState<Array<{ query: string; appeared: boolean; recommendations: string[] }>>([])
  const [repRequestStats, setRepRequestStats] = useState<{ sent: number; opened: number; clicked: number; reviews_received: number } | null>(null)
  const [repLoading, setRepLoading] = useState(false)
  const [repRespondingId, setRepRespondingId] = useState<string | null>(null)
  const [repExpandedId, setRepExpandedId] = useState<string | null>(null)

  // Inventory financing / cash flow state
  const [finWeeks, setFinWeeks] = useState<Array<{ week_number: number; forecast_week: string; predicted_pos_revenue: number; predicted_supplier_payments: number; predicted_payroll: number; predicted_rent_utilities: number; predicted_other_fixed: number; opening_cash_position: number; closing_cash_position: number; reorder_events: Array<{ product_name: string; supplier_name: string; estimated_cost: number }>; reorder_total_cost: number; risk_level: string; risk_reason: string }>>([])
  const [finOpportunities, setFinOpportunities] = useState<Array<{ id: string; opportunity_type: string; description: string; potential_benefit: number | null; effort_level: string | null; urgency: string | null; trigger_week: string | null; status: string }>>([])
  const [finCurrentCash, setFinCurrentCash] = useState<number | null>(null)
  const [finBankConnected, setFinBankConnected] = useState(false)
  const [finLoading, setFinLoading] = useState(false)
  const [finExpandedWeek, setFinExpandedWeek] = useState<number | null>(null)
  const [finRunning, setFinRunning] = useState(false)
  const [finActioning, setFinActioning] = useState<string | null>(null)

  const bid = business?.id

  // Intelligence tab state
  const [intelQuality, setIntelQuality] = useState<IntelQuality | null>(null)
  const [intelMemories, setIntelMemories] = useState<IntelMemory[]>([])
  const [intelRuns, setIntelRuns] = useState<IntelCouncilRun[]>([])
  const [intelSummaries, setIntelSummaries] = useState<IntelSummary[]>([])
  const [intelLoading, setIntelLoading] = useState(false)
  const [memKindFilter, setMemKindFilter] = useState('all')
  const [forgettingId, setForgettingId] = useState<string | null>(null)

  const loadCouncil = useCallback(async () => {
    if (!bid) return
    setLoading(true)
    try {
      const r = await fetch('/api/agents/council')
      if (r.ok) {
        const d = await r.json() as CouncilData
        setCouncil(d)
        if (d.session?.owner_priority) setPriority(d.session.owner_priority as Priority)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setLoading(false)
  }, [bid])

  const loadHistory = useCallback(async () => {
    if (!bid) return
    try {
      const r = await fetch('/api/agents/council/history?limit=30')
      if (r.ok) {
        const d = await r.json() as { sessions: HistorySession[]; total_revenue_attributed: number; total_cost_saved: number }
        setHistory(d.sessions ?? [])
        setHistoryTotals({ revenue: d.total_revenue_attributed, cost_saved: d.total_cost_saved })
      }
    } catch (e) { console.error('[non-fatal]', e) }
  }, [bid])

  const loadSettings = useCallback(async () => {
    if (!bid) return
    const settings: Record<string, { enabled: boolean; mode: string; config: Record<string, unknown> }> = {}
    await Promise.allSettled(
      AGENT_CARDS.map(async agent => {
        settings[agent.type] = { enabled: true, mode: 'suggest', config: {} }
      })
    )
    // Load council settings
    setAgentSettings(settings)
    const r = await fetch('/api/agents/council/settings').catch(() => null)
    if (r?.ok) {
      const d = await r.json() as { settings: Record<string, unknown> }
      if (d.settings?.mode) setMode(String(d.settings.mode) as 'suggest' | 'auto')
    }
  }, [bid])

  const loadMenuData = useCallback(async () => {
    if (!bid) return
    setMenuLoading(true)
    try {
      const [scoresRes, actionsRes] = await Promise.all([
        fetch('/api/agents/menu-engineering/scores'),
        fetch('/api/agents/menu-engineering/actions?limit=20'),
      ])
      if (scoresRes.ok) {
        const d = await scoresRes.json() as { scores: typeof menuScores; current_mode?: string }
        setMenuScores(d.scores ?? [])
        if (d.current_mode) setCurrentMenuMode(d.current_mode)
      }
      if (actionsRes.ok) {
        const d = await actionsRes.json() as { actions: typeof menuActions }
        setMenuActions(d.actions ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setMenuLoading(false)
  }, [bid]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFlashData = useCallback(async () => {
    if (!bid) return
    setFlashLoading(true)
    try {
      const r = await fetch('/api/agents/flash-revenue')
      if (r.ok) {
        const d = await r.json() as FlashData
        setFlashData(d)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setFlashLoading(false)
  }, [bid])

  const loadClvData = useCallback(async () => {
    if (!bid) return
    setClvLoading(true)
    try {
      const url = clvTierFilter
        ? '/api/agents/clv/customers?tier=' + clvTierFilter + '&limit=20'
        : '/api/agents/clv/customers?limit=20'
      const [portfolioRes, customersRes] = await Promise.all([
        fetch('/api/agents/clv'),
        fetch(url),
      ])
      if (portfolioRes.ok) {
        const d = await portfolioRes.json() as { portfolio: ClvPortfolio | null; top_opportunities: ClvOpportunity[] }
        setClvPortfolio(d.portfolio)
        if (!clvTierFilter) setClvOpportunities(d.top_opportunities ?? [])
      }
      if (customersRes.ok && clvTierFilter) {
        const d = await customersRes.json() as { customers: ClvOpportunity[] }
        setClvOpportunities(d.customers ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setClvLoading(false)
  }, [bid, clvTierFilter])

  useEffect(() => {
    void loadCouncil()
    void loadHistory()
    void loadSettings()
  }, [loadCouncil, loadHistory, loadSettings])

  const loadIntelligenceData = useCallback(async () => {
    if (!bid) return
    setIntelLoading(true)
    try {
      const [q, m, r, s] = await Promise.all([
        fetch('/api/aria/data-quality?businessId=' + bid).then(res => res.ok ? res.json() : null),
        fetch('/api/aria/memory').then(res => res.ok ? res.json() : { memories: [] }),
        fetch('/api/aria/council-runs?limit=7').then(res => res.ok ? res.json() : { runs: [] }),
        fetch('/api/aria/conversation-summaries?days=7').then(res => res.ok ? res.json() : { summaries: [] }),
      ])
      setIntelQuality(q ?? null)
      setIntelMemories((m as { memories: IntelMemory[] }).memories ?? [])
      setIntelRuns((r as { runs: IntelCouncilRun[] }).runs ?? [])
      setIntelSummaries((s as { summaries: IntelSummary[] }).summaries ?? [])
    } catch (e) { console.error('[non-fatal]', e) }
    setIntelLoading(false)
  }, [bid])

  const forgetMemory = async (id: string) => {
    setForgettingId(id)
    try {
      await fetch('/api/aria/memory?id=' + id + '&reason=owner_forgotten', { method: 'DELETE' })
      setIntelMemories(ms => ms.filter(m => m.id !== id))
    } catch (e) { console.error('[non-fatal]', e) }
    setForgettingId(null)
  }

  const loadLabourData = useCallback(async () => {
    if (!bid) return
    setLabourLoading(true)
    try {
      const [realtimeRes, actionsRes] = await Promise.all([
        fetch('/api/agents/labour/realtime'),
        fetch('/api/agents/labour/actions'),
      ])
      if (realtimeRes.ok) {
        const d = await realtimeRes.json() as typeof labourRealtime
        setLabourRealtime(d)
      }
      if (actionsRes.ok) {
        const d = await actionsRes.json() as { actions: typeof labourActions; pending_responses: number; accepted_count: number; declined_count: number; total_savings_realised: number }
        setLabourActions(d.actions ?? [])
        const pendingSavings = (d.actions ?? []).filter((a: { staff_response: string | null; labour_cost_saving: number | null }) => a.staff_response === 'pending').reduce((s: number, a: { labour_cost_saving: number | null }) => s + Number(a.labour_cost_saving ?? 0), 0)
        setLabourPotentialSaving(pendingSavings)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setLabourLoading(false)
  }, [bid])

  const loadWasteData = useCallback(async () => {
    if (!bid) return
    setWasteLoading(true)
    try {
      const res = await fetch('/api/agents/waste/predictions')
      if (res.ok) {
        const d = await res.json() as typeof wasteData
        setWasteData(d)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setWasteLoading(false)
  }, [bid])

  const loadNegotiationData = useCallback(async () => {
    if (!bid) return
    setNegLoading(true)
    try {
      const [profilesRes, briefsRes] = await Promise.all([
        fetch('/api/agents/negotiation/profiles'),
        fetch('/api/agents/negotiation/briefs'),
      ])
      if (profilesRes.ok) {
        const d = await profilesRes.json() as { profiles: typeof negProfiles; summary: typeof negSummary }
        setNegProfiles(d.profiles ?? [])
        setNegSummary(d.summary ?? null)
      }
      if (briefsRes.ok) {
        const d = await briefsRes.json() as { briefs: typeof negBriefs; won_savings_this_year: number }
        setNegBriefs(d.briefs ?? [])
        setNegWonSavings(d.won_savings_this_year ?? 0)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setNegLoading(false)
  }, [bid])

  const loadAcquisitionData = useCallback(async () => {
    if (!bid) return
    setAcqLoading(true)
    try {
      const res = await fetch('/api/agents/acquisition/profile')
      if (res.ok) {
        const d = await res.json() as { profile: typeof acqProfile; content: typeof acqContent; aeo_snapshots: typeof acqAeoSnaps }
        setAcqProfile(d.profile ?? null)
        setAcqContent(d.content ?? [])
        setAcqAeoSnaps(d.aeo_snapshots ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setAcqLoading(false)
  }, [bid])

  const loadReconciliationData = useCallback(async () => {
    if (!bid) return
    setReconLoading(true)
    try {
      const [dailyRes, anomaliesRes, plRes] = await Promise.all([
        fetch('/api/agents/reconciliation/daily'),
        fetch('/api/agents/reconciliation/anomalies'),
        fetch('/api/agents/reconciliation/pl'),
      ])
      if (dailyRes.ok) {
        const d = await dailyRes.json() as { reconciliations: typeof reconDays; total_variance_7d: number; unresolved_count: number }
        setReconDays(d.reconciliations ?? [])
        setReconTotalVariance7d(d.total_variance_7d ?? 0)
        setReconUnresolved(d.unresolved_count ?? 0)
      }
      if (anomaliesRes.ok) {
        const d = await anomaliesRes.json() as { anomalies: typeof reconAnomalies }
        setReconAnomalies(d.anomalies ?? [])
      }
      if (plRes.ok) {
        const d = await plRes.json() as { reports: typeof reconPL }
        setReconPL(d.reports ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setReconLoading(false)
  }, [bid])

  const loadReputationData = useCallback(async () => {
    if (!bid) return
    setRepLoading(true)
    try {
      const res = await fetch('/api/agents/reputation')
      if (res.ok) {
        const d = await res.json() as { reviews: typeof repReviews; stats: typeof repStats; aeo_score: number; aeo_snapshots: typeof repAeoSnapshots; request_stats: typeof repRequestStats }
        setRepReviews(d.reviews ?? [])
        setRepStats(d.stats ?? null)
        setRepAeoScore(d.aeo_score ?? null)
        setRepAeoSnapshots(d.aeo_snapshots ?? [])
        setRepRequestStats(d.request_stats ?? null)
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setRepLoading(false)
  }, [bid])

  const loadFinancingData = useCallback(async () => {
    if (!bid) return
    setFinLoading(true)
    try {
      const res = await fetch('/api/agents/financing/forecast')
      if (res.ok) {
        const d = await res.json() as { weeks: typeof finWeeks; current_cash: number | null; bank_connected: boolean; opportunities: typeof finOpportunities }
        setFinWeeks(d.weeks ?? [])
        setFinCurrentCash(d.current_cash)
        setFinBankConnected(d.bank_connected ?? false)
        setFinOpportunities(d.opportunities ?? [])
      }
    } catch (e) { console.error('[non-fatal]', e) }
    setFinLoading(false)
  }, [bid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab === 'agents') {
      void loadMenuData()
      void loadFlashData()
      void loadClvData()
      void loadLabourData()
      void loadWasteData()
      void loadNegotiationData()
      void loadReputationData()
      void loadReconciliationData()
      void loadAcquisitionData()
      void loadFinancingData()
    }
  }, [tab, loadMenuData, loadFlashData, loadClvData, loadLabourData, loadWasteData, loadNegotiationData, loadReputationData, loadReconciliationData, loadAcquisitionData, loadFinancingData])

  useEffect(() => {
    if (tab === 'intelligence') void loadIntelligenceData()
  }, [tab, loadIntelligenceData])

  const savePriority = async (p: Priority) => {
    setPriority(p)
    setSavingPriority(true)
    await fetch('/api/agents/council/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner_priority: p }),
    }).catch(() => {})
    setSavingPriority(false)
  }

  const switchMode = async (newMode: 'suggest' | 'auto') => {
    setMode(newMode)
    setShowAutoModal(false)
    await fetch('/api/agents/council/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    }).catch(() => {})
  }

  const executeProposal = async (proposalId: string) => {
    setExecuting(prev => ({ ...prev, [proposalId]: true }))
    try {
      const r = await fetch('/api/agents/council/proposals/' + proposalId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'approved' }),
      })
      if (r.ok) {
        const d = await r.json() as { executed: boolean; outcome: Record<string, unknown> }
        setExecutedCards(prev => ({ ...prev, [proposalId]: { time: new Date().toLocaleTimeString(), outcome: d.outcome } }))
        void loadCouncil()
      }
    } catch { /* show error */ }
    setExecuting(prev => ({ ...prev, [proposalId]: false }))
  }

  const skipProposal = async (proposalId: string) => {
    await fetch('/api/agents/council/proposals/' + proposalId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'rejected', note: 'Skipped by owner' }),
    }).catch(() => {})
    void loadCouncil()
  }

  const toggleAgent = async (agentType: string, enabled: boolean) => {
    setAgentSettings(prev => ({ ...prev, [agentType]: { ...prev[agentType], enabled } }))
    await fetch('/api/agents/council/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_type: agentType, config: { enabled } }),
    }).catch(() => {})
  }

  const runAgent = async (agentType: string) => {
    setRunningAgents(prev => ({ ...prev, [agentType]: true }))
    setAgentRunResults(prev => ({ ...prev, [agentType]: 'Running...' }))
    await fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_type: agentType, business_id: bid }),
    }).catch(() => {})
    setRunningAgents(prev => ({ ...prev, [agentType]: false }))
    setAgentRunResults(prev => ({ ...prev, [agentType]: 'Done' }))
    setTimeout(() => setAgentRunResults(prev => { const n = { ...prev }; delete n[agentType]; return n }), 5000)
  }

  const resetMenuAgent = async () => {
    if (!bid) return
    setResetting(true)
    await fetch('/api/agents/menu-engineering/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_id: bid }),
    }).catch(() => {})
    setResetting(false)
    setShowResetModal(false)
    setResetDone(true)
    setMenuScores([])
    setMenuActions([])
    setTimeout(() => setResetDone(false), 4000)
  }

  const sendClvIntervention = async (scoreId: string) => {
    setSendingClvId(scoreId)
    try {
      const r = await fetch('/api/agents/clv/send/' + scoreId, { method: 'POST' })
      if (r.ok) {
        setSentClvIds(prev => new Set([...prev, scoreId]))
      }
    } catch { /* show error */ }
    setSendingClvId(null)
  }

  const cancelFlashIntervention = async (id: string) => {
    setCancellingFlash(id)
    await fetch('/api/agents/flash-revenue/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {})
    setCancellingFlash(null)
    void loadFlashData()
  }

  const surface = 'rgba(255,255,255,0.04)'
  const border = '1px solid rgba(255,255,255,0.08)'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a1a12 0%, #0d1f18 50%, #0a1a12 100%)', padding: '24px 28px', fontFamily: 'Inter, sans-serif' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#fff', margin: 0, fontWeight: 400 }}>
          Revenue Council
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14, margin: '4px 0 0' }}>
          All your AI agents, coordinated. One plan, every morning.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: surface, borderRadius: 10, padding: 4, width: 'fit-content' }}>
        {(['today', 'agents', 'history', 'performance', 'intelligence'] as TabId[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: tab === t ? '#2D5240' : 'transparent',
            color: tab === t ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.15s',
          }}>
            {t === 'today' ? "Today's Plan" : t === 'agents' ? 'All Agents' : t === 'history' ? 'History' : t === 'performance' ? 'Performance' : 'Intelligence'}
          </button>
        ))}
      </div>

      {/* ── TODAY'S PLAN TAB ─────────────────────────────────────────────────── */}
      {tab === 'today' && (
        <div>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', padding: 40, textAlign: 'center' }}>Loading today's plan...</div>
          ) : !council?.session ? (
            <div style={{ background: surface, border, borderRadius: 16, padding: 40, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>☀️</div>
              <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 20, color: 'rgba(255,255,255,0.6)' }}>
                Council hasn't run today yet. It runs at 6am AEST automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Plan narrative */}
              <div style={{ background: surface, border, borderRadius: 16, padding: 28, marginBottom: 20 }}>
                <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 22, color: '#fff', margin: 0, lineHeight: 1.5 }}>
                  {council.session.plan_narrative ?? 'Aria is reviewing today\'s opportunities.'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, margin: '12px 0 0' }}>
                  Aria ran today · {council.session.proposals_count} proposals · {council.session.conflicts_detected} conflicts resolved
                </p>
              </div>

              {/* Impact cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Expected revenue lift', value: '$' + Math.round(council.session.projected_revenue_impact), sub: 'today' },
                  { label: 'Expected cost saving', value: '$' + Math.round(council.session.projected_cost_saving), sub: 'this week' },
                  { label: 'Actions taken', value: String(council.session.executed_actions), sub: 'auto-executed' },
                ].map(card => (
                  <div key={card.label} style={{ background: surface, border, borderRadius: 12, padding: 20 }}>
                    <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '0 0 8px' }}>{card.label}</p>
                    <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#7FB897', margin: 0 }}>{card.value}</p>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, margin: '4px 0 0' }}>{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Priority selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>Optimise for:</span>
                <div style={{ display: 'flex', gap: 4, background: surface, borderRadius: 8, padding: 3 }}>
                  {(['growth', 'margin', 'retention', 'balanced'] as Priority[]).map(p => (
                    <button key={p} onClick={() => savePriority(p)} style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: priority === p ? '#2D5240' : 'transparent',
                      color: priority === p ? '#fff' : 'rgba(255,255,255,0.4)',
                      textTransform: 'capitalize',
                    }}>
                      {p}
                    </button>
                  ))}
                </div>
                {savingPriority && <span style={{ fontSize: 11, color: '#7FB897' }}>Saved</span>}
              </div>

              {/* Mode banner */}
              {mode === 'suggest' && (
                <div style={{ background: 'rgba(45,82,64,0.25)', border: '1px solid rgba(127,184,151,0.3)', borderRadius: 12, padding: '14px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                    Suggest mode — Aria queues actions for your approval. Switch to Auto for hands-free operation.
                  </span>
                  <button onClick={() => setShowAutoModal(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.4)', background: 'transparent', color: '#7FB897', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    Enable Auto
                  </button>
                </div>
              )}

              {/* Proposal cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {council.proposals.sort((a, b) => {
                  const ua = URGENCY_ORDER[a.urgency] ?? 2
                  const ub = URGENCY_ORDER[b.urgency] ?? 2
                  if (ua !== ub) return ua - ub
                  return b.projected_impact_dollars - a.projected_impact_dollars
                }).map(p => {
                  const isExecuted = !!executedCards[p.id] || !!p.executed_at
                  const isRejected = p.council_decision === 'rejected'
                  const isRunning = executing[p.id]

                  return (
                    <div key={p.id} style={{
                      background: isExecuted ? 'rgba(45,82,64,0.3)' : isRejected ? 'rgba(255,255,255,0.02)' : surface,
                      border: isExecuted ? '1px solid rgba(127,184,151,0.4)' : isRejected ? '1px solid rgba(255,255,255,0.04)' : border,
                      borderRadius: 14, padding: 20, opacity: isRejected ? 0.5 : 1,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <AgentBadge agentType={p.agent_type} />
                          <UrgencyBadge urgency={p.urgency} />
                        </div>
                        {p.projected_impact_dollars > 0 && (
                          <ImpactChip dollars={p.projected_impact_dollars} />
                        )}
                      </div>

                      <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>
                        {String(p.proposal_data.title ?? p.proposal_type.replace(/_/g, ' '))}
                      </h3>
                      <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
                        {String(p.proposal_data.description ?? p.council_reasoning ?? '')}
                      </p>

                      <ConfidenceBar confidence={p.confidence} />

                      {p.conflicts_with && p.conflicts_with.length > 0 && (
                        <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
                          <span style={{ color: '#EF4444', fontSize: 12 }}>
                            ⚠ Conflicts with {p.conflicts_with.map(ref => council.proposals.find(pp => pp.id === ref)?.agent_type ?? ref).join(', ')} agent — council chose this because {p.council_reasoning ?? 'higher projected impact'}
                          </span>
                        </div>
                      )}

                      {isRejected ? (
                        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, marginTop: 12 }}>
                          Council skipped — {p.council_reasoning ?? 'lower priority than other actions'}
                        </p>
                      ) : isExecuted ? (
                        <p style={{ color: '#7FB897', fontSize: 12, marginTop: 12, fontWeight: 500 }}>
                          ✓ Executed {executedCards[p.id]?.time ?? (p.executed_at ? new Date(p.executed_at).toLocaleTimeString() : '')}
                        </p>
                      ) : mode === 'suggest' && p.council_decision === 'approved' ? (
                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                          <button onClick={() => executeProposal(p.id)} disabled={isRunning} style={{
                            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: isRunning ? 'default' : 'pointer',
                            background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600,
                            opacity: isRunning ? 0.7 : 1,
                          }}>
                            {isRunning ? '⟳ Executing...' : '✓ Execute'}
                          </button>
                          <button onClick={() => skipProposal(p.id)} disabled={isRunning} style={{
                            padding: '8px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer',
                            background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13,
                          }}>
                            ✗ Skip
                          </button>
                        </div>
                      ) : p.executed_at ? (
                        <p style={{ color: '#7FB897', fontSize: 12, marginTop: 12, fontWeight: 500 }}>
                          ⚡ Auto-executed at {new Date(p.executed_at).toLocaleTimeString()}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ALL AGENTS TAB ───────────────────────────────────────────────────── */}
      {tab === 'agents' && (
        <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {AGENT_CARDS.map(agent => {
            const settings = agentSettings[agent.type] ?? { enabled: true, mode: 'suggest', config: {} }
            const isRunning = runningAgents[agent.type]
            const runResult = agentRunResults[agent.type]

            return (
              <div key={agent.type} style={{ background: surface, border, borderRadius: 14, padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 24 }}>{agent.icon}</span>
                    <div>
                      <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>{agent.label}</h3>
                      <span style={{ fontSize: 11, color: agent.color }}>● {settings.enabled ? 'Active' : 'Disabled'}</span>
                    </div>
                  </div>
                  {/* Toggle */}
                  <button onClick={() => toggleAgent(agent.type, !settings.enabled)} style={{
                    width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                    background: settings.enabled ? '#2D5240' : 'rgba(255,255,255,0.15)',
                    position: 'relative', transition: 'background 0.2s',
                  }}>
                    <span style={{
                      position: 'absolute', top: 3, left: settings.enabled ? 20 : 3,
                      width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
                    }} />
                  </button>
                </div>

                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, margin: '0 0 14px', lineHeight: 1.5 }}>
                  {agent.description}
                </p>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button onClick={() => runAgent(agent.type)} disabled={isRunning || !settings.enabled} style={{
                    padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)',
                    background: 'transparent', color: '#7FB897', fontSize: 12, cursor: isRunning ? 'default' : 'pointer',
                    fontWeight: 600, opacity: isRunning || !settings.enabled ? 0.5 : 1,
                  }}>
                    {isRunning ? 'Running...' : runResult ?? 'Run now'}
                  </button>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                    {mode === 'auto' ? '⚡ Auto' : '✋ Suggest'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Menu Engineering Widget ─────────────────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>🍽️ Menu Engineering Intelligence</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>BCG matrix · current mode · today's changes</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Current mode badge */}
              <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: '1px solid',
                background: currentMenuMode === 'peak' ? 'rgba(239,68,68,0.12)' : currentMenuMode === 'quiet' ? 'rgba(59,130,246,0.12)' : 'rgba(127,184,151,0.12)',
                borderColor: currentMenuMode === 'peak' ? 'rgba(239,68,68,0.3)' : currentMenuMode === 'quiet' ? 'rgba(59,130,246,0.3)' : 'rgba(127,184,151,0.3)',
                color: currentMenuMode === 'peak' ? '#EF4444' : currentMenuMode === 'quiet' ? '#60A5FA' : '#7FB897',
              }}>
                {currentMenuMode === 'peak' ? '🔥 Peak mode' : currentMenuMode === 'quiet' ? '🌙 Quiet mode' : '📊 Normal mode'}
              </span>
              {resetDone && <span style={{ fontSize: 12, color: '#7FB897' }}>✓ Reset complete</span>}
              <button onClick={() => setShowResetModal(true)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Reset
              </button>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {menuLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Loading menu intelligence...</div>
            ) : menuScores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginBottom: 16 }}>No scores yet — run the agent to analyse your menu</p>
                <button onClick={() => bid && fetch('/api/agents/menu-engineering/actions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) }).then(() => void loadMenuData())} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Run Menu Analysis
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

                {/* BCG 2×2 Matrix */}
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>BCG Matrix</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 4, height: 240 }}>
                    {[
                      { q: 'star', label: '⭐ Stars', desc: 'High velocity · High margin', color: '#F59E0B', bg: 'rgba(245,158,11,0.08)' },
                      { q: 'puzzle', label: '🔵 Puzzles', desc: 'Low velocity · High margin', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)' },
                      { q: 'plowhouse', label: '🟢 Plowhouses', desc: 'High velocity · Low margin', color: '#7FB897', bg: 'rgba(127,184,151,0.08)' },
                      { q: 'dog', label: '⚫ Dogs', desc: 'Low velocity · Low margin', color: '#6B7280', bg: 'rgba(107,114,128,0.08)' },
                    ].map(cell => {
                      const items = menuScores.filter(s => s.performance_tier === cell.q)
                      return (
                        <div key={cell.q} style={{ background: cell.bg, border: '1px solid ' + cell.color + '22', borderRadius: 10, padding: 10, overflow: 'hidden' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: cell.color, marginBottom: 4 }}>{cell.label}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>{cell.desc}</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: cell.color }}>{items.length} items</div>
                          <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {items.slice(0, 3).map(s => (
                              <div key={s.product_id} style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.pos_products?.name ?? s.product_id.slice(0, 8)}
                              </div>
                            ))}
                            {items.length > 3 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>+{items.length - 3} more</div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  {/* Axis labels */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>← Low margin</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>High margin →</span>
                  </div>
                </div>

                {/* Today's changes + 7-day bar chart */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* Today's changes timeline */}
                  <div>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Today's Changes</h4>
                    {menuActions.length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No actions yet today</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
                        {menuActions.slice(0, 8).map(a => (
                          <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', marginTop: 1 }}>
                              {new Date(a.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
                              {a.action_type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              {a.reasoning ? (' — ' + a.reasoning.slice(0, 60) + (a.reasoning.length > 60 ? '...' : '')) : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 7-day score distribution mini chart */}
                  <div>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Score Distribution</h4>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 56 }}>
                      {(() => {
                        const buckets = Array.from({ length: 10 }, (_, i) => ({
                          min: i * 0.1, max: (i + 1) * 0.1,
                          count: menuScores.filter(s => s.composite_score >= i * 0.1 && s.composite_score < (i + 1) * 0.1).length,
                        }))
                        const maxCount = Math.max(1, ...buckets.map(b => b.count))
                        return buckets.map((b, i) => (
                          <div key={i} title={(b.min * 100).toFixed(0) + '–' + (b.max * 100).toFixed(0) + ': ' + b.count + ' items'} style={{ flex: 1, background: b.count > 0 ? '#7FB897' : 'rgba(255,255,255,0.06)', borderRadius: 3, height: Math.max(4, (b.count / maxCount) * 52) + 'px', transition: 'height 0.3s', cursor: b.count > 0 ? 'help' : 'default' }} />
                        ))
                      })()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>0</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Score →</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>1.0</span>
                    </div>
                  </div>

                  {/* Summary stats */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {[
                      { label: 'Scored', value: String(menuScores.length) },
                      { label: 'Stars', value: String(menuScores.filter(s => s.performance_tier === 'star').length) },
                      { label: 'Puzzles', value: String(menuScores.filter(s => s.performance_tier === 'puzzle').length) },
                      { label: 'Dogs', value: String(menuScores.filter(s => s.performance_tier === 'dog').length) },
                    ].map(m => (
                      <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic' }}>{m.value}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Flash Revenue Widget ─────────────────────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>⚡ Flash Revenue Intelligence</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>Live triggers · intervention log · learning panel</p>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {flashData && (
                <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 99, border: '1px solid rgba(249,115,22,0.3)', background: 'rgba(249,115,22,0.1)', color: '#F97316' }}>
                  {flashData.mode === 'auto' ? '⚡ Auto mode' : '✋ Suggest mode'}
                </span>
              )}
              <button onClick={() => bid && fetch('/api/agents/flash-revenue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) }).then(() => void loadFlashData())} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(249,115,22,0.3)', background: 'transparent', color: '#F97316', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Run now
              </button>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            {flashLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Loading flash intelligence...</div>
            ) : !flashData || flashData.stats_7d.total_interventions === 0 ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>⚡</div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No interventions yet — the agent fires automatically every 15 min during trading hours</p>
              </div>
            ) : (
              <div>
                {/* Active intervention banner */}
                {flashData.active_intervention && (
                  <div style={{ background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.3)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#F97316', background: 'rgba(249,115,22,0.15)', padding: '2px 8px', borderRadius: 99, textTransform: 'capitalize' }}>
                          LIVE · {flashData.active_intervention.intervention_type.replace(/_/g, ' ')}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                          triggered by {flashData.active_intervention.triggered_by.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0 }}>
                        {flashData.active_intervention.message_text ?? '—'} · {flashData.active_intervention.target_count} targets
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, margin: '4px 0 0' }}>
                        Started {new Date(flashData.active_intervention.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {flashData.active_intervention.expires_at && ' · expires ' + new Date(flashData.active_intervention.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button onClick={() => void cancelFlashIntervention(flashData.active_intervention!.id)} disabled={cancellingFlash === flashData.active_intervention.id} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.08)', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      {cancellingFlash === flashData.active_intervention.id ? 'Cancelling...' : 'Cancel'}
                    </button>
                  </div>
                )}

                {/* 7-day stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                  {[
                    { label: 'Interventions (7d)', value: String(flashData.stats_7d.total_interventions) },
                    { label: 'Measured', value: String(flashData.stats_7d.measured_count) },
                    { label: 'Avg Revenue Lift', value: flashData.stats_7d.avg_lift_pct !== null ? flashData.stats_7d.avg_lift_pct + '%' : '—' },
                    { label: 'Top Trigger', value: Object.entries(flashData.stats_7d.by_trigger).sort((a, b) => b[1] - a[1])[0]?.[0]?.replace(/_/g, ' ') ?? '—' },
                  ].map(m => (
                    <div key={m.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 22, color: '#F97316', margin: '0 0 4px' }}>{m.value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize' }}>{m.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                  {/* Intervention log */}
                  <div>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Recent Interventions</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                      {flashData.interventions.slice(0, 10).map(inv => (
                        <div key={inv.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#F97316', textTransform: 'capitalize' }}>
                              {inv.intervention_type.replace(/_/g, ' ')}
                            </span>
                            {inv.revenue_lift_pct !== null && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: (inv.revenue_lift_pct ?? 0) >= 0 ? '#7FB897' : '#EF4444' }}>
                                {(inv.revenue_lift_pct ?? 0) >= 0 ? '+' : ''}{inv.revenue_lift_pct}% lift
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                            {inv.triggered_by.replace(/_/g, ' ')} · {inv.target_count} targets · {new Date(inv.executed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} {new Date(inv.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Learning panel */}
                  <div>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Learning — Success Rates</h4>
                    {Object.keys(flashData.success_rates).length === 0 ? (
                      <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Not enough data yet — rates update as outcomes are measured</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {Object.entries(flashData.success_rates).sort((a, b) => b[1] - a[1]).map(([type, rate]) => (
                          <div key={type}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' }}>{type.replace(/_/g, ' ')}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: rate >= 0 ? '#7FB897' : '#EF4444' }}>
                                {rate >= 0 ? '+' : ''}{rate}%
                              </span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: Math.min(100, Math.abs(rate)) + '%', height: '100%', background: rate >= 0 ? '#7FB897' : '#EF4444', borderRadius: 2 }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Supplier Negotiation Widget ──────────────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>🤝 Supplier Intelligence</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>Leverage scores · price creep detection · AI negotiation briefs</p>
            </div>
            <button onClick={() => void loadNegotiationData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,165,0,0.3)', background: 'transparent', color: '#FFA500', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
          <div style={{ padding: 24 }}>
            {negLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Loading supplier intelligence...</div>
            ) : negProfiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No supplier data yet — agent runs on the 1st of each month using invoice history
              </div>
            ) : (
              <div>
                {/* Portfolio summary */}
                {negSummary && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                    <div style={{ background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: '#FFA500', fontWeight: 700, marginBottom: 4 }}>TOTAL OPPORTUNITY</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 24, color: '#FFA500' }}>${(negSummary.total_opportunity_annual ?? 0).toFixed(0)}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>annual savings potential</div>
                    </div>
                    <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: '#7FB897', fontWeight: 700, marginBottom: 4 }}>WON THIS YEAR</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 24, color: '#7FB897' }}>${negWonSavings.toFixed(0)}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>in negotiated savings</div>
                    </div>
                    <div style={{ background: negSummary.urgent_count > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (negSummary.urgent_count > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.08)'), borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: negSummary.urgent_count > 0 ? '#EF4444' : 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>ACTION NEEDED</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 24, color: negSummary.urgent_count > 0 ? '#EF4444' : '#fff' }}>{negSummary.urgent_count + negSummary.high_count}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{negSummary.urgent_count} urgent · {negSummary.high_count} high</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>SUPPLIERS TRACKED</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 24, color: '#fff' }}>{negSummary.total_suppliers}</div>
                      {negSummary.strongest_position && (
                        <div style={{ fontSize: 11, color: '#7FB897', marginTop: 2 }}>Best: {negSummary.strongest_position.supplier_name} ({negSummary.strongest_position.leverage_score})</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Supplier profiles table */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Supplier Profiles</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {negProfiles.slice(0, 8).map(p => {
                      const priorityColor = p.negotiation_priority === 'urgent' ? '#EF4444' : p.negotiation_priority === 'high' ? '#F59E0B' : p.negotiation_priority === 'medium' ? '#7FB897' : 'rgba(255,255,255,0.3)'
                      const brief = negBriefs.find(b => b.supplier_name === p.supplier_name && (b.status === 'pending' || b.status === 'in_progress'))
                      return (
                        <div key={p.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', cursor: brief ? 'pointer' : 'default' }} onClick={() => brief && setExpandedBriefId(expandedBriefId === brief.id ? null : brief.id)}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{p.supplier_name}</span>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: priorityColor + '22', color: priorityColor, fontWeight: 700, textTransform: 'uppercase' }}>{p.negotiation_priority}</span>
                                {brief && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: 'rgba(255,165,0,0.15)', color: '#FFA500', fontWeight: 700 }}>Brief ready</span>}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                ${Number(p.total_spend_12m).toFixed(0)}/yr · Leverage {p.leverage_score}/100
                                {Number(p.price_creep_pct) > 0 ? ' · ' + Number(p.price_creep_pct).toFixed(1) + '% price creep' : ''}
                                {p.overcharge_count_12m > 0 ? ' · ' + p.overcharge_count_12m + ' overcharges' : ''}
                              </div>
                            </div>
                            <div style={{ marginLeft: 12 }}>
                              <div style={{ height: 6, width: 80, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: p.leverage_score + '%', height: '100%', background: p.leverage_score >= 70 ? '#7FB897' : p.leverage_score >= 50 ? '#F59E0B' : '#EF4444', borderRadius: 3 }} />
                              </div>
                            </div>
                          </div>
                          {/* Brief detail expanded */}
                          {brief && expandedBriefId === brief.id && (
                            <div style={{ margin: '4px 0 8px', padding: '16px', background: 'rgba(255,165,0,0.05)', border: '1px solid rgba(255,165,0,0.15)', borderRadius: 10 }}>
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#FFA500', marginBottom: 4 }}>NEGOTIATION GOAL</div>
                                <div style={{ fontSize: 13, color: '#fff' }}>{brief.negotiation_goal}</div>
                              </div>
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>EXPECTED OUTCOME</div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{brief.expected_outcome}</div>
                                <div style={{ fontSize: 12, color: '#7FB897', marginTop: 4 }}>
                                  ${brief.monthly_saving_if_successful.toFixed(0)}/month · ${brief.annual_saving_if_successful.toFixed(0)}/year if successful · {Math.round(brief.success_probability * 100)}% success probability
                                </div>
                              </div>
                              {brief.leverage_arguments && brief.leverage_arguments.length > 0 && (
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>LEVERAGE ARGUMENTS</div>
                                  {brief.leverage_arguments.slice(0, 4).map((arg, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                                      <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: arg.strength === 'strong' ? 'rgba(127,184,151,0.2)' : arg.strength === 'medium' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.1)', color: arg.strength === 'strong' ? '#7FB897' : arg.strength === 'medium' ? '#F59E0B' : 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>{arg.strength}</span>
                                      <div>
                                        <div style={{ fontSize: 12, color: '#fff' }}>{arg.argument}</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{arg.data_point}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {brief.draft_email_subject && (
                                <div style={{ marginBottom: 12 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>DRAFT EMAIL</div>
                                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 12 }}>
                                    <div style={{ fontSize: 12, color: '#FFA500', marginBottom: 6 }}>Subject: {brief.draft_email_subject}</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'hidden' }}>{brief.draft_email_body}</div>
                                  </div>
                                </div>
                              )}
                              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button disabled={updatingBriefId === brief.id} onClick={async () => { setUpdatingBriefId(brief.id); await fetch('/api/agents/negotiation/briefs/' + brief.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) }); setUpdatingBriefId(null); void loadNegotiationData() }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#F59E0B', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  {updatingBriefId === brief.id ? '...' : "I've started negotiating"}
                                </button>
                                <button disabled={updatingBriefId === brief.id} onClick={async () => { setUpdatingBriefId(brief.id); await fetch('/api/agents/negotiation/briefs/' + brief.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'won', outcome_notes: 'Won' }) }); setUpdatingBriefId(null); void loadNegotiationData() }} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#7FB897', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  Won ✓
                                </button>
                                <button disabled={updatingBriefId === brief.id} onClick={async () => { setUpdatingBriefId(brief.id); await fetch('/api/agents/negotiation/briefs/' + brief.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'lost' }) }); setUpdatingBriefId(null); void loadNegotiationData() }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  Lost
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Waste Elimination Widget ─────────────────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>♻️ Waste Elimination</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>Prep guide · prediction accuracy · waste saved via flash promos</p>
            </div>
            <button onClick={() => void loadWasteData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
          <div style={{ padding: 24 }}>
            {wasteLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Loading waste data...</div>
            ) : !wasteData || (wasteData.today_predictions.length === 0 && wasteData.tomorrow_predictions.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                No prep predictions yet — set shelf_life_hours or prep_time_minutes on products to enable waste tracking
              </div>
            ) : (
              <div>
                {/* Summary stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
                  <div style={{ background: 'rgba(127,184,151,0.08)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: '#7FB897', fontWeight: 700, marginBottom: 4 }}>WASTE SAVED (30 DAYS)</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#7FB897' }}>${(wasteData.waste_saved_this_month ?? 0).toFixed(0)}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>via flash promotions</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>PREDICTION ACCURACY</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#fff' }}>
                      {wasteData.accuracy_this_month !== null ? wasteData.accuracy_this_month + '%' : '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>last 30 days</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>ITEMS TRACKED</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#fff' }}>{wasteData.tomorrow_predictions.length}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>products tomorrow</div>
                  </div>
                </div>

                {/* Tomorrow's prep guide */}
                {wasteData.tomorrow_predictions.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Tomorrow&apos;s Prep Guide</h4>
                    {wasteData.tomorrow_predictions[0].prep_guide_narrative && (
                      <div style={{ background: 'rgba(45,82,64,0.15)', border: '1px solid rgba(45,82,64,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, fontStyle: 'italic' }}>
                        {wasteData.tomorrow_predictions[0].prep_guide_narrative}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {wasteData.tomorrow_predictions.slice(0, 8).map(p => (
                        <div key={p.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div>
                            <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{p.pos_products?.name ?? p.product_id}</span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 8 }}>{p.recommended_prep_time}</span>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#7FB897' }}>{p.recommended_prep_qty} units</span>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{Math.round(p.prediction_confidence * 100)}% conf</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Labour Optimisation Widget ───────────────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>👷 Labour Optimisation</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>Live labour % · roster gap forecast · shift offer queue</p>
            </div>
            <button onClick={() => void loadLabourData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(245,158,11,0.3)', background: 'transparent', color: '#F59E0B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Refresh
            </button>
          </div>
          <div style={{ padding: 24 }}>
            {labourLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Loading labour data...</div>
            ) : (
              <div>
                {/* Live Labour % */}
                {labourRealtime && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                    <div style={{ background: labourRealtime.over_threshold ? 'rgba(239,68,68,0.1)' : 'rgba(127,184,151,0.1)', border: '1px solid ' + (labourRealtime.over_threshold ? 'rgba(239,68,68,0.3)' : 'rgba(127,184,151,0.3)'), borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: labourRealtime.over_threshold ? '#EF4444' : '#7FB897', fontWeight: 700, marginBottom: 4 }}>LIVE LABOUR %{labourRealtime.over_threshold ? ' ⚠' : ''}</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: labourRealtime.over_threshold ? '#EF4444' : '#7FB897' }}>{labourRealtime.labour_pct}%</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Target {labourRealtime.target_pct}% · Alert {labourRealtime.threshold_pct}%</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>ACTIVE STAFF</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#fff' }}>{labourRealtime.active_staff_count}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>clocked in now</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginBottom: 4 }}>LABOUR COST TODAY</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#fff' }}>${labourRealtime.cost_so_far.toFixed(0)}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Revenue: ${labourRealtime.revenue_today.toFixed(0)}</div>
                    </div>
                    <div style={{ background: labourPotentialSaving && labourPotentialSaving > 0 ? 'rgba(127,184,151,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (labourPotentialSaving && labourPotentialSaving > 0 ? 'rgba(127,184,151,0.2)' : 'rgba(255,255,255,0.08)'), borderRadius: 12, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, color: '#7FB897', fontWeight: 700, marginBottom: 4 }}>PENDING SAVINGS</div>
                      <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 28, color: '#7FB897' }}>${(labourPotentialSaving ?? 0).toFixed(0)}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>awaiting staff response</div>
                    </div>
                  </div>
                )}
                {/* Action Queue */}
                {labourActions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                    No labour actions yet — agent runs nightly to generate roster recommendations
                  </div>
                ) : (
                  <div>
                    <h4 style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: 1 }}>Shift Offer Queue (last 30 days)</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {labourActions.slice(0, 10).map(a => {
                        const statusColor = a.staff_response === 'accepted' ? '#7FB897' : a.staff_response === 'declined' ? '#EF4444' : '#F59E0B'
                        const statusLabel = a.staff_response === 'accepted' ? 'Accepted' : a.staff_response === 'declined' ? 'Declined' : 'Pending'
                        const staffName = a.staff_members ? a.staff_members.first_name + ' ' + a.staff_members.last_name : 'All staff'
                        const hours = a.target_hour_start !== null && a.target_hour_end !== null ? a.target_hour_start + ':00–' + a.target_hour_end + ':00' : ''
                        return (
                          <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{a.action_type.replace(/_/g, ' ')}</span>
                                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: statusColor + '22', color: statusColor, fontWeight: 700 }}>{statusLabel}</span>
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                                {staffName}{hours ? ' · ' + hours : ''}{a.target_date ? ' · ' + a.target_date : ''}
                              </div>
                              {a.message_sent && (
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontStyle: 'italic' }}>"{a.message_sent.slice(0, 80)}{a.message_sent.length > 80 ? '…' : ''}"</div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right', marginLeft: 12 }}>
                              {a.labour_cost_saving ? (
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#7FB897' }}>${Number(a.labour_cost_saving).toFixed(0)} saved</div>
                              ) : null}
                              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{new Date(a.executed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Customer Intelligence (CLV) Widget ──────────────────────────── */}
        <div style={{ marginTop: 24, background: surface, border, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>💎 Customer Intelligence</h3>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>CLV tiers · minimum effective offers · intervention queue</p>
            </div>
            <button onClick={() => bid && fetch('/api/agents/clv/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) }).then(() => void loadClvData())} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)', background: 'transparent', color: '#8B5CF6', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Run CLV analysis
            </button>
          </div>

          <div style={{ padding: 24 }}>
            {clvLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 32 }}>Analysing customer lifetime values...</div>
            ) : !clvPortfolio ? (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>💎</div>
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginBottom: 16 }}>No CLV data yet — run the analysis to score your customers</p>
                <button onClick={() => bid && fetch('/api/agents/clv/trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ business_id: bid }) }).then(() => void loadClvData())} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Analyse now
                </button>
              </div>
            ) : (
              <div>
                {/* Portfolio summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setClvTierFilter(clvTierFilter === 'champion' ? '' : 'champion'); void loadClvData() }}>
                    <div style={{ fontSize: 11, color: '#F59E0B', fontWeight: 700, marginBottom: 4 }}>CHAMPIONS ⭐</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 20, color: '#F59E0B' }}>{clvPortfolio.champion_count}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>${Math.round(clvPortfolio.avg_clv_champion ?? 0)}/yr avg</div>
                  </div>
                  <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setClvTierFilter(clvTierFilter === 'at_risk' ? '' : 'at_risk'); void loadClvData() }}>
                    <div style={{ fontSize: 11, color: '#EF4444', fontWeight: 700, marginBottom: 4 }}>⚠ AT RISK</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 20, color: '#EF4444' }}>{clvPortfolio.at_risk_count}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>${Math.round(clvPortfolio.at_risk_annual_revenue)} at risk</div>
                  </div>
                  <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setClvTierFilter(clvTierFilter === 'potential' ? '' : 'potential'); void loadClvData() }}>
                    <div style={{ fontSize: 11, color: '#8B5CF6', fontWeight: 700, marginBottom: 4 }}>↑ POTENTIAL</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 20, color: '#8B5CF6' }}>{clvPortfolio.potential_count}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>+${Math.round(clvPortfolio.if_rising_stars_add_1_visit)}/mo if +1 visit</div>
                  </div>
                  <div style={{ background: 'rgba(107,114,128,0.08)', border: '1px solid rgba(107,114,128,0.2)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => { setClvTierFilter(clvTierFilter === 'dormant' ? '' : 'dormant'); void loadClvData() }}>
                    <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, marginBottom: 4 }}>DORMANT 💤</div>
                    <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 20, color: '#9CA3AF' }}>{clvPortfolio.dormant_count}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>last active 60–180 days</div>
                  </div>
                </div>

                {/* Rising stars callout */}
                {clvPortfolio.potential_count > 0 && clvPortfolio.if_rising_stars_add_1_visit > 0 && (
                  <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ fontSize: 24 }}>🚀</span>
                    <div>
                      <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>
                        If your {clvPortfolio.potential_count} potential customers visited once more per month: <span style={{ color: '#8B5CF6' }}>+${Math.round(clvPortfolio.if_rising_stars_add_1_visit)}/month</span>
                      </p>
                      <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '4px 0 0' }}>
                        Top 20% of customers generate {clvPortfolio.top_20_pct_revenue_share}% of predicted revenue · {clvPortfolio.total_customer_count} customers scored
                      </p>
                    </div>
                  </div>
                )}

                {/* Tier distribution bar */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    {[
                      { tier: 'champion', count: clvPortfolio.champion_count, color: '#F59E0B' },
                      { tier: 'loyal', count: clvPortfolio.loyal_count, color: '#7FB897' },
                      { tier: 'potential', count: clvPortfolio.potential_count, color: '#8B5CF6' },
                      { tier: 'at_risk', count: clvPortfolio.at_risk_count, color: '#EF4444' },
                      { tier: 'dormant', count: clvPortfolio.dormant_count, color: '#6B7280' },
                      { tier: 'lost', count: clvPortfolio.lost_count, color: '#374151' },
                    ].filter(s => s.count > 0).map(seg => (
                      <div
                        key={seg.tier}
                        title={seg.tier + ': ' + seg.count + ' customers'}
                        onClick={() => { setClvTierFilter(clvTierFilter === seg.tier ? '' : seg.tier); void loadClvData() }}
                        style={{ flex: seg.count, background: seg.color, cursor: 'pointer', transition: 'opacity 0.15s', opacity: clvTierFilter && clvTierFilter !== seg.tier ? 0.3 : 1 }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
                    {[
                      { tier: 'champion', label: 'Champions', color: '#F59E0B', count: clvPortfolio.champion_count },
                      { tier: 'loyal', label: 'Loyal', color: '#7FB897', count: clvPortfolio.loyal_count },
                      { tier: 'potential', label: 'Potential', color: '#8B5CF6', count: clvPortfolio.potential_count },
                      { tier: 'at_risk', label: 'At risk', color: '#EF4444', count: clvPortfolio.at_risk_count },
                      { tier: 'dormant', label: 'Dormant', color: '#6B7280', count: clvPortfolio.dormant_count },
                    ].map(seg => (
                      <button key={seg.tier} onClick={() => { setClvTierFilter(clvTierFilter === seg.tier ? '' : seg.tier); void loadClvData() }} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, display: 'inline-block' }} />
                        <span style={{ fontSize: 11, color: clvTierFilter === seg.tier ? '#fff' : 'rgba(255,255,255,0.4)' }}>{seg.label} ({seg.count})</span>
                      </button>
                    ))}
                    {clvTierFilter && <button onClick={() => { setClvTierFilter(''); void loadClvData() }} style={{ fontSize: 11, color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear filter</button>}
                  </div>
                </div>

                {/* Intervention queue */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>
                    Intervention Queue {clvTierFilter ? '— ' + clvTierFilter.replace('_', ' ') : '— urgent & high priority'}
                  </h4>
                  {clvOpportunities.filter(op => !skippedClvIds.has(op.id)).length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>No pending interventions{clvTierFilter ? ' in this tier' : ''}</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {clvOpportunities.filter(op => !skippedClvIds.has(op.id)).slice(0, 8).map(op => {
                        const isSent = sentClvIds.has(op.id) || !!op.intervention_sent_at
                        const isExpanded = expandedClvId === op.id
                        const TIER_COLORS: Record<string, string> = { champion: '#F59E0B', loyal: '#7FB897', potential: '#8B5CF6', at_risk: '#EF4444', dormant: '#6B7280', lost: '#374151' }
                        const tierColor = TIER_COLORS[op.clv_tier] ?? '#6B7280'

                        return (
                          <div key={op.id} style={{ background: isSent ? 'rgba(45,82,64,0.2)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (isSent ? 'rgba(127,184,151,0.3)' : 'rgba(255,255,255,0.08)'), borderRadius: 12, padding: '14px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: tierColor, background: tierColor + '18', padding: '2px 8px', borderRadius: 99, textTransform: 'capitalize' }}>
                                    {op.clv_tier.replace('_', ' ')}
                                  </span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: op.intervention_priority === 'urgent' ? '#EF4444' : '#F97316' }}>
                                    {op.intervention_priority === 'urgent' ? '🔴' : '🟠'} {op.intervention_priority}
                                  </span>
                                  {isSent && <span style={{ fontSize: 11, color: '#7FB897' }}>✓ Sent</span>}
                                </div>
                                <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 3px' }}>
                                  {op.pos_customers?.name ?? 'Customer'}
                                </p>
                                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: 0 }}>
                                  Last visited {op.days_since_last_visit} days ago · avg basket ${op.avg_basket_size?.toFixed(2) ?? '—'} · ${Math.round(op.predicted_annual_revenue)}/yr predicted
                                </p>
                                {op.recommended_message && (
                                  <div style={{ marginTop: 8 }}>
                                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: 0, fontStyle: 'italic' }}>
                                      "{isExpanded ? op.recommended_message : (op.recommended_message.slice(0, 80) + (op.recommended_message.length > 80 ? '...' : ''))}"
                                    </p>
                                    {op.recommended_message.length > 80 && (
                                      <button onClick={() => setExpandedClvId(isExpanded ? null : op.id)} style={{ fontSize: 11, color: '#8B5CF6', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 0', display: 'block' }}>
                                        {isExpanded ? 'Show less' : 'See full message'}
                                      </button>
                                    )}
                                  </div>
                                )}
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '6px 0 0', textTransform: 'capitalize' }}>
                                  Offer: {op.recommended_offer_type.replace(/_/g, ' ')}{op.recommended_offer_value ? ' · ' + (op.recommended_offer_type === 'points_bonus' ? op.recommended_offer_value + 'x points' : op.recommended_offer_value + '% off') : ''}
                                </p>
                              </div>
                              {!isSent && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 12, flexShrink: 0 }}>
                                  <button
                                    onClick={() => void sendClvIntervention(op.id)}
                                    disabled={sendingClvId === op.id}
                                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#8B5CF6', color: '#fff', fontSize: 12, fontWeight: 600, cursor: sendingClvId === op.id ? 'default' : 'pointer', opacity: sendingClvId === op.id ? 0.6 : 1 }}
                                  >
                                    {sendingClvId === op.id ? 'Sending...' : 'Send now'}
                                  </button>
                                  <button
                                    onClick={() => setSkippedClvIds(prev => new Set([...prev, op.id]))}
                                    style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 12, cursor: 'pointer' }}
                                  >
                                    Skip
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Intervention performance */}
                {clvPortfolio.interventions_sent > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '14px 18px' }}>
                    <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Intervention Performance</h4>
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
                      {clvPortfolio.interventions_sent} messages sent · {clvPortfolio.interventions_responded} responded ({clvPortfolio.response_rate_pct}%) · ${Math.round(clvPortfolio.revenue_attributed_to_interventions)} attributed
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── CUSTOMER ACQUISITION / AEO WIDGET ────────────────────── */}
        <div style={{ background: surface, border, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>Customer Acquisition (AEO)</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '2px 0 0' }}>Answer Engine Optimisation · AI search visibility · Content generation</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={runningAcq}
                onClick={async () => {
                  setRunningAcq(true)
                  await fetch('/api/agents/acquisition/run', { method: 'POST' })
                  setRunningAcq(false)
                  void loadAcquisitionData()
                }}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: runningAcq ? 0.6 : 1 }}
              >{runningAcq ? 'Analysing...' : 'Run AEO Analysis'}</button>
              <button onClick={() => void loadAcquisitionData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
            </div>
          </div>

          {acqLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading AEO data...</p>
          ) : acqProfile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* AEO Score gauge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 48, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic', color: acqProfile.overall_aeo_score >= 70 ? '#7FB897' : acqProfile.overall_aeo_score >= 40 ? '#F59E0B' : '#EF4444', lineHeight: 1 }}>{acqProfile.overall_aeo_score}</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>/100 AEO Score</div>
                  <div style={{ fontSize: 11, marginTop: 4, color: acqProfile.overall_aeo_score >= 70 ? '#7FB897' : acqProfile.overall_aeo_score >= 40 ? '#F59E0B' : '#EF4444', fontWeight: 600 }}>
                    {acqProfile.overall_aeo_score >= 70 ? 'High visibility' : acqProfile.overall_aeo_score >= 40 ? 'Moderate' : 'Low visibility'}
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { label: 'Google Profile', score: acqProfile.google_business_score, max: 40 },
                    { label: 'Reviews', score: acqProfile.review_velocity_score, max: 35 },
                    { label: 'Content freshness', score: acqProfile.content_freshness_score, max: 25 },
                  ].map(dim => (
                    <div key={dim.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, width: 110, flexShrink: 0 }}>{dim.label}</span>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: Math.min(100, dim.score) + '%', background: dim.score >= 70 ? '#7FB897' : dim.score >= 40 ? '#F59E0B' : '#EF4444', borderRadius: 3 }} />
                      </div>
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, width: 45, textAlign: 'right', flexShrink: 0 }}>{dim.score}/{dim.max}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top recommendations */}
              {acqProfile.improvement_recommendations && acqProfile.improvement_recommendations.length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Top Improvements</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {acqProfile.improvement_recommendations.slice(0, 4).map((rec, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600, flexShrink: 0, background: rec.impact === 'high' ? 'rgba(239,68,68,0.15)' : rec.impact === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(127,184,151,0.15)', color: rec.impact === 'high' ? '#EF4444' : rec.impact === 'medium' ? '#F59E0B' : '#7FB897' }}>{rec.impact}</span>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 }}>{rec.action}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, flexShrink: 0 }}>{rec.effort}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI search test results */}
              {acqAeoSnaps.length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>AI Search Visibility</h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                    {acqAeoSnaps.slice(0, 6).map((snap, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                        <span style={{ fontSize: 12 }}>{snap.appeared ? '✅' : '❌'}</span>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{snap.query}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Content queue */}
              {acqContent.filter(c => !c.published_at).length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Content Queue</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {acqContent.filter(c => !c.published_at).slice(0, 3).map(piece => (
                      <div key={piece.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(127,184,151,0.15)', color: '#7FB897' }}>{piece.content_type.replace('_', ' ')}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(piece.content).catch(() => {})
                              fetch('/api/agents/acquisition/content?id=' + piece.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published_to: ['copied'], published_at: new Date().toISOString() }) }).then(() => void loadAcquisitionData()).catch(() => {})
                            }}
                            style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 10, cursor: 'pointer' }}
                          >Copy</button>
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0, lineHeight: 1.5 }}>{piece.content.slice(0, 120)}{piece.content.length > 120 ? '...' : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, margin: '0 0 12px' }}>No AEO profile yet. Run analysis to start.</p>
              <button
                disabled={runningAcq}
                onClick={async () => { setRunningAcq(true); await fetch('/api/agents/acquisition/run', { method: 'POST' }); setRunningAcq(false); void loadAcquisitionData() }}
                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#2D5240', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >{runningAcq ? 'Analysing...' : 'Run First AEO Analysis'}</button>
            </div>
          )}
        </div>

        {/* ── FINANCIAL RECONCILIATION WIDGET ───────────────────────── */}
        <div style={{ background: surface, border, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>Financial Reconciliation</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '2px 0 0' }}>Daily POS vs bank · Anomaly detection · Monthly P&amp;L</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {reconUnresolved > 0 && (
                <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                  {reconUnresolved} unresolved
                </span>
              )}
              <button onClick={() => void loadReconciliationData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
            </div>
          </div>

          {reconLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading reconciliation data...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: '7-Day Variance', value: '$' + reconTotalVariance7d.toFixed(0), color: reconTotalVariance7d > 100 ? '#EF4444' : '#7FB897' },
                  { label: 'Open Anomalies', value: String(reconAnomalies.length), color: reconAnomalies.length > 0 ? '#F59E0B' : '#7FB897' },
                  { label: 'Days Reconciled', value: String(reconDays.filter(d => d.status === 'balanced').length), color: '#7FB897' },
                ].map(s => (
                  <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                    <div style={{ color: s.color, fontSize: 22, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{s.value}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Last 7 days daily dots */}
              {reconDays.slice(0, 7).length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Last 7 Days</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {reconDays.slice(0, 7).map(day => (
                      <div key={day.id}>
                        <div
                          onClick={() => setReconExpandedDay(reconExpandedDay === day.id ? null : day.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: 10, color: day.status === 'balanced' ? '#7FB897' : day.status === 'variance' ? '#EF4444' : '#F59E0B' }}>●</span>
                          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 }}>{day.recon_date}</span>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>POS ${Number(day.pos_sales_total).toFixed(0)}</span>
                          {Math.abs(Number(day.variance_amount)) > 0.01 && (
                            <span style={{ color: '#EF4444', fontSize: 11, fontWeight: 600 }}>Δ${Math.abs(Number(day.variance_amount)).toFixed(0)}</span>
                          )}
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: day.status === 'balanced' ? 'rgba(127,184,151,0.15)' : day.status === 'variance' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: day.status === 'balanced' ? '#7FB897' : day.status === 'variance' ? '#EF4444' : '#F59E0B' }}>{day.status}</span>
                        </div>
                        {reconExpandedDay === day.id && (
                          <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: '0 0 8px 8px', marginTop: 2 }}>
                            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 4px' }}>Bank source: {day.bank_data_source} · Bank total: ${Number(day.bank_deposits_total).toFixed(2)}</p>
                            {day.explanation && <p style={{ color: '#7FB897', fontSize: 12, margin: 0 }}>Note: {day.explanation}</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Anomalies */}
              {reconAnomalies.length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Expense Anomalies</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {reconAnomalies.slice(0, 5).map(anomaly => (
                      <div key={anomaly.id} style={{ background: (anomaly.deviation_pct ?? 0) >= 200 ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid ' + ((anomaly.deviation_pct ?? 0) >= 200 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'), borderRadius: 8, padding: '10px 12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 2px' }}>{anomaly.expense_description ?? anomaly.expense_category}</p>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: 0 }}>{anomaly.deviation_pct}% above normal · ${Number(anomaly.amount).toFixed(0)}</p>
                            {anomaly.possible_causes && anomaly.possible_causes.length > 0 && (
                              <p style={{ color: 'rgba(255,165,0,0.8)', fontSize: 11, margin: '4px 0 0' }}>Possible: {anomaly.possible_causes[0]}</p>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              disabled={resolvingAnomalyId === anomaly.id}
                              onClick={async () => {
                                setResolvingAnomalyId(anomaly.id)
                                await fetch('/api/agents/reconciliation/anomalies?id=' + anomaly.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'accepted' }) })
                                setResolvingAnomalyId(null)
                                void loadReconciliationData()
                              }}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 11, cursor: 'pointer' }}
                            >Accept</button>
                            <button
                              disabled={resolvingAnomalyId === anomaly.id}
                              onClick={async () => {
                                setResolvingAnomalyId(anomaly.id)
                                await fetch('/api/agents/reconciliation/anomalies?id=' + anomaly.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'error' }) })
                                setResolvingAnomalyId(null)
                                void loadReconciliationData()
                              }}
                              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444', fontSize: 11, cursor: 'pointer' }}
                            >Flag</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly P&L */}
              {reconPL.length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Monthly P&amp;L</h4>
                  {reconPL[0]?.summary_narrative && (
                    <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', fontStyle: 'italic', lineHeight: 1.5 }}>{reconPL[0].summary_narrative}</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {reconPL.slice(0, 6).map(report => (
                      <div key={report.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8 }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, width: 60, flexShrink: 0 }}>{report.period_month}/{report.period_year}</span>
                        <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: Math.min(100, Math.round((report.net_revenue / (reconPL[0]?.net_revenue || 1)) * 100)) + '%', background: '#7FB897', borderRadius: 3 }} />
                        </div>
                        <span style={{ color: '#fff', fontSize: 12, fontWeight: 600, width: 70, textAlign: 'right', flexShrink: 0 }}>${Math.round(report.net_revenue / 1000)}k</span>
                        <span style={{ color: Number(report.gross_margin_pct) > 50 ? '#7FB897' : '#F59E0B', fontSize: 11, width: 50, textAlign: 'right', flexShrink: 0 }}>{Number(report.gross_margin_pct).toFixed(1)}%</span>
                        <span style={{ color: report.revenue_vs_last_month_pct >= 0 ? '#7FB897' : '#EF4444', fontSize: 11, width: 45, textAlign: 'right', flexShrink: 0 }}>
                          {report.revenue_vs_last_month_pct >= 0 ? '+' : ''}{Number(report.revenue_vs_last_month_pct).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reconDays.length === 0 && !reconLoading && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Reconciliation starts automatically daily. First data appears tomorrow morning.</p>
              )}
            </div>
          )}
        </div>

        {/* ── REPUTATION DEFENCE WIDGET ─────────────────────────────── */}
        <div style={{ background: surface, border, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>Reputation Defence</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '2px 0 0' }}>Review monitoring · AI responses · AEO visibility</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {repAeoScore !== null && (
                <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: repAeoScore >= 60 ? 'rgba(127,184,151,0.15)' : 'rgba(245,158,11,0.15)', color: repAeoScore >= 60 ? '#7FB897' : '#F59E0B', border: '1px solid ' + (repAeoScore >= 60 ? 'rgba(127,184,151,0.3)' : 'rgba(245,158,11,0.3)') }}>
                  AI Visibility {repAeoScore}/100
                </span>
              )}
              <button onClick={() => void loadReputationData()} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Refresh
              </button>
            </div>
          </div>

          {repLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Loading reputation data...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Stats row */}
              {repStats && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Avg Rating', value: repStats.avg_rating ? repStats.avg_rating.toFixed(1) + ' ★' : '—', color: '#F59E0B' },
                    { label: 'Total Reviews', value: String(repStats.total_reviews), color: '#7FB897' },
                    { label: 'Pending Responses', value: String(repStats.pending_responses), color: repStats.pending_responses > 0 ? '#F97316' : '#7FB897' },
                    { label: 'This Week', value: '+' + String(repStats.this_week_count), color: '#7FB897' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
                      <div style={{ color: s.color, fontSize: 20, fontWeight: 700, fontFamily: 'Fraunces, serif', fontStyle: 'italic' }}>{s.value}</div>
                      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 2 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Review response queue */}
              {repReviews.filter(r => r.response_status === 'pending' && r.response_text).length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Response Queue</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {repReviews.filter(r => r.response_status === 'pending' && r.response_text).slice(0, 5).map(review => (
                      <div key={review.id} style={{ background: review.is_crisis ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.04)', border: '1px solid ' + (review.is_crisis ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)'), borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <span style={{ color: '#F59E0B', fontSize: 13 }}>{'★'.repeat(Math.round(review.rating))}</span>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginLeft: 8 }}>{review.reviewer_name ?? 'Anonymous'}</span>
                            {review.is_crisis && <span style={{ marginLeft: 8, fontSize: 11, color: '#EF4444', fontWeight: 600 }}>⚠ Crisis — manual review required</span>}
                            {review.sentiment && !review.is_crisis && (
                              <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', borderRadius: 4, background: review.sentiment === 'positive' ? 'rgba(127,184,151,0.15)' : review.sentiment === 'negative' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.08)', color: review.sentiment === 'positive' ? '#7FB897' : review.sentiment === 'negative' ? '#EF4444' : 'rgba(255,255,255,0.5)' }}>{review.sentiment}</span>
                            )}
                          </div>
                          {!review.is_crisis && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                disabled={repRespondingId === review.id}
                                onClick={async () => {
                                  setRepRespondingId(review.id)
                                  await fetch('/api/agents/reputation/respond/' + review.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }) })
                                  setRepRespondingId(null)
                                  void loadReputationData()
                                }}
                                style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#2D5240', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                              >Post</button>
                              <button
                                disabled={repRespondingId === review.id}
                                onClick={async () => {
                                  setRepRespondingId(review.id)
                                  await fetch('/api/agents/reputation/respond/' + review.id, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'skip' }) })
                                  setRepRespondingId(null)
                                  void loadReputationData()
                                }}
                                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 11, cursor: 'pointer' }}
                              >Skip</button>
                            </div>
                          )}
                        </div>
                        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 8px', lineHeight: 1.5 }}>"{(review.review_text ?? '').slice(0, 120)}{(review.review_text?.length ?? 0) > 120 ? '...' : ''}"</p>
                        {review.response_text && (
                          <div>
                            <button onClick={() => setRepExpandedId(repExpandedId === review.id ? null : review.id)} style={{ background: 'none', border: 'none', color: '#7FB897', fontSize: 11, cursor: 'pointer', padding: 0 }}>
                              {repExpandedId === review.id ? 'Hide AI draft ↑' : 'View AI draft ↓'}
                            </button>
                            {repExpandedId === review.id && (
                              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: '6px 0 0', padding: '8px 12px', background: 'rgba(127,184,151,0.06)', borderRadius: 6, lineHeight: 1.5, fontStyle: 'italic' }}>{review.response_text}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AEO Score */}
              {repAeoSnapshots.length > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px' }}>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>AI Search Visibility (AEO)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {repAeoSnapshots.map((snap, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{snap.appeared ? '✅' : '❌'}</span>
                        <div>
                          <span style={{ color: snap.appeared ? '#7FB897' : 'rgba(255,255,255,0.5)', fontSize: 12 }}>{snap.query}</span>
                          {!snap.appeared && snap.recommendations.length > 0 && (
                            <p style={{ color: 'rgba(255,165,0,0.8)', fontSize: 11, margin: '2px 0 0' }}>{snap.recommendations[0]}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review request funnel */}
              {repRequestStats && repRequestStats.sent > 0 && (
                <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px' }}>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Review Request Funnel</h4>
                  <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
                    {repRequestStats.sent} sent · {repRequestStats.opened} opened · {repRequestStats.clicked} clicked · {repRequestStats.reviews_received} reviews received
                  </p>
                </div>
              )}

              {repReviews.length === 0 && !repLoading && (
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No reviews synced yet. Make sure your Google Place ID is set in Settings.</p>
              )}
            </div>
          )}
        </div>

        {/* ── CASH FLOW INTELLIGENCE WIDGET ─────────────────────────── */}
        <div style={{ background: surface, border, borderRadius: 14, padding: 20, marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>Cash Flow Intelligence</h3>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: '2px 0 0' }}>14-week forecast · reorder cash impact · financing options</p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {finCurrentCash !== null && (
                <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, fontWeight: 600, background: finBankConnected ? 'rgba(127,184,151,0.12)' : 'rgba(245,158,11,0.12)', color: finBankConnected ? '#7FB897' : '#F59E0B', border: '1px solid ' + (finBankConnected ? 'rgba(127,184,151,0.3)' : 'rgba(245,158,11,0.3)') }}>
                  {finBankConnected ? 'Bank' : 'Est.'} ${Math.round(finCurrentCash).toLocaleString()}
                </span>
              )}
              <button
                disabled={finRunning}
                onClick={async () => {
                  setFinRunning(true)
                  await fetch('/api/agents/financing/run', { method: 'POST' }).catch(() => {})
                  setFinRunning(false)
                  void loadFinancingData()
                }}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(127,184,151,0.3)', background: 'transparent', color: '#7FB897', fontSize: 12, fontWeight: 600, cursor: finRunning ? 'default' : 'pointer', opacity: finRunning ? 0.6 : 1 }}
              >
                {finRunning ? 'Running...' : 'Rebuild'}
              </button>
            </div>
          </div>

          {finLoading ? (
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Building cash flow forecast...</p>
          ) : finWeeks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 12 }}>No forecast yet. Click Rebuild to generate your 14-week cash flow forecast.</p>
              {!finBankConnected && (
                <p style={{ color: 'rgba(245,158,11,0.7)', fontSize: 12 }}>Connect your bank account for accurate balance data (Settings → Bank Connection).</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Bank connection status */}
              <div style={{ padding: '8px 14px', borderRadius: 8, background: finBankConnected ? 'rgba(127,184,151,0.08)' : 'rgba(245,158,11,0.08)', border: '1px solid ' + (finBankConnected ? 'rgba(127,184,151,0.2)' : 'rgba(245,158,11,0.2)') }}>
                <p style={{ color: finBankConnected ? '#7FB897' : '#F59E0B', fontSize: 12, margin: 0 }}>
                  {finBankConnected
                    ? 'Cash position $' + Math.round(finCurrentCash ?? 0).toLocaleString() + ' (from bank feed)'
                    : 'Cash position estimated from POS revenue ($' + Math.round(finCurrentCash ?? 0).toLocaleString() + '). Connect your bank for accuracy.'}
                </p>
              </div>

              {/* 14-week visual chart */}
              <div>
                <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>14-Week Cash Position</h4>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 80 }}>
                  {finWeeks.map(w => {
                    const maxCash = Math.max(...finWeeks.map(x => x.closing_cash_position), 1)
                    const minCash = Math.min(...finWeeks.map(x => x.closing_cash_position), 0)
                    const range = Math.max(1, maxCash - minCash)
                    const heightPct = Math.max(4, Math.round(((w.closing_cash_position - minCash) / range) * 100))
                    const barColor = w.risk_level === 'critical' ? '#EF4444' : w.risk_level === 'high' ? '#F97316' : w.risk_level === 'medium' ? '#F59E0B' : '#7FB897'
                    const isExpanded = finExpandedWeek === w.week_number
                    return (
                      <div key={w.week_number} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'pointer' }} onClick={() => setFinExpandedWeek(isExpanded ? null : w.week_number)}>
                        <div style={{ width: '100%', height: heightPct + '%', background: barColor, borderRadius: '3px 3px 0 0', border: isExpanded ? '1px solid rgba(255,255,255,0.4)' : 'none', minHeight: 4, transition: 'all 0.2s' }} />
                        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>W{w.week_number}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                  {[['#7FB897', 'Safe'], ['#F59E0B', 'Watch'], ['#F97316', 'High risk'], ['#EF4444', 'Critical']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expanded week detail */}
              {finExpandedWeek !== null && (() => {
                const w = finWeeks.find(x => x.week_number === finExpandedWeek)
                if (!w) return null
                return (
                  <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h4 style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>Week {w.week_number} — {w.forecast_week}</h4>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: w.risk_level === 'critical' ? 'rgba(239,68,68,0.15)' : w.risk_level === 'high' ? 'rgba(249,115,22,0.15)' : w.risk_level === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(127,184,151,0.12)', color: w.risk_level === 'critical' ? '#EF4444' : w.risk_level === 'high' ? '#F97316' : w.risk_level === 'medium' ? '#F59E0B' : '#7FB897' }}>
                        {w.risk_level}
                      </span>
                    </div>
                    {w.risk_reason && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>{w.risk_reason}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {[
                        { label: 'Revenue (predicted)', value: '$' + Math.round(w.predicted_pos_revenue).toLocaleString(), color: '#7FB897' },
                        { label: 'Supplier payments', value: '$' + Math.round(w.predicted_supplier_payments).toLocaleString(), color: '#EF4444' },
                        { label: 'Payroll', value: '$' + Math.round(w.predicted_payroll).toLocaleString(), color: '#F97316' },
                        { label: 'Rent + Utilities', value: '$' + Math.round(w.predicted_rent_utilities).toLocaleString(), color: '#F97316' },
                        { label: 'Opening cash', value: '$' + Math.round(w.opening_cash_position).toLocaleString(), color: '#fff' },
                        { label: 'Closing cash', value: '$' + Math.round(w.closing_cash_position).toLocaleString(), color: w.closing_cash_position < 0 ? '#EF4444' : '#7FB897' },
                      ].map(item => (
                        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
                          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{item.label}</span>
                          <span style={{ color: item.color, fontSize: 11, fontWeight: 600 }}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                    {w.reorder_events.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reorder events this week</p>
                        {w.reorder_events.map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(239,68,68,0.06)', borderRadius: 5, marginBottom: 3 }}>
                            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{r.product_name} ({r.supplier_name})</span>
                            <span style={{ color: '#EF4444', fontSize: 11, fontWeight: 600 }}>-${Math.round(r.estimated_cost).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Critical week alerts */}
              {finWeeks.some(w => w.risk_level === 'critical' || w.risk_level === 'high') && (
                <div>
                  <h4 style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Cash Risk Alerts</h4>
                  {finWeeks.filter(w => w.risk_level === 'critical' || w.risk_level === 'high').map(w => (
                    <div key={w.week_number} style={{ background: w.risk_level === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)', border: '1px solid ' + (w.risk_level === 'critical' ? 'rgba(239,68,68,0.3)' : 'rgba(249,115,22,0.3)'), borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                      <p style={{ color: w.risk_level === 'critical' ? '#EF4444' : '#F97316', fontSize: 12, fontWeight: 600, margin: '0 0 4px' }}>
                        Week {w.week_number} ({w.forecast_week}) — ${Math.round(w.closing_cash_position).toLocaleString()} closing
                      </p>
                      {w.risk_reason && <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, margin: 0, lineHeight: 1.5 }}>{w.risk_reason}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Financing opportunities */}
              {finOpportunities.length > 0 && (
                <div>
                  <h4 style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>Financing Options</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {finOpportunities.filter(o => o.status === 'open').slice(0, 6).map(opp => {
                      const effortColor = opp.effort_level === 'automatic' ? '#7FB897' : opp.effort_level === 'one_tap' ? '#7FB897' : opp.effort_level === 'phone_call' ? '#F59E0B' : '#F97316'
                      const urgencyColor = opp.urgency === 'urgent' ? '#EF4444' : opp.urgency === 'this_week' ? '#F97316' : '#F59E0B'
                      return (
                        <div key={opp.id} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {opp.urgency && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: urgencyColor + '18', color: urgencyColor, border: '1px solid ' + urgencyColor + '44' }}>
                                  {opp.urgency.replace('_', ' ')}
                                </span>
                              )}
                              {opp.effort_level && (
                                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 99, background: effortColor + '15', color: effortColor }}>
                                  {opp.effort_level.replace('_', ' ')}
                                </span>
                              )}
                            </div>
                            {opp.potential_benefit && opp.potential_benefit > 0 && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#7FB897' }}>${Math.round(opp.potential_benefit).toLocaleString()}</span>
                            )}
                          </div>
                          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12, margin: '0 0 10px', lineHeight: 1.5 }}>{opp.description}</p>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              disabled={finActioning === opp.id}
                              onClick={async () => {
                                setFinActioning(opp.id)
                                await fetch('/api/agents/financing/opportunities?id=' + opp.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'actioned' }) }).catch(() => {})
                                setFinActioning(null)
                                void loadFinancingData()
                              }}
                              style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#2D5240', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: finActioning === opp.id ? 0.6 : 1 }}
                            >Done</button>
                            <button
                              disabled={finActioning === opp.id}
                              onClick={async () => {
                                setFinActioning(opp.id)
                                await fetch('/api/agents/financing/opportunities?id=' + opp.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }) }).catch(() => {})
                                setFinActioning(null)
                                void loadFinancingData()
                              }}
                              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.4)', fontSize: 11, cursor: 'pointer' }}
                            >Dismiss</button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        </div>
      )}

      {/* ── HISTORY TAB ─────────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {/* Summary banner */}
          <div style={{ background: 'rgba(45,82,64,0.2)', border: '1px solid rgba(127,184,151,0.2)', borderRadius: 12, padding: '14px 20px', marginBottom: 20 }}>
            <p style={{ color: '#7FB897', fontSize: 13, margin: 0 }}>
              Last 30 days: Aria made {history.reduce((s, h) => s + h.proposals_count, 0)} decisions ·
              Attributed revenue: ${Math.round(historyTotals.revenue)} ·
              Cost savings: ${Math.round(historyTotals.cost_saved)}
            </p>
          </div>

          {history.length === 0 ? (
            <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: 40 }}>No history yet — council runs daily at 6am AEST.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map(session => {
                const isExpanded = expandedHistory[session.id]
                return (
                  <div key={session.id} style={{ background: surface, border, borderRadius: 12, overflow: 'hidden' }}>
                    <button onClick={() => setExpandedHistory(prev => ({ ...prev, [session.id]: !prev[session.id] }))} style={{
                      width: '100%', padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                        <span style={{ background: '#2D5240', color: '#7FB897', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                          {session.session_date}
                        </span>
                        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                          {(session.plan_narrative ?? 'No narrative').slice(0, 80)}{(session.plan_narrative ?? '').length > 80 ? '...' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>
                          {session.proposals_count} proposals · {session.executed_actions} executed
                        </span>
                        {session.projected_revenue_impact > 0 && (
                          <ImpactChip dollars={session.projected_revenue_impact} />
                        )}
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isExpanded && session.proposals.length > 0 && (
                      <div style={{ padding: '0 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        {session.proposals.map((p: AgentCouncilProposal) => (
                          <div key={p.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <AgentBadge agentType={p.agent_type} />
                              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
                                {String(p.proposal_data.title ?? p.proposal_type.replace(/_/g, ' '))}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {p.projected_impact_dollars > 0 && <ImpactChip dollars={p.projected_impact_dollars} />}
                              {p.council_decision && (
                                <span style={{ fontSize: 11, color: p.council_decision === 'approved' ? '#7FB897' : p.council_decision === 'rejected' ? '#EF4444' : 'rgba(255,255,255,0.35)', fontWeight: 600 }}>
                                  {p.council_decision}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PERFORMANCE TAB ─────────────────────────────────────────────────── */}
      {tab === 'performance' && (
        <div>
          {/* Metric cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total actions', value: String(history.reduce((s, h) => s + h.executed_actions, 0)) },
              { label: 'Revenue attributed', value: '$' + Math.round(historyTotals.revenue) },
              { label: 'Cost saved', value: '$' + Math.round(historyTotals.cost_saved) },
              { label: 'Sessions run', value: String(history.length) },
            ].map(m => (
              <div key={m.label} style={{ background: surface, border, borderRadius: 12, padding: 20 }}>
                <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 0 8px' }}>{m.label}</p>
                <p style={{ fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic', fontSize: 26, color: '#7FB897', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Agent ROI table */}
          <div style={{ background: surface, border, borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: border }}>
              <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>Agent ROI — Last 30 days</h3>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: border }}>
                  {['Agent', 'Actions 30d', 'Revenue impact', 'Proposals', 'Status'].map(col => (
                    <th key={col} style={{ padding: '10px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {AGENT_CARDS.map(agent => {
                  const agentSessions = history.flatMap(h => h.proposals.filter((p: AgentCouncilProposal) => p.agent_type === agent.type))
                  const actions = agentSessions.filter((p: AgentCouncilProposal) => p.executed_at).length
                  const impact = agentSessions.reduce((s: number, p: AgentCouncilProposal) => s + Number(p.projected_impact_dollars ?? 0), 0)
                  return (
                    <tr key={agent.type} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{agent.icon}</span>
                          <span style={{ color: '#fff', fontSize: 13, fontWeight: 500 }}>{agent.label}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>{actions}</td>
                      <td style={{ padding: '12px 20px' }}>
                        {impact > 0 ? <ImpactChip dollars={impact} /> : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 20px', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>{agentSessions.length}</td>
                      <td style={{ padding: '12px 20px' }}>
                        <span style={{ fontSize: 11, color: '#7FB897', fontWeight: 600 }}>
                          {agentSettings[agent.type]?.enabled !== false ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INTELLIGENCE TAB ─────────────────────────────────────────────────── */}
      {tab === 'intelligence' && (
        <div>
          {intelLoading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', padding: 40, textAlign: 'center', fontSize: 13 }}>Loading intelligence data...</div>
          ) : (
            <>
              {/* Data Quality Card */}
              <div style={{ background: surface, border, borderRadius: 14, padding: 24, marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <h3 style={{ color: '#fff', fontSize: 15, fontWeight: 600, margin: 0 }}>Data Quality</h3>
                  {intelQuality && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                      background: intelQuality.overall_score >= 75 ? 'rgba(127,184,151,0.15)' : intelQuality.overall_score >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                      color: intelQuality.overall_score >= 75 ? '#7FB897' : intelQuality.overall_score >= 50 ? '#F59E0B' : '#F87171',
                    }}>
                      {intelQuality.overall_score}/100 · {intelQuality.hedge_level === 'none' ? 'Good' : intelQuality.hedge_level === 'light' ? 'Fair' : intelQuality.hedge_level === 'moderate' ? 'Limited' : 'Very Limited'}
                    </span>
                  )}
                </div>
                {intelQuality ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'POS Sales', score: intelQuality.pos_score },
                        { label: 'Customers', score: intelQuality.customer_score },
                        { label: 'Inventory', score: intelQuality.inventory_score },
                        { label: 'Staff', score: intelQuality.staff_score },
                        { label: 'Suppliers', score: intelQuality.supplier_score },
                      ].map(({ label, score }) => (
                        <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 0', textAlign: 'center' }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: score >= 75 ? '#7FB897' : score >= 50 ? '#F59E0B' : '#F87171', lineHeight: 1 }}>{score}</div>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          <div style={{ margin: '8px 8px 0', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                            <div style={{ height: '100%', borderRadius: 2, width: score + '%', background: score >= 75 ? '#7FB897' : score >= 50 ? '#F59E0B' : '#F87171', transition: 'width 0.8s' }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    {intelQuality.missing_critical.length > 0 && (
                      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                        <span style={{ color: '#F87171', fontWeight: 600 }}>Missing: </span>{intelQuality.missing_critical.join(' · ')}
                      </div>
                    )}
                    {intelQuality.reliability_statement && (
                      <div style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>{intelQuality.reliability_statement}</div>
                    )}
                  </>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>No quality data yet.</div>
                )}
              </div>

              {/* Memory Browser */}
              <div style={{ background: surface, border, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ padding: '16px 20px', borderBottom: border, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>Business Memory ({intelMemories.length})</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['all', 'fact', 'preference', 'decision', 'goal', 'concern', 'tried'].map(k => (
                      <button key={k} onClick={() => setMemKindFilter(k)} style={{
                        padding: '3px 10px', borderRadius: 99, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        background: memKindFilter === k ? '#2D5240' : 'rgba(255,255,255,0.06)',
                        color: memKindFilter === k ? '#fff' : 'rgba(255,255,255,0.4)',
                      }}>
                        {k === 'all' ? 'All' : k}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ maxHeight: 380, overflowY: 'auto' }}>
                  {intelMemories.filter(m => memKindFilter === 'all' || m.kind === memKindFilter).length === 0 ? (
                    <div style={{ padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>
                      {intelMemories.length === 0 ? 'No memories yet — they build up as you use Ask Aria.' : 'No memories of this type.'}
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: border }}>
                          {['Kind', 'Memory', 'Topic', 'Importance', ''].map(col => (
                            <th key={col} style={{ padding: '8px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {intelMemories.filter(m => memKindFilter === 'all' || m.kind === memKindFilter).map(mem => (
                          <tr key={mem.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
                                background: mem.kind === 'fact' ? 'rgba(96,165,250,0.15)' : mem.kind === 'decision' ? 'rgba(167,139,250,0.15)' : mem.kind === 'goal' ? 'rgba(127,184,151,0.15)' : mem.kind === 'concern' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                                color: mem.kind === 'fact' ? '#60A5FA' : mem.kind === 'decision' ? '#A78BFA' : mem.kind === 'goal' ? '#7FB897' : mem.kind === 'concern' ? '#F87171' : '#F59E0B',
                              }}>{mem.kind}</span>
                            </td>
                            <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.8)', fontSize: 12, lineHeight: 1.5, maxWidth: 380 }}>{mem.content}</td>
                            <td style={{ padding: '10px 16px', color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>{mem.topic ?? '—'}</td>
                            <td style={{ padding: '10px 16px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 32, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                                  <div style={{ height: '100%', borderRadius: 2, width: (mem.importance * 10) + '%', background: mem.importance >= 8 ? '#7FB897' : mem.importance >= 5 ? '#F59E0B' : '#6B7280' }} />
                                </div>
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{mem.importance}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 16px' }}>
                              <button onClick={() => forgetMemory(mem.id)} disabled={forgettingId === mem.id}
                                style={{ padding: '4px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#F87171', fontSize: 10, cursor: forgettingId === mem.id ? 'default' : 'pointer', fontFamily: 'inherit', opacity: forgettingId === mem.id ? 0.5 : 1 }}>
                                {forgettingId === mem.id ? '...' : 'Forget'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Council Quality */}
              <div style={{ background: surface, border, borderRadius: 14, overflow: 'hidden', marginBottom: 24 }}>
                <div style={{ padding: '16px 20px', borderBottom: border }}>
                  <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: 0 }}>Recent Council Runs</h3>
                </div>
                {intelRuns.length === 0 ? (
                  <div style={{ padding: 24, color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center' }}>No council runs yet.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: border }}>
                        {['Date', 'Mode', 'Model', 'Brains', 'Quality', 'Duration', 'Escalation'].map(col => (
                          <th key={col} style={{ padding: '8px 14px', textAlign: 'left', color: 'rgba(255,255,255,0.35)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {intelRuns.map(run => (
                        <tr key={run.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{new Date(run.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                          <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.6)', fontSize: 11, textTransform: 'capitalize' }}>{run.mode.replace(/_/g, ' ')}</td>
                          <td style={{ padding: '10px 14px', color: run.synthesis_model?.includes('sonnet') ? '#A78BFA' : 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                            {run.synthesis_model?.includes('opus') ? 'Expert' : run.synthesis_model?.includes('sonnet') ? 'Deep analysis' : 'Quick'}
                          </td>
                          <td style={{ padding: '10px 14px', color: run.brains_succeeded === 4 ? '#7FB897' : '#F59E0B', fontSize: 12 }}>{run.brains_succeeded}/4</td>
                          <td style={{ padding: '10px 14px' }}>
                            {run.data_quality_score != null ? (
                              <span style={{ fontSize: 11, color: run.data_quality_score >= 75 ? '#7FB897' : run.data_quality_score >= 50 ? '#F59E0B' : '#F87171', fontWeight: 600 }}>{run.data_quality_score}</span>
                            ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>{run.duration_ms ? Math.round(run.duration_ms / 1000) + 's' : '—'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {run.escalation_reason ? (
                              <span style={{ fontSize: 10, color: '#A78BFA', background: 'rgba(167,139,250,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                {run.escalation_reason.replace(/_/g, ' ').replace('question', '').trim()}
                              </span>
                            ) : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Conversation History */}
              <div style={{ background: surface, border, borderRadius: 14, padding: 20 }}>
                <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '0 0 16px' }}>Recent Conversation Summaries</h3>
                {intelSummaries.length === 0 ? (
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>No summaries yet — they are generated after Ask Aria conversations.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {intelSummaries.map(s => (
                      <div key={s.id} style={{ padding: 14, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#7FB897' }}>{new Date(s.conversation_date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textTransform: 'capitalize' }}>{s.mode.replace(/_/g, ' ')}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, marginBottom: 8 }}>{s.summary}</div>
                        {s.key_decisions?.length > 0 && (
                          <div style={{ fontSize: 11, color: '#A78BFA', marginBottom: 4 }}>
                            Decided: {s.key_decisions.join(' · ')}
                          </div>
                        )}
                        {s.followup_promised?.length > 0 && (
                          <div style={{ fontSize: 11, color: '#F59E0B' }}>
                            Follow up: {s.followup_promised.join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Reset menu agent confirmation modal */}
      {showResetModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1f18', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: 32, maxWidth: 460, width: '90%' }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Reset Menu Engineering Agent?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, margin: '0 0 8px' }}>
              This will clear all BCG scores, grid positions, upsell/bundle assignments, and learned weights.
            </p>
            <p style={{ color: 'rgba(239,68,68,0.7)', fontSize: 13, lineHeight: 1.5, margin: '0 0 24px' }}>
              ⚠ Your POS product grid will return to alphabetical order.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={resetMenuAgent} disabled={resetting} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#7F1D1D', color: '#fff', fontSize: 14, fontWeight: 600, cursor: resetting ? 'default' : 'pointer', opacity: resetting ? 0.7 : 1 }}>
                {resetting ? 'Resetting...' : 'Yes, reset'}
              </button>
              <button onClick={() => setShowResetModal(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto mode confirmation modal */}
      {showAutoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0d1f18', border: '1px solid rgba(127,184,151,0.3)', borderRadius: 16, padding: 32, maxWidth: 480, width: '90%' }}>
            <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>Enable Auto Mode?</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, lineHeight: 1.6, margin: '0 0 24px' }}>
              In Auto mode, Aria will execute approved proposals without asking for your confirmation. You can review outcomes in History and switch back to Suggest mode at any time.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => switchMode('auto')} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: 'none', background: '#2D5240', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Yes, enable Auto
              </button>
              <button onClick={() => setShowAutoModal(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: 14, cursor: 'pointer' }}>
                Keep Suggest
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
