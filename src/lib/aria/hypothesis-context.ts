import { supabaseAdmin } from '@/lib/supabase-admin'

// I11 COUNTERFACTUAL Part 1 — surface the top open hypotheses (the nightly hypothesis-engine
// generates these but the owner never sees them in chat). Facts only: the council can proactively
// mention "I see N hypotheses worth testing" and cite the predicted impact. No prompt rules.

export interface LiveHypothesis {
  id: string
  title: string
  category: string
  predicted_impact_label: string | null
  predicted_impact_dollars: number | null
  confidence: number
  risk_level: string
  source: string // 'hypothesis_engine' | 'interactive_counterfactual'
}

export interface HypothesisContext {
  available: boolean
  live_hypotheses: LiveHypothesis[]
  _anchor_numbers: number[]
  computed_at: string
}

export async function computeHypothesisContext(businessId: string): Promise<HypothesisContext> {
  const { data } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('id, title, category, predicted_impact_label, predicted_impact_cents, confidence, risk_level, evidence_payload')
    .eq('business_id', businessId)
    .eq('status', 'active')
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false })
    .limit(3)

  const rows = (data ?? []) as Array<{
    id: string; title: string; category: string; predicted_impact_label: string | null
    predicted_impact_cents: number | null; confidence: number | string; risk_level: string
    evidence_payload: { source?: string } | null
  }>

  const live_hypotheses: LiveHypothesis[] = rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    predicted_impact_label: r.predicted_impact_label,
    predicted_impact_dollars: typeof r.predicted_impact_cents === 'number' ? +(r.predicted_impact_cents / 100).toFixed(2) : null,
    confidence: +Number(r.confidence ?? 0).toFixed(2),
    risk_level: r.risk_level,
    source: r.evidence_payload?.source ?? 'hypothesis_engine',
  }))

  const anchors = live_hypotheses
    .map(h => h.predicted_impact_dollars)
    .filter((n): n is number => typeof n === 'number' && isFinite(n))

  return {
    available: live_hypotheses.length > 0,
    live_hypotheses,
    _anchor_numbers: anchors,
    computed_at: new Date().toISOString(),
  }
}
