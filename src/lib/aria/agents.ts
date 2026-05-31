import { callAnthropic } from './providers/anthropic'
import { searchWeb } from './signals/web'
import type { AgentKey, BusinessContext, Recommendation } from './types'

export function isPerplexityAvailable(): boolean {
  return !!process.env.PERPLEXITY_API_KEY
}

const FALLBACK_REC: Recommendation = {
  agent: 'generic', type: 'none', title: 'No suggestion', description: 'Insufficient data.',
  rationale: 'Could not generate a suggestion.', confidence: 'low',
  estimated_impact_dollars: 0, payload: {},
}

const INDUSTRY_ADAPTATIONS: Record<string, string> = {
  liquor: 'NEVER promo premium spirits (distributor-locked margin). Focus slow wine/cider. Carlton Draught/Great Northern → multipack bundle. RTDs → bundle 4-packs. Lead with case counts, not individual bottles.',
  cafe: 'Promo COMPLEMENTARY pairs (coffee + pastry). Time-of-day matters: espresso in morning, cold press afternoon. Never promo signature items already selling out. Cover count > revenue for staffing.',
  bakery: 'Promo perishables only (today\'s bread, day-old). Use shelf_life_days. Reduce production on rainy days, not price.',
  restaurant: 'Combo meals beat single-item discounts. Never promo Saturday night high-margin items. Average cover spend > transaction count.',
  retail: 'Bundle slow-mover with fast-mover. Never solo-promo a high-margin item.',
}

function getIndustryAdaptation(industry: string): string {
  return INDUSTRY_ADAPTATIONS[industry] ?? ''
}

function buildSystemPrompt(agentKey: AgentKey, ctx: BusinessContext): string {
  const adaptation = getIndustryAdaptation(ctx.industry)
  const baseRules = `You are Aria, an AI business advisor for Australian SMBs. Industry: ${ctx.industry}${ctx.industry_subtype ? ` (${ctx.industry_subtype})` : ''}.
${adaptation ? `\nINDUSTRY RULES: ${adaptation}` : ''}

HARD RULES (never violate):
- Never fabricate numbers. Only use values in the context.
- BOGO on alcohol or products >$25 or margin <30% is FORBIDDEN.
- Price below cost is FORBIDDEN.
- Discount >50% of gross margin is FORBIDDEN.
- If unsure, return type:"none".

PAST DISMISSALS: ${ctx.past_dismissals.length > 0
    ? ctx.past_dismissals.map(d => `"${d.title}" (${d.reason})`).join('; ')
    : 'None'}.

Return ONLY valid JSON. No prose. No code fences.`

  const schemas: Record<AgentKey, string> = {
    promo: `Schema: { "type": "percent_off"|"bogo"|"bundle"|"happy_hour"|"fixed_off"|"tiered"|"none", "title": "max 8 words", "description": "max 25 words with A$ impact", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": { "product_id": "...", "discount_percent"?: number, "discount_amount"?: number, "bundle_qty"?: number } }`,
    pricing: `Schema: { "type": "price_increase"|"price_decrease"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": { "product_id": "...", "current_price": number, "suggested_price": number, "delta_pct": number } }`,
    inventory: `Schema: { "type": "restock"|"clearance"|"waste_alert"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": { "product_id"?: "...", "restock_qty"?: number, "clearance_discount"?: number } }`,
    compliance: `Schema: { "type": "tax_alert"|"licensing_alert"|"age_verify"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    product_lookup: `Schema: { "type": "product_insight"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    hardware: `Schema: { "type": "hardware_fix"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    ops_narrative: `Schema: { "type": "narrative", "title": "max 8 words", "description": "3 sentences: performance vs baseline, notable pattern, recommended action", "rationale": "data-driven", "confidence": "high", "estimated_impact_dollars": number, "payload": {} }`,
    generic: `Schema: { "type": "insight"|"none", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    intent_classifier: `Schema: { "type": "insight", "title": "intent", "description": "classified intent", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    ask_aria: `Schema: { "type": "insight", "title": "answer", "description": "response text", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    ask_suggestions: `Schema: { "type": "insight", "title": "suggestions", "description": "contextual questions", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    ask_files: `Schema: { "type": "insight", "title": "export", "description": "file export", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    ask_troubleshoot: `Schema: { "type": "insight", "title": "diagnosis", "description": "troubleshoot response", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    rostering: `Schema: { "type": "roster", "title": "week description", "description": "1 sentence rationale", "rationale": "data-driven", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": { "shifts": [...], "reasoning": "..." } }`,
    hypothesis_engine: `Schema: { "type": "hypothesis", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    signal_engine_synth: `Schema: { "type": "insight", "title": "max 8 words", "description": "max 25 words", "rationale": "1 sentence", "confidence": "high"|"medium"|"low", "estimated_impact_dollars": number, "payload": {} }`,
    memory_extractor:    `Schema: { "type": "insight", "title": "memory", "description": "extracted memory", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    customer_insight:    `Schema: { "type": "insight", "title": "customer summary", "description": "paragraph insight", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    document_vision:       `Schema: { "type": "insight", "title": "document read", "description": "extracted content", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    marketing_ai_generate: `Schema: { "type": "insight", "title": "campaign suggestion", "description": "SMS campaign recommendation", "rationale": "1 sentence", "confidence": "high", "estimated_impact_dollars": number, "payload": {} }`,
    review_reputation:     `Schema: { "type": "insight", "title": "reputation score", "description": "reputation analysis", "rationale": "1 sentence", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    long_doc_map:    `Schema: { "type": "insight", "title": "document section", "description": "extracted content", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
    long_doc_reduce: `Schema: { "type": "insight", "title": "document synthesis", "description": "synthesised answer", "rationale": "n/a", "confidence": "high", "estimated_impact_dollars": 0, "payload": {} }`,
  }

  return `${baseRules}\n\n${schemas[agentKey] ?? schemas.generic}`
}

export async function runAgent(
  agentKey: AgentKey,
  ctx: BusinessContext,
  taskHint?: string,
): Promise<{ recommendation: Recommendation; cost_cents: number; latency_ms: number }> {
  const systemPrompt = buildSystemPrompt(agentKey, ctx)
  // Inject web grounding for compliance and pricing agents when Perplexity is available
  let webGrounding = ''
  if ((agentKey === 'compliance' || agentKey === 'pricing') && isPerplexityAvailable()) {
    const query = agentKey === 'compliance'
      ? `Australian ${ctx.industry} compliance rules 2024 GST WET RSA food standards`
      : `Australian ${ctx.industry} retail pricing strategy current market`
    const webSignal = await searchWeb(query, ctx.business_id)
    if (webSignal?.answer) webGrounding = `\n\nWeb grounding (Perplexity):\n${webSignal.answer}`
  }

  const userPrompt = `Business context:\n${JSON.stringify({
    industry: ctx.industry,
    industry_subtype: ctx.industry_subtype,
    total_sales_28d: ctx.total_sales_last_28d,
    total_revenue_28d: ctx.total_revenue_last_28d,
    avg_ticket: ctx.avg_ticket_last_28d,
    product: ctx.product ?? null,
    weather: ctx.external_signals.weather,
    recent_observations: ctx.recent_observations.slice(0, 5),
  }, null, 2)}${webGrounding}${taskHint ? `\n\nAdditional context:\n${taskHint}` : ''}\n\nGenerate the best ${agentKey} recommendation. Return ONLY JSON.`

  const modelByAgent: Record<AgentKey, 'haiku' | 'sonnet' | 'opus'> = {
    promo: 'sonnet', pricing: 'sonnet', inventory: 'haiku',
    compliance: 'sonnet', product_lookup: 'haiku', hardware: 'haiku',
    ops_narrative: 'sonnet', generic: 'haiku',
    intent_classifier: 'haiku', ask_aria: 'sonnet', ask_suggestions: 'haiku',
    ask_files: 'haiku', ask_troubleshoot: 'sonnet',
    rostering: 'sonnet', hypothesis_engine: 'sonnet',
    signal_engine_synth: 'haiku', memory_extractor: 'haiku',
    customer_insight: 'haiku', document_vision: 'haiku',
    marketing_ai_generate: 'sonnet', review_reputation: 'haiku',
    long_doc_map: 'haiku', long_doc_reduce: 'sonnet',
  }

  const result = await callAnthropic<Recommendation>({
    model: modelByAgent[agentKey],
    systemPrompt,
    userPrompt,
    maxTokens: 600,
    businessId: ctx.business_id,
    agentKey,
    role: 'other',
  }, { ...FALLBACK_REC, agent: agentKey })

  const rec: Recommendation = { ...result.data, agent: agentKey }
  return { recommendation: rec, cost_cents: result.cost_cents, latency_ms: result.latency_ms }
}
