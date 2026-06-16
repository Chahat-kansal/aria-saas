import { supabaseAdmin } from '@/lib/supabase-admin'
import { callAnthropic } from '../providers/anthropic'

// I11 COUNTERFACTUAL Part 3 — live "what if" simulation. The owner describes a concrete scenario;
// we ground it in this business's real 30-day data and ask Haiku for ONE quantified prediction, then
// persist it as a testable hypothesis the owner can later accept (which feeds the I4 outcome loop).
// NOTE: aria_hypotheses.status CHECK = [active,accepted,rejected,expired,superseded] — there is no
// 'interactive_query' value (and the schema must not change), so interactive rows use status='active'
// and are tagged via evidence_payload.source='interactive_counterfactual'.

const CATEGORIES = ['pricing', 'inventory', 'marketing', 'staff', 'customers', 'cashflow', 'hours'] as const
type Cat = typeof CATEGORIES[number]

export interface CounterfactualResult {
  hypothesis_id: string | null
  scenario: string
  title: string
  description: string
  category: string
  predicted_impact_cents: number
  predicted_impact_label: string
  risk_level: 'low' | 'medium' | 'high'
  confidence: number
  evidence_summary: string
}

const CF_SYSTEM = `You simulate a single concrete "what if" scenario for an Australian small business and return ONE quantified prediction.

RULES:
- Ground every number in the EVIDENCE provided — reference the specific figures.
- Quantify impact in AUD (per week unless the scenario is a one-off). Positive = gain, negative = cost.
- Be honest about risk and confidence — a speculative scenario with thin evidence is low confidence / higher risk.
- Australian context: GST 10%, weekend/public-holiday penalty rates, superannuation 11.5%.
- No fluff. Speak to the owner directly.

Return a SINGLE JSON object (no array, no code fences):
{
  "title": "Short title of the scenario outcome (max 60 chars)",
  "description": "2-3 sentences: the predicted effect, why, and the key number(s).",
  "category": "pricing|inventory|marketing|staff|customers|cashflow|hours",
  "predicted_impact_cents": integer,
  "predicted_impact_label": "e.g. +$240/week revenue or -$80 one-off cost",
  "risk_level": "low|medium|high",
  "confidence": 0.0-1.0,
  "evidence_summary": "One sentence naming the data this rests on, with counts/amounts"
}`

export async function simulateCounterfactual(businessId: string, scenario: string): Promise<CounterfactualResult> {
  const day30ago = new Date(Date.now() - 30 * 86400000).toISOString()
  const day7ago = new Date(Date.now() - 7 * 86400000).toISOString()

  const [bizRes, sales30Res, sales7Res, prodRes, custRes] = await Promise.all([
    supabaseAdmin.from('businesses').select('name,industry,industry_subtype,city').eq('id', businessId).maybeSingle(),
    supabaseAdmin.from('pos_sales').select('total_amount,created_at').eq('business_id', businessId).neq('status', 'voided').gte('created_at', day30ago),
    supabaseAdmin.from('pos_sales').select('total_amount').eq('business_id', businessId).neq('status', 'voided').gte('created_at', day7ago),
    supabaseAdmin.from('pos_products').select('name,price,cost').eq('business_id', businessId).eq('is_active', true).limit(40),
    supabaseAdmin.from('pos_customers').select('id', { count: 'exact', head: true }).eq('business_id', businessId),
  ])

  const biz = bizRes.data as Record<string, unknown> | null
  const sales30 = sales30Res.data ?? []
  const rev30 = sales30.reduce((s, r) => s + Number((r as { total_amount: number | null }).total_amount || 0), 0)
  const rev7 = (sales7Res.data ?? []).reduce((s, r) => s + Number((r as { total_amount: number | null }).total_amount || 0), 0)
  const txns = sales30.length
  const avgTicket = txns > 0 ? rev30 / txns : 0
  const avgWeekly = rev30 / 4.3

  // busiest days by avg ticket (helps scenarios about specific days)
  const byDay: Record<number, { rev: number; n: number }> = {}
  for (const s of sales30) {
    const d = new Date((s as { created_at: string }).created_at).getDay()
    if (!byDay[d]) byDay[d] = { rev: 0, n: 0 }
    byDay[d].rev += Number((s as { total_amount: number | null }).total_amount || 0); byDay[d].n++
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayPattern = Object.entries(byDay).map(([d, v]) => ({ day: dayNames[+d], avg: v.n > 0 ? v.rev / v.n : 0 })).sort((a, b) => b.avg - a.avg)
  const products = (prodRes.data ?? []) as Array<{ name: string; price: number | null; cost: number | null }>

  const evidence = {
    revenue_30d: +rev30.toFixed(2), revenue_7d: +rev7.toFixed(2), avg_weekly: +avgWeekly.toFixed(2),
    avg_ticket: +avgTicket.toFixed(2), transactions_30d: txns, product_count: products.length,
    customer_count: custRes.count ?? 0, busiest_days: dayPattern.slice(0, 3).map(d => `${d.day} $${d.avg.toFixed(0)}`),
  }

  const userPrompt = `Business: ${biz?.name ?? 'Unknown'} (${biz?.industry_subtype ?? biz?.industry ?? 'retail'}, ${biz?.city ?? 'Australia'})

OWNER'S "WHAT IF" SCENARIO: ${scenario}

EVIDENCE (last 30 days):
- Revenue 30d: $${rev30.toFixed(2)} (avg $${avgWeekly.toFixed(2)}/week); last 7d: $${rev7.toFixed(2)}
- Avg ticket: $${avgTicket.toFixed(2)} across ${txns} transactions
- Active products: ${products.length}; customers: ${evidence.customer_count}
- Busiest days by avg ticket: ${evidence.busiest_days.join(', ') || 'n/a'}
- Sample products (name/price/cost): ${JSON.stringify(products.slice(0, 8))}

Simulate ONLY this scenario. Return the single JSON object.`

  let parsed: Partial<CounterfactualResult> = {}
  try {
    const result = await callAnthropic<CounterfactualResult>(
      { model: 'haiku', systemPrompt: CF_SYSTEM, userPrompt, maxTokens: 1024, businessId, agentKey: 'counterfactual', role: 'forecast' },
      {} as CounterfactualResult,
    )
    const cleaned = result.raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
    const obj = JSON.parse(cleaned)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) parsed = obj
    else if (Array.isArray(obj) && obj[0]) parsed = obj[0]
  } catch (e) {
    console.error('[counterfactual] parse failed for', businessId, (e as Error).message)
  }

  const category = (CATEGORIES as readonly string[]).includes(String(parsed.category)) ? (parsed.category as Cat) : 'cashflow'
  const risk: 'low' | 'medium' | 'high' = (['low', 'medium', 'high'] as const).includes(parsed.risk_level as 'low' | 'medium' | 'high') ? (parsed.risk_level as 'low' | 'medium' | 'high') : 'medium'
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))
  const impactCents = Math.round(Number(parsed.predicted_impact_cents) || 0)
  const title = (parsed.title ?? `What if: ${scenario}`).slice(0, 200)
  const description = parsed.description ?? ''
  const label = parsed.predicted_impact_label ?? ''
  const evidenceSummary = parsed.evidence_summary ?? ''

  // Persist as a testable hypothesis (status='active', tagged interactive). Owner can accept it later.
  const { data: inserted, error } = await supabaseAdmin
    .from('aria_hypotheses')
    .insert({
      business_id: businessId,
      title,
      description,
      category,
      predicted_impact_cents: impactCents,
      predicted_impact_label: label,
      risk_level: risk,
      confidence,
      evidence_summary: evidenceSummary,
      evidence_payload: { source: 'interactive_counterfactual', scenario, evidence },
      status: 'active',
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select('id')
    .maybeSingle()
  if (error) console.error('[counterfactual] insert failed:', error.message)

  return {
    hypothesis_id: (inserted as { id?: string } | null)?.id ?? null,
    scenario,
    title,
    description,
    category,
    predicted_impact_cents: impactCents,
    predicted_impact_label: label,
    risk_level: risk,
    confidence,
    evidence_summary: evidenceSummary,
  }
}
