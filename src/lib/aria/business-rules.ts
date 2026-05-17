/**
 * Business Rules Engine — pure functions, no DB, no LLM.
 * Every AI suggestion route runs through this AFTER getting the LLM response,
 * BEFORE returning to the user. Rejects or rewrites dangerous suggestions.
 */

export interface ProductRiskContext {
  product_id: string
  name: string
  price: number              // sell price incl tax
  cost_price: number         // wholesale cost
  stock_quantity: number
  category?: string | null
  brand?: string | null
  alcohol_percentage?: number | null
  age_restricted?: boolean
  shelf_life_days?: number | null
  units_per_week?: number | null
}

export interface PromoSuggestion {
  type: 'bogo' | 'percent_off' | 'fixed_off' | 'bundle' | 'happy_hour' | 'tiered' | 'free_item' | 'none'
  target_product_id?: string
  discount_percent?: number
  discount_amount?: number
  free_qty?: number
  paid_qty?: number
  rationale: string
  estimated_revenue_impact?: number
}

export interface ValidationResult {
  ok: boolean
  rejected_reason?: string
  rewritten?: PromoSuggestion
  margin_per_redemption_cents?: number
  worst_case_loss_cents?: number
}

const PREMIUM_PRICE_THRESHOLD_CENTS = 2500   // $25 — above this, no BOGO
const MIN_PROFIT_PER_REDEMPTION_CENTS = 50   // every redemption must net >= $0.50

/**
 * Validate that a promo suggestion makes business sense.
 * Returns ok=false with rejected_reason if dangerous.
 * Returns ok=true (or ok=false with rewritten) if a safer alternative exists.
 */
export function validatePromoSuggestion(
  suggestion: PromoSuggestion,
  product: ProductRiskContext,
): ValidationResult {
  const priceCents = Math.round(product.price * 100)
  const costCents = Math.round(product.cost_price * 100)
  const marginCents = priceCents - costCents
  const marginPct = priceCents > 0 ? (marginCents / priceCents) * 100 : 0

  // Rule 1: never lose money on a redemption
  let profitPerRedemption = 0
  let worstCase = 0
  switch (suggestion.type) {
    case 'bogo':
    case 'free_item': {
      const free = suggestion.free_qty ?? 1
      const paid = suggestion.paid_qty ?? 1
      profitPerRedemption = paid * marginCents - free * costCents
      worstCase = -free * costCents
      break
    }
    case 'percent_off': {
      const discount = (suggestion.discount_percent ?? 0) / 100
      profitPerRedemption = marginCents - Math.round(priceCents * discount)
      break
    }
    case 'fixed_off': {
      profitPerRedemption = marginCents - Math.round((suggestion.discount_amount ?? 0) * 100)
      break
    }
    case 'bundle':
    case 'happy_hour':
    case 'tiered':
      // Need explicit per-line config to validate; pass through for happy_hour RSA check below
      if (suggestion.type !== 'happy_hour') {
        return { ok: true, margin_per_redemption_cents: marginCents }
      }
      break
  }

  // Rule 2: hard profit floor (bundle/happy_hour/tiered already returned above)
  if (profitPerRedemption < MIN_PROFIT_PER_REDEMPTION_CENTS) {
    const safe = rewriteToSaferAlternative(suggestion, product, marginCents)
    return {
      ok: false,
      rejected_reason: `Suggestion would yield only $${(profitPerRedemption / 100).toFixed(2)} profit per redemption (minimum $${(MIN_PROFIT_PER_REDEMPTION_CENTS / 100).toFixed(2)}). ${suggestion.type === 'bogo' ? `BOGO on a ${marginPct.toFixed(0)}% margin product ($${product.price.toFixed(2)} sell, $${product.cost_price.toFixed(2)} cost) loses $${(Math.abs(profitPerRedemption) / 100).toFixed(2)} per redemption.` : ''}`,
      rewritten: safe,
      margin_per_redemption_cents: marginCents,
      worst_case_loss_cents: worstCase,
    }
  }

  // Rule 3: no BOGO on premium-priced items (over $25)
  if ((suggestion.type === 'bogo' || suggestion.type === 'free_item') && priceCents > PREMIUM_PRICE_THRESHOLD_CENTS) {
    const safeDiscount = Math.min(15, Math.max(5, Math.floor(marginPct / 4)))
    return {
      ok: false,
      rejected_reason: `BOGO is for high-volume FMCG (sub-$25). For a $${product.price.toFixed(2)} product, use a bundle or tiered discount instead. Premium items rarely BOGO because customers don't typically buy 2 at once and giveaway cost is too high.`,
      rewritten: {
        type: 'tiered',
        target_product_id: product.product_id,
        discount_percent: safeDiscount,
        rationale: `Bundle 2 for ${safeDiscount}% off the second unit. Protects margin while encouraging multi-buy.`,
      },
      margin_per_redemption_cents: marginCents,
    }
  }

  // Rule 4: never discount more than half the margin
  const maxAllowedDiscount = Math.max(1, Math.floor(marginPct / 2))
  if (suggestion.type === 'percent_off' && (suggestion.discount_percent ?? 0) > maxAllowedDiscount) {
    return {
      ok: false,
      rejected_reason: `${suggestion.discount_percent}% off exceeds half the product's margin (${marginPct.toFixed(0)}%). Cap is ${maxAllowedDiscount}%.`,
      rewritten: {
        ...suggestion,
        discount_percent: maxAllowedDiscount,
        rationale: `Capped at ${maxAllowedDiscount}% (half margin) to protect profitability.`,
      },
      margin_per_redemption_cents: marginCents,
    }
  }

  // Rule 5: alcohol RSA — no BOGO, no happy_hour
  if (product.age_restricted && (product.alcohol_percentage ?? 0) > 0) {
    if (suggestion.type === 'happy_hour' || suggestion.type === 'bogo') {
      return {
        ok: false,
        rejected_reason: `Cannot run BOGO or happy-hour promotions on alcohol — AU Liquor Act / RSA rules prohibit promotions that encourage rapid or excessive consumption.`,
        rewritten: {
          type: 'percent_off',
          target_product_id: product.product_id,
          discount_percent: Math.min(10, maxAllowedDiscount),
          rationale: 'Standard discount within RSA compliance.',
        },
        margin_per_redemption_cents: marginCents,
      }
    }
  }

  return { ok: true, margin_per_redemption_cents: marginCents }
}

function rewriteToSaferAlternative(
  _original: PromoSuggestion,
  product: ProductRiskContext,
  marginCents: number,
): PromoSuggestion {
  const priceCents = Math.round(product.price * 100)
  const marginPct = priceCents > 0 ? (marginCents / priceCents) * 100 : 0

  if (priceCents > PREMIUM_PRICE_THRESHOLD_CENTS) {
    const safeDiscount = Math.min(15, Math.max(5, Math.floor(marginPct / 4)))
    return {
      type: 'tiered',
      target_product_id: product.product_id,
      discount_percent: safeDiscount,
      rationale: `Premium price ($${product.price.toFixed(2)}) — bundle 2 for ${safeDiscount}% off the second. Protects margin.`,
    }
  }

  const safeDiscount = Math.max(5, Math.floor(marginPct / 3))
  return {
    type: 'percent_off',
    target_product_id: product.product_id,
    discount_percent: safeDiscount,
    rationale: `Conservative ${safeDiscount}% discount stays within product's ${marginPct.toFixed(0)}% margin.`,
  }
}

/**
 * Compute average units sold per week (velocity) from sale_items history.
 */
export function computeVelocity(
  saleItems: Array<{ product_id: string; quantity: number; created_at: string }>,
  productId: string,
  windowDays: number = 28,
): number {
  const cutoff = Date.now() - windowDays * 86400_000
  const relevant = saleItems.filter(s => s.product_id === productId && new Date(s.created_at).getTime() >= cutoff)
  const totalUnits = relevant.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0)
  const weeks = windowDays / 7
  return totalUnits / weeks
}

/**
 * Annotate a product's stock context with velocity-based commentary.
 */
export function describeStockSignal(stockQty: number, unitsPerWeek: number): string | null {
  if (unitsPerWeek <= 0) return 'no sales in 28 days — investigate before promoting'
  const weeksOfStock = stockQty / unitsPerWeek
  if (weeksOfStock < 1) return `${weeksOfStock.toFixed(1)} weeks of stock — restock, don't promote`
  if (weeksOfStock < 4) return `${weeksOfStock.toFixed(1)} weeks of stock — normal range`
  if (weeksOfStock < 12) return `${weeksOfStock.toFixed(1)} weeks of stock — slight overstock`
  return `${weeksOfStock.toFixed(1)} weeks of stock — genuine overstock, consider promotion`
}
