import { callAnthropic } from './providers/anthropic'
import { callOpenAIChat, isOpenAIJudgeEnabled } from './providers/openai'
import { validatePromoSuggestion } from './business-rules'
import { validatePricing, validateInventory } from './validators'
import { findSimilarDismissal } from './signals/embeddings'
import { classifyStakes, isAnyHighStakes } from './types'
import type { BusinessContext, Recommendation, ValidationResult } from './types'

const JUDGE_SYSTEM = `You are the Aria Judge — an adversarial critic reviewing AI-generated business suggestions for an Australian SMB owner.

Your job is to find flaws. Be harsh. Look for:
1. Numbers that don't add up (gross margin < discount, price below cost, BOGO on high-margin items)
2. Australian regulatory violations (RSA for alcohol, GST/WET, food safety)
3. Business suicide suggestions (50% off a Saturday-night staple, BOGO rum, ghost-card promo)
4. Suggestions that repeat something the owner already dismissed
5. Seasonality or weather mismatches

Score 0–100. Return ONLY JSON:
{
  "score": 0-100,
  "severity": "pass" | "soft_fail" | "hard_fail",
  "reasons": ["specific issue 1", "..."],
  "rewrite": null | <improved Recommendation JSON>
}
pass = score>=70, soft_fail = 40-69 (rewrite if possible), hard_fail = <40 (reject).`

const SECOND_OPINION_SYSTEM = `You are a SECOND-OPINION judge reviewing a suggestion another AI already passed. Find issues it missed — especially:
- Australian regulatory compliance (RSA, GST/WET, food standards)
- Business-owner perspective (real shop owner reaction)
- Numbers that look right but don't add up
- Cultural or seasonal context

Return ONLY JSON: { "agrees": boolean, "score": 0-100, "concerns": ["issue"], "recommendation": "uphold"|"rewrite"|"reject" }`

export async function judge(
  recommendation: Recommendation,
  context: BusinessContext,
): Promise<ValidationResult & { cost_cents: number }> {
  let totalCost = 0

  // PASS A: deterministic rules — free
  if (recommendation.agent === 'promo' && context.product) {
    const p = context.product
    const promoType = String(recommendation.type ?? 'none') as 'bogo' | 'percent_off' | 'fixed_off' | 'bundle' | 'happy_hour' | 'tiered' | 'free_item' | 'none'
    const promoSuggestion = {
      type: promoType,
      discount_percent: Number(recommendation.payload.discount_percent) || 0,
      discount_amount: Number(recommendation.payload.discount_amount) || 0,
      rationale: recommendation.rationale,
    }
    const productCtx = {
      product_id: p.id, name: p.name, price: p.price, cost_price: p.cost_price,
      stock_quantity: p.stock_quantity, category: p.category,
      alcohol_percentage: p.alcohol_percentage, age_restricted: p.age_restricted,
      shelf_life_days: p.shelf_life_days, units_per_week: p.units_per_week,
    }
    const detResult = validatePromoSuggestion(promoSuggestion, productCtx)
    if (!detResult.ok) {
      return {
        ok: false, rejected_reason: detResult.rejected_reason, severity: 'hard',
        primary_judge_score: 0, cost_cents: 0,
        judge_notes: 'Failed deterministic promo rules — Opus call skipped.',
      }
    }
  }

  if (recommendation.agent === 'pricing') {
    const r = validatePricing(recommendation, context)
    if (!r.ok) return { ...r, primary_judge_score: 0, cost_cents: 0, judge_notes: 'Failed deterministic pricing.' }
  }

  if (recommendation.agent === 'inventory') {
    const r = validateInventory(recommendation, context)
    if (!r.ok) return { ...r, primary_judge_score: 0, cost_cents: 0, judge_notes: 'Failed deterministic inventory.' }
  }

  // Semantic dismissal match
  try {
    const similar = await findSimilarDismissal(recommendation.title, context.business_id)
    if (similar) {
      return {
        ok: false,
        rejected_reason: `Similar suggestion dismissed: "${similar.title}" (${similar.reason}, ${(similar.similarity * 100).toFixed(0)}% match)`,
        severity: 'hard', primary_judge_score: 0, cost_cents: 0,
        judge_notes: 'Negative memory match.',
      }
    }
  } catch { /* embedding failure non-fatal */ }

  // PASS B: Opus 4.5 primary judge
  const userPrompt = `Suggestion:\n${JSON.stringify(recommendation, null, 2)}\n\nContext:\n${JSON.stringify({
    industry: context.industry, product: context.product, avg_ticket: context.avg_ticket_last_28d,
    past_dismissals: context.past_dismissals.slice(0, 5),
  }, null, 2)}\n\nEvaluate adversarially. Return ONLY the JSON.`

  const opusResult = await callAnthropic<{
    score?: number; severity?: 'pass' | 'soft_fail' | 'hard_fail';
    reasons?: string[]; rewrite?: Recommendation | null;
  }>({
    model: 'haiku', systemPrompt: JUDGE_SYSTEM, userPrompt, maxTokens: 800,
    businessId: context.business_id, agentKey: recommendation.agent, role: 'judge',
  }, { score: 0, severity: 'hard_fail', reasons: ['Parse failed'], rewrite: null })
  totalCost += opusResult.cost_cents

  const opusScore = Number(opusResult.data.score) || 0
  const opusSeverity = opusResult.data.severity ?? (opusScore >= 70 ? 'pass' : opusScore >= 40 ? 'soft_fail' : 'hard_fail')

  // PASS C: GPT-5 second opinion — only high-stakes && Opus passed
  const stakes = classifyStakes(recommendation, context)
  let secondaryScore: number | undefined
  let judgesDisagreed = false

  if (isAnyHighStakes(stakes) && opusSeverity === 'pass' && isOpenAIJudgeEnabled()) {
    const gptResult = await callOpenAIChat<{
      agrees?: boolean; score?: number; concerns?: string[];
      recommendation?: 'uphold' | 'rewrite' | 'reject';
    }>({
      systemPrompt: SECOND_OPINION_SYSTEM,
      userPrompt: `First-judge: PASS (score ${opusScore}).\n\nSuggestion:\n${JSON.stringify(recommendation, null, 2)}\n\nContext:\n${JSON.stringify({ industry: context.industry, product: context.product }, null, 2)}\n\nDo you agree?`,
      maxTokens: 600, businessId: context.business_id,
      agentKey: recommendation.agent, role: 'judge',
    }, { agrees: true, score: 70, concerns: [], recommendation: 'uphold' })
    totalCost += gptResult.cost_cents

    if (gptResult.available) {
      secondaryScore = Number(gptResult.data.score) || 0
      judgesDisagreed = Math.abs(opusScore - secondaryScore) > 30
      if (gptResult.data.recommendation === 'reject' || (gptResult.data.recommendation === 'rewrite' && !gptResult.data.agrees)) {
        return {
          ok: false,
          rejected_reason: `Second-opinion judge: ${(gptResult.data.concerns ?? []).join('; ')}`,
          severity: gptResult.data.recommendation === 'rewrite' ? 'soft' : 'hard',
          primary_judge_score: opusScore, secondary_judge_score: secondaryScore,
          judges_disagreed: true, cost_cents: totalCost,
          judge_notes: `Opus passed (${opusScore}), GPT-5 rejected (${secondaryScore})`,
        }
      }
    }
  }

  if (opusSeverity === 'pass') {
    return {
      ok: true, primary_judge_score: opusScore, secondary_judge_score: secondaryScore,
      judges_disagreed: judgesDisagreed, cost_cents: totalCost,
      judge_notes: (opusResult.data.reasons ?? []).join('; '),
    }
  }

  return {
    ok: false,
    rejected_reason: (opusResult.data.reasons ?? ['Judge rejected']).join('; '),
    rewritten: opusResult.data.rewrite ?? undefined,
    severity: opusSeverity === 'soft_fail' ? 'soft' : 'hard',
    primary_judge_score: opusScore, cost_cents: totalCost,
    judge_notes: (opusResult.data.reasons ?? []).join('; '),
  }
}
