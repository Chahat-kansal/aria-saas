// ASK-ARIA-CONSOLIDATE-1 — the ONE validated way Ask Aria writes a pos_promotions row.
//
// Root cause of the recurring promo bug: the executor put a percentage value into discount_amount, but the
// discount engine reads discount_percent for percentage promos (src/lib/pos/discount-engine.ts:175-190) → the
// promo applied $0 and was silently dead. This helper sets the columns CONSISTENTLY per type, aligned to what
// the engine actually reads, and REFUSES to write an unusable promo (missing value, unknown type) rather than
// persisting a dead one. Every column choice below is validated against the engine's read logic:
//   percentage_discount → discount_percent       (engine line 175)
//   fixed_discount      → discount_amount         (engine line 185)
//   bogo                → buy_quantity/get_quantity (engine line 159)
//   bundle (≡ combo)    → bundle_price + product_ids (engine line 150, 'bundle' alias added)
//   multibuy            → NO engine branch + not in discount_type CHECK → REJECTED (never written dead)
//
// discount_type CHECK on the table allows only {percentage, fixed, bogo, bundle} — we set it consistently so
// the legacy column never contradicts promotion_type.

export type PromoKind = 'percentage' | 'fixed' | 'bogo' | 'bundle' | 'multibuy'

export interface BuildPromoParams {
  businessId: string
  name: string
  kind: PromoKind
  value?: number | null            // % for percentage, $ for fixed, bundle price for bundle (ignored for bogo)
  scope?: 'all' | 'category' | 'product'
  categoryId?: string | null
  productIds?: string[] | null
  startsAt?: string | null
  endsAt?: string | null
  minSpend?: number | null
  activeDays?: number[] | null
  buyQuantity?: number | null
  getQuantity?: number | null
  notes?: string | null
}

export type BuildPromoResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string }

const KIND_MAP: Record<string, PromoKind> = {
  percentage: 'percentage', percent: 'percentage', percent_off: 'percentage', percentage_discount: 'percentage',
  fixed: 'fixed', amount_off: 'fixed', fixed_discount: 'fixed', dollar_off: 'fixed',
  bogo: 'bogo', bogo_half: 'bogo',
  bundle: 'bundle', combo: 'bundle',
  multibuy: 'multibuy',
}

/** Normalise a planner promotion_type/kind string to a canonical PromoKind (or null if unknown). */
export function normalisePromoKind(raw: string | null | undefined): PromoKind | null {
  if (!raw) return null
  return KIND_MAP[String(raw).toLowerCase().trim()] ?? null
}

export function buildPromotionRow(p: BuildPromoParams): BuildPromoResult {
  if (!p.businessId) return { ok: false, error: 'Internal: businessId required' }
  if (!p.name || !p.name.trim()) return { ok: false, error: 'A promotion needs a name.' }

  const todayISO = new Date().toISOString().slice(0, 10)
  const scope = p.scope ?? (p.categoryId ? 'category' : (p.productIds && p.productIds.length ? 'product' : 'all'))
  const appliesTo = scope === 'category' ? 'category' : scope === 'product' ? 'product' : 'all'

  // Columns common to every promo, set consistently. active + is_active BOTH true so the engine (reads `active`)
  // and any UI (reads `is_active`) agree. Date window handles scheduling.
  const base: Record<string, unknown> = {
    business_id: p.businessId,
    name: p.name.trim(),
    active: true,
    is_active: true,
    applies_to: appliesTo,
    category_id: scope === 'category' ? (p.categoryId ?? null) : null,
    product_ids: scope === 'product' && p.productIds && p.productIds.length ? p.productIds : [],
    category_ids: [],
    starts_at: p.startsAt ?? todayISO,
    ends_at: p.endsAt ?? null,
    min_spend: p.minSpend ?? null,
    active_days: p.activeDays && p.activeDays.length ? p.activeDays : [1, 2, 3, 4, 5, 6, 7],
    stack_priority: 100,
    current_uses: 0,
    exclude_discounted: false,
    notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
    // explicit NULLs so a column is never left ambiguous across types
    discount_percent: null,
    discount_amount: null,
    bundle_price: null,
    buy_quantity: null,
    get_quantity: null,
  }

  switch (p.kind) {
    case 'percentage': {
      const v = Number(p.value)
      if (!isFinite(v) || v <= 0 || v > 100) return { ok: false, error: 'A percentage discount needs a value between 1 and 100.' }
      return { ok: true, row: { ...base, promotion_type: 'percentage_discount', discount_type: 'percentage', value: v, discount_percent: v } }
    }
    case 'fixed': {
      const v = Number(p.value)
      if (!isFinite(v) || v <= 0) return { ok: false, error: 'A $-off discount needs a dollar amount greater than 0.' }
      return { ok: true, row: { ...base, promotion_type: 'fixed_discount', discount_type: 'fixed', value: v, discount_amount: v } }
    }
    case 'bogo': {
      const buy = Math.max(1, Math.round(Number(p.buyQuantity) || 1))
      const get = Math.max(1, Math.round(Number(p.getQuantity) || 1))
      return { ok: true, row: { ...base, promotion_type: 'bogo', discount_type: 'bogo', buy_quantity: buy, get_quantity: get } }
    }
    case 'bundle': {
      const v = Number(p.value)
      if (!isFinite(v) || v <= 0) return { ok: false, error: 'A bundle needs a bundle price greater than 0.' }
      if (!p.productIds || p.productIds.length < 2) return { ok: false, error: 'A bundle needs at least 2 products. Name the products to include.' }
      return { ok: true, row: { ...base, promotion_type: 'bundle', discount_type: 'bundle', applies_to: 'product', product_ids: p.productIds, bundle_price: v } }
    }
    case 'multibuy':
      return { ok: false, error: "Multi-buy promotions aren't supported yet — try a % off, $ off, buy-one-get-one, or a bundle." }
    default:
      return { ok: false, error: `Unknown promotion type "${p.kind}". Use percentage, fixed, bogo, or bundle.` }
  }
}
