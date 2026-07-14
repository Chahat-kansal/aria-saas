import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '../providers/anthropic'

const CATEGORIES = ['pricing', 'inventory', 'marketing', 'staff', 'customers', 'cashflow', 'hours'] as const
type HypothesisCategory = typeof CATEGORIES[number]

export interface GeneratedHypothesis {
  title: string
  description: string
  category: HypothesisCategory
  predicted_impact_cents: number
  predicted_impact_label: string
  risk_level: 'low' | 'medium' | 'high'
  confidence: number
  evidence_summary: string
}

export const HYPOTHESIS_SYSTEM = `You generate specific, testable business hypotheses for Australian small businesses. Each hypothesis is a concrete what-if prediction backed by real data.

RULES:
- Every hypothesis must reference a specific number from the evidence provided
- Impact must be quantified in AUD dollars per week or per month — no vague "increase revenue" claims
- Risk must be assessed honestly — if an action has significant downside, say high risk
- Each hypothesis must be actionable within 7 days by the owner alone (no dependencies on third parties)
- Australian context: GST is 10%, penalty rates apply weekends/public holidays, superannuation is 11.5%
- Write as if speaking to the owner directly — terse, specific, no fluff

Return a JSON array of up to 5 hypotheses. No preamble, no code fences.

Schema per item:
{
  "title": "Short imperative title (max 60 chars)",
  "description": "2-3 sentences explaining the what, why, and expected outcome. Include the specific numbers.",
  "category": "pricing|inventory|marketing|staff|customers|cashflow|hours",
  "predicted_impact_cents": integer (positive = gain, negative = one-off cost),
  "predicted_impact_label": "e.g. +$340/week revenue or -$120 one-off cost",
  "risk_level": "low|medium|high",
  "confidence": 0.0-1.0,
  "evidence_summary": "One sentence: what data this is based on, including counts/amounts"
}`

// AI-COST-2 — evidence-gathering + prompt-building split out of generateHypothesesForBusiness so
// the Batch API submit/poll pair (hypothesis-engine-batch-submit / -poll) can reuse the exact same
// evidence query and prompt template without duplicating it. generateHypothesesForBusiness (the
// realtime path) is unchanged in behavior — it now just calls this internally.
export async function buildHypothesisPrompt(businessId: string): Promise<{
  prompt: string
  evidence_payload: Record<string, unknown>
}> {
  const now = new Date()
  const day30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const day7ago  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString()

  const [bizRes, salesRes, sales7dRes, productsRes, customersRes, memoryRes, weightsRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name,industry,industry_subtype,city,timezone').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount,payment_method,created_at,served_by').eq('business_id', businessId).neq('status', 'voided').gte('created_at', day30ago).order('created_at'),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', day7ago),
    supabaseAdmin.from('pos_products').select('name,price,cost,stock_quantity,low_stock_threshold,reorder_point,is_active,track_stock').eq('business_id', businessId).eq('is_active', true),
    supabaseAdmin.from('pos_customers').select('segment,rfm_score_total,days_since_visit,lifetime_value_cents').eq('business_id', businessId),
    supabaseAdmin.from('aria_business_memory').select('kind,content,importance').eq('business_id', businessId).eq('is_active', true).is('deleted_at', null).order('importance', { ascending: false }).limit(10),
    supabaseAdmin.from('aria_advice_weights').select('category,weight,positive_outcomes,negative_outcomes').eq('business_id', businessId),
  ])

  const biz       = bizRes.data
  const sales30d  = salesRes.data ?? []
  const sales7d   = sales7dRes.data ?? []
  const products  = productsRes.data ?? []
  const customers = customersRes.data ?? []
  const memories  = memoryRes.data ?? []
  const weights   = weightsRes.data ?? []

  const revenue30d = sales30d.reduce((s, r) => s + Number(r.total_amount || 0), 0)
  const revenue7d  = sales7d.reduce((s, r)  => s + Number(r.total_amount || 0), 0)
  const avgWeekly  = revenue30d / 4.3
  const avgTicket  = sales30d.length > 0 ? revenue30d / sales30d.length : 0

  const lowMarginProducts = products
    .filter(p => p.cost && p.price && ((Number(p.price) - Number(p.cost)) / Number(p.price)) < 0.2)
    .slice(0, 5)
    .map(p => ({ name: p.name, price: Number(p.price), cost: Number(p.cost) }))

  const deadStock = products
    .filter(p => p.track_stock && Number(p.stock_quantity || 0) > 0)
    .slice(0, 5)
    .map(p => ({ name: p.name, qty: p.stock_quantity }))

  const segCounts: Record<string, number> = {}
  for (const c of customers) {
    const s = (c.segment as string | null) || 'unscored'
    segCounts[s] = (segCounts[s] || 0) + 1
  }

  const byDay: Record<number, { revenue: number; count: number }> = {}
  for (const s of sales30d) {
    const d = new Date(s.created_at as string).getDay()
    if (!byDay[d]) byDay[d] = { revenue: 0, count: 0 }
    byDay[d].revenue += Number(s.total_amount || 0)
    byDay[d].count++
  }
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const dayPattern = Object.entries(byDay)
    .map(([d, v]) => ({ day: dayNames[parseInt(d)], avg: v.count > 0 ? v.revenue / v.count : 0 }))
    .sort((a, b) => b.avg - a.avg)

  const evidence_payload: Record<string, unknown> = {
    revenue30d, revenue7d, avgWeekly, avgTicket,
    lowMarginProducts, deadStock, segCounts, dayPattern,
    productCount: products.length, customerCount: customers.length,
  }

  const weightLines = weights.length > 0
    ? (weights as Array<{ category: string; weight: number; positive_outcomes: number; negative_outcomes: number }>)
        .map(w => `${w.category}: weight ${w.weight} (${w.positive_outcomes}+ ${w.negative_outcomes}-)`)
    : ['no prior outcome data']

  const prompt = `Business: ${(biz as Record<string,unknown> | null)?.name ?? 'Unknown'} (${(biz as Record<string,unknown> | null)?.industry_subtype ?? (biz as Record<string,unknown> | null)?.industry ?? 'retail'}, ${(biz as Record<string,unknown> | null)?.city ?? 'Australia'})

EVIDENCE (30-day window):
- Revenue last 30 days: $${revenue30d.toFixed(2)} (avg $${avgWeekly.toFixed(2)}/week)
- Revenue last 7 days: $${revenue7d.toFixed(2)}
- Avg ticket: $${avgTicket.toFixed(2)} across ${sales30d.length} transactions
- Products: ${products.length} active
- Low-margin products (<20%): ${JSON.stringify(lowMarginProducts)}
- Customers: ${customers.length} total — ${JSON.stringify(segCounts)}
- Busiest days by avg ticket: ${dayPattern.slice(0, 3).map(d => `${d.day} $${d.avg.toFixed(0)}`).join(', ')}
- Dead stock risk items: ${JSON.stringify(deadStock)}

WHAT ARIA KNOWS ABOUT THIS BUSINESS:
${(memories as Array<{ content: string }>).map(m => `- ${m.content}`).join('\n') || 'no prior context'}

PAST PERFORMANCE BY CATEGORY (advice weight):
${weightLines.join('\n')}

Generate up to 5 hypotheses. Avoid categories with weight < 0.7 (previous suggestions backfired). Favour categories with weight > 1.2 (track record of working). Return JSON array only.`

  return { prompt, evidence_payload }
}

export function parseHypothesesFromText(businessId: string, raw: string): GeneratedHypothesis[] {
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (Array.isArray(parsed)) return parsed.slice(0, 5) as GeneratedHypothesis[]
    return []
  } catch {
    console.error('[hypothesis/generate] parse failed for', businessId, raw.slice(0, 200))
    return []
  }
}

export async function generateHypothesesForBusiness(businessId: string): Promise<{
  hypotheses: GeneratedHypothesis[]
  evidence_payload: Record<string, unknown>
}> {
  const { prompt, evidence_payload } = await buildHypothesisPrompt(businessId)

  // HYPOTHESIS-JSON-FIX-1 — was maxTokens: 2048. The Anthropic->Gemini fallback (c5ba5b8a,
  // 2026-07-10) forwards this same value as Gemini's maxOutputTokens (src/lib/aria/providers/
  // gemini.ts), but Gemini is measurably more token-hungry than Claude for the same structured
  // JSON content — a verbose 5-hypothesis array (title + 2-3 sentence description + 1-sentence
  // evidence_summary each) genuinely exceeded 2048 tokens on the fallback path every single time
  // it ran, hitting MAX_TOKENS mid-array. 4096 gives real headroom; still well under either
  // provider's per-call cost concern for a once-daily cron.
  const result = await callAnthropic<GeneratedHypothesis[]>(
    {
      model: 'haiku',
      systemPrompt: HYPOTHESIS_SYSTEM,
      userPrompt: prompt,
      maxTokens: 4096,
      businessId,
      agentKey: 'hypothesis_engine',
      role: 'analysis',
    },
    [],
  )

  // HYPOTHESIS-JSON-FIX-1 — this used to re-parse result.raw from scratch via the stricter,
  // zero-repair-tolerance parseHypothesesFromText, discarding result.data entirely — which had
  // already been parsed via the more tolerant parseLLMJsonOr (multi-strategy: fence-stripping,
  // balanced-brace extraction, trailing-comma cleanup) inside callAnthropic's Gemini-fallback
  // path. Two independent parse attempts on the same text, the second one strictly weaker, was
  // pure waste even before the truncation bug — now uses the already-parsed, already-typed result.
  const hypotheses = Array.isArray(result.data) ? result.data.slice(0, 5) : []
  if (hypotheses.length === 0 && result.raw) {
    console.warn('[hypothesis/generate] provider succeeded but yielded 0 usable hypotheses for', businessId, '— raw (first 200 chars):', result.raw.slice(0, 200))
  }
  return { hypotheses, evidence_payload }
}

// AI-COST-2 — delta-gate (AI-COST-AUDIT-1 §5.1/§5.2: "Fix POS sync" re-fired 11 of 15 days,
// re-diagnosing the same unresolved problem with slightly different dollar figures each time,
// never accepted or dismissed even once). Normalized-title match against still-ACTIVE hypotheses
// for this business — if today's candidate is the same diagnosis as one already sitting active
// and unresolved, skip re-inserting it rather than piling up duplicates the owner never actioned.
function normalizeHypothesisTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ')
}

export async function persistHypotheses(
  businessId: string,
  hypotheses: GeneratedHypothesis[],
  evidencePayload: Record<string, unknown>,
): Promise<number> {
  if (hypotheses.length === 0) return 0

  await supabaseAdmin
    .from('aria_hypotheses')
    .update({ status: 'expired' })
    .eq('business_id', businessId)
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())

  const { data: stillActive } = await supabaseAdmin
    .from('aria_hypotheses')
    .select('title')
    .eq('business_id', businessId)
    .eq('status', 'active')
  const activeTitleHashes = new Set((stillActive ?? []).map(r => normalizeHypothesisTitle((r.title as string) ?? '')))

  const gated = hypotheses.filter(h => !activeTitleHashes.has(normalizeHypothesisTitle(h.title ?? '')))
  const skipped = hypotheses.length - gated.length
  if (skipped > 0) console.log(`[hypothesis/persist] delta-gated ${skipped} duplicate-diagnosis hypotheses for business ${businessId}`)
  if (gated.length === 0) return 0

  const rows = gated.map(h => ({
    business_id: businessId,
    title: (h.title ?? '').slice(0, 200),
    description: h.description ?? '',
    category: CATEGORIES.includes(h.category as HypothesisCategory) ? h.category : ('cashflow' as HypothesisCategory),
    predicted_impact_cents: Math.round(Number(h.predicted_impact_cents) || 0),
    predicted_impact_label: h.predicted_impact_label ?? '',
    risk_level: (['low','medium','high'] as const).includes(h.risk_level) ? h.risk_level : 'medium',
    confidence: Math.max(0, Math.min(1, Number(h.confidence) || 0.5)),
    evidence_summary: h.evidence_summary ?? '',
    evidence_payload: evidencePayload,
    status: 'active',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  }))

  const { error } = await supabaseAdmin.from('aria_hypotheses').insert(rows)
  if (error) {
    console.error('[hypothesis/persist] insert failed:', error.message)
    return 0
  }
  return rows.length
}
