export interface BarcodeProduct {
  name: string
  brand?: string
  category?: string
  image_url?: string
  source: 'go-upc' | 'upcitemdb'
}

export type AgentKey =
  | 'promo' | 'pricing' | 'inventory' | 'compliance'
  | 'product_lookup' | 'hardware' | 'ops_narrative' | 'generic'
  | 'intent_classifier' | 'ask_aria' | 'ask_suggestions' | 'ask_files' | 'ask_troubleshoot'
  | 'rostering' | 'hypothesis_engine'
  | 'signal_engine_synth' | 'memory_extractor' | 'customer_insight' | 'document_vision'
  | 'marketing_ai_generate' | 'review_reputation'
  | 'long_doc_map' | 'long_doc_reduce'
  | 'conversation_summarizer'
  | 'ask_aria_verifier' | 'action_planner'

export type AgentRole = 'agent' | 'judge' | 'data' | 'narrative' | 'classify' | 'chat' | 'export' | 'analysis' | 'other' | 'document'

export interface ProductContext {
  id: string
  name: string
  price: number
  cost_price: number
  margin_dollars: number
  margin_pct: number
  stock_quantity: number
  units_per_week: number
  weeks_of_stock: number | null
  category: string | null
  brand: string | null
  age_restricted: boolean
  alcohol_percentage: number | null
  shelf_life_days: number | null
  barcode: string | null
  additional_tax_code_ids: string[]
}

export interface WeatherSignal {
  condition: string
  temp_c: number
  rain_chance_pct: number
  business_impact: string
}

export interface BusinessContext {
  business_id: string
  business_name: string
  industry: string
  industry_subtype: string | null
  total_sales_last_28d: number
  total_revenue_last_28d: number
  avg_ticket_last_28d: number
  product?: ProductContext
  external_signals: { weather: WeatherSignal | null }
  recent_observations: Array<{
    category: string
    event_type: string
    data: Record<string, unknown>
    created_at: string
  }>
  past_dismissals: Array<{
    title: string
    reason: string
    dismissed_at: string
  }>
}

export interface Recommendation {
  agent: AgentKey
  type: string
  title: string
  description: string
  rationale: string
  confidence: string
  estimated_impact_dollars: number
  payload: Record<string, unknown>
}

export interface IsHighStakes {
  alcohol_promo: boolean
  large_price_change: boolean
  large_restock: boolean
  bas_impact: boolean
  age_restricted: boolean
}

export function classifyStakes(rec: Recommendation, ctx: BusinessContext): IsHighStakes {
  const product = ctx.product
  return {
    alcohol_promo: rec.agent === 'promo' && !!product?.age_restricted && (Number(product?.alcohol_percentage) || 0) > 0,
    large_price_change: rec.agent === 'pricing' && Math.abs(Number(rec.payload.delta_pct) || 0) > 10,
    large_restock: rec.agent === 'inventory' && Number(rec.estimated_impact_dollars) > 5000,
    bas_impact: rec.agent === 'compliance' && /tax|gst|wet|bas/i.test(rec.title + ' ' + rec.description),
    age_restricted: !!product?.age_restricted,
  }
}

export function isAnyHighStakes(s: IsHighStakes): boolean {
  return s.alcohol_promo || s.large_price_change || s.large_restock || s.bas_impact
}

export interface ValidationResult {
  ok: boolean
  rejected_reason?: string
  rewritten?: Recommendation
  severity?: 'soft' | 'hard'
  primary_judge_score?: number
  secondary_judge_score?: number
  judge_notes?: string
  judges_disagreed?: boolean
  cost_cents?: number
}

export interface AriaInvokeResult {
  recommendation: Recommendation | null
  reason: string | null
  validation?: ValidationResult
  total_cost_cents?: number
  latency_ms?: number
}
