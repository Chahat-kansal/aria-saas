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

type TabId = 'today' | 'agents' | 'history' | 'performance'
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
  const [menuScores, setMenuScores] = useState<Array<{ product_id: string; bcg_quadrant: string; composite_score: number; scored_at: string; pos_products: { name: string; price: number } | null }>>([])
  const [menuActions, setMenuActions] = useState<Array<{ id: string; action_type: string; reasoning: string | null; actioned_at: string }>>([])
  const [menuLoading, setMenuLoading] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [currentMenuMode, setCurrentMenuMode] = useState<string>('normal')

  const bid = business?.id

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
    } catch { /* non-fatal */ }
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
    } catch { /* non-fatal */ }
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
        const d = await scoresRes.json() as { scores: typeof menuScores }
        setMenuScores(d.scores ?? [])
      }
      if (actionsRes.ok) {
        const d = await actionsRes.json() as { actions: typeof menuActions }
        setMenuActions(d.actions ?? [])
        // Infer current mode from latest mode action
        const modeAction = (d.actions ?? []).find((a: typeof menuActions[0]) => a.action_type.startsWith('activate_'))
        if (modeAction) setCurrentMenuMode(modeAction.action_type.replace('activate_', '').replace('_mode', ''))
      }
    } catch { /* non-fatal */ }
    setMenuLoading(false)
  }, [bid]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadCouncil()
    void loadHistory()
    void loadSettings()
  }, [loadCouncil, loadHistory, loadSettings])

  useEffect(() => {
    if (tab === 'agents') void loadMenuData()
  }, [tab, loadMenuData])

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
        {(['today', 'agents', 'history', 'performance'] as TabId[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: 'none',
            background: tab === t ? '#2D5240' : 'transparent',
            color: tab === t ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.15s',
          }}>
            {t === 'today' ? "Today's Plan" : t === 'agents' ? 'All Agents' : t === 'history' ? 'History' : 'Performance'}
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
                            ⚠ Conflicts with {p.conflicts_with.join(', ')} agent — council chose this because {p.council_reasoning ?? 'higher projected impact'}
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
                      const items = menuScores.filter(s => s.bcg_quadrant === cell.q)
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
                              {new Date(a.actioned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                      { label: 'Stars', value: String(menuScores.filter(s => s.bcg_quadrant === 'star').length) },
                      { label: 'Puzzles', value: String(menuScores.filter(s => s.bcg_quadrant === 'puzzle').length) },
                      { label: 'Dogs', value: String(menuScores.filter(s => s.bcg_quadrant === 'dog').length) },
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
