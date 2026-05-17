/**
 * Discount Engine — pure functions, no DB calls.
 * Called from DiscountBar terminal UI and /api/pos/promotions/applicable.
 *
 * Sprint D: full stacking resolution, customer tiers, usage limits, date windows.
 */

export interface CartItem {
  product_id: string
  product_name: string
  category_id: string | null
  quantity: number
  unit_price: number
  line_total: number
  discount_percent?: number  // existing line-level discount (e.g. manual markdown)
}

export interface Customer {
  id: string
  customer_group_id: string | null
  total_spent: number
  visit_count: number
}

export interface Promotion {
  id: string
  name: string
  promotion_type: string         // 'percent_off'|'amount_off'|'bogo'|'bogo_half'|'combo'|'free_item'|'happy_hour'
  applies_to: string | null      // 'all'|'category'|'product'
  category_id: string | null
  product_id: string | null
  product_ids: string[] | null
  bundle_price: number | null
  discount_percent: number | null
  discount_amount: number | null
  active_days: number[] | null
  active_hour_start: number | null
  active_hour_end: number | null
  starts_at: string | null
  ends_at: string | null
  requires_code: string | null
  stacks_with_others: boolean
  stack_priority: number
  active: boolean
  min_spend: number | null
  buy_quantity: number | null
  get_quantity: number | null
  customer_group_id: string | null
  min_customer_lifetime_spend: number | null
  min_customer_visits: number | null
  max_total_uses: number | null
  current_uses: number
  max_uses_per_customer: number | null
  max_uses_per_day: number | null
  exclude_discounted: boolean
}

export interface AppliedDiscount {
  promotion_id: string
  promotion_name: string
  type: string
  amount_off: number
  description: string
  requires_code: boolean
  stacks_with_others: boolean
  stack_priority: number
  code?: string
}

export interface DiscountResult {
  auto:    AppliedDiscount[]
  manual:  AppliedDiscount[]
  coupons: AppliedDiscount[]
}

export interface UsageStats {
  customer_redemptions?: Record<string, number>  // promo_id → count for this customer
  daily_redemptions?: Record<string, number>     // promo_id → count today
}

function isActiveNow(promo: Promotion, now: Date): boolean {
  if (!promo.active) return false

  // Date window
  if (promo.starts_at && new Date(promo.starts_at) > now) return false
  if (promo.ends_at && new Date(promo.ends_at) < now) return false

  // Active days (ISO 1=Mon, 7=Sun)
  if (promo.active_days?.length) {
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay()
    if (!promo.active_days.includes(dayOfWeek)) return false
  }

  // Active hours
  const hour = now.getHours()
  if (promo.active_hour_start !== null && hour < promo.active_hour_start) return false
  if (promo.active_hour_end !== null && hour >= promo.active_hour_end) return false

  return true
}

function meetsCustomerConditions(promo: Promotion, customer: Customer | null): boolean {
  if (!promo.customer_group_id && promo.min_customer_lifetime_spend == null && promo.min_customer_visits == null) {
    return true
  }
  if (!customer) return false
  if (promo.customer_group_id && customer.customer_group_id !== promo.customer_group_id) return false
  if (promo.min_customer_lifetime_spend != null && (Number(customer.total_spent) || 0) < promo.min_customer_lifetime_spend) return false
  if (promo.min_customer_visits != null && (Number(customer.visit_count) || 0) < promo.min_customer_visits) return false
  return true
}

function meetsUsageLimits(promo: Promotion, customer: Customer | null, usage: UsageStats): boolean {
  if (promo.max_total_uses != null && (Number(promo.current_uses) || 0) >= promo.max_total_uses) return false
  if (promo.max_uses_per_customer != null && customer) {
    const customerCount = usage.customer_redemptions?.[promo.id] ?? 0
    if (customerCount >= promo.max_uses_per_customer) return false
  }
  if (promo.max_uses_per_day != null) {
    const dailyCount = usage.daily_redemptions?.[promo.id] ?? 0
    if (dailyCount >= promo.max_uses_per_day) return false
  }
  return true
}

function cartTotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + (Number(i.line_total) || 0), 0)
}

function filterTargets(promo: Promotion, cart: CartItem[]): CartItem[] {
  const scope = promo.applies_to
  let targets = cart
  if (scope === 'category' && promo.category_id) {
    targets = cart.filter(i => i.category_id === promo.category_id)
  } else if (scope === 'product' && promo.product_id) {
    targets = cart.filter(i => i.product_id === promo.product_id)
  }
  if (promo.exclude_discounted) {
    targets = targets.filter(i => !(Number(i.discount_percent) || 0))
  }
  return targets
}

function evalPromo(promo: Promotion, cart: CartItem[]): AppliedDiscount | null {
  const total = cartTotal(cart)
  if (promo.min_spend && total < (Number(promo.min_spend) || 0)) return null

  const t = promo.promotion_type

  if (t === 'combo' && promo.product_ids?.length && promo.bundle_price != null) {
    const comboMet = promo.product_ids.every(pid => cart.some(i => i.product_id === pid && i.quantity >= 1))
    if (!comboMet) return null
    const comboItemsTotal = cart.filter(i => promo.product_ids!.includes(i.product_id)).reduce((s, i) => s + (Number(i.unit_price) || 0), 0)
    const amountOff = Math.max(0, comboItemsTotal - (Number(promo.bundle_price) || 0))
    if (amountOff <= 0) return null
    return baseApplied(promo, amountOff, `${promo.name} — bundle A$${(Number(promo.bundle_price) || 0).toFixed(2)}`)
  }

  if (t === 'bogo' || t === 'bogo_half') {
    const buyQty = promo.buy_quantity ?? 1
    const getQty = promo.get_quantity ?? 1
    const targets = filterTargets(promo, cart)
    let amountOff = 0
    for (const item of targets) {
      const sets = Math.floor((Number(item.quantity) || 0) / (buyQty + getQty))
      if (sets < 1) continue
      const freeQty = sets * getQty
      const discount = t === 'bogo' ? (Number(item.unit_price) || 0) * freeQty : (Number(item.unit_price) || 0) * freeQty * 0.5
      amountOff += discount
    }
    if (amountOff <= 0) return null
    return baseApplied(promo, amountOff, `${promo.name} — buy ${buyQty} get ${getQty} ${t === 'bogo_half' ? 'half' : 'free'}`)
  }

  if (t === 'percent_off' || t === 'happy_hour' || t === 'percentage_discount') {
    const pct = Number(promo.discount_percent) || 0
    if (pct <= 0) return null
    const targets = filterTargets(promo, cart)
    const base = targets.reduce((s, i) => s + (Number(i.line_total) || 0), 0)
    const amountOff = base * (pct / 100)
    if (amountOff <= 0) return null
    return baseApplied(promo, amountOff, `${promo.name} — ${pct}% off`)
  }

  if (t === 'amount_off' || t === 'fixed_discount') {
    const amt = Number(promo.discount_amount) || 0
    if (amt <= 0) return null
    const amountOff = Math.min(amt, total)
    return baseApplied(promo, amountOff, `${promo.name} — A$${amt.toFixed(2)} off`)
  }

  if (t === 'free_item' && promo.product_id) {
    const target = cart.find(i => i.product_id === promo.product_id)
    if (!target) return null
    return baseApplied(promo, Number(target.unit_price) || 0, `${promo.name} — 1 × ${target.product_name} free`)
  }

  return null
}

function baseApplied(promo: Promotion, amountOff: number, description: string): AppliedDiscount {
  return {
    promotion_id: promo.id,
    promotion_name: promo.name,
    type: promo.promotion_type,
    amount_off: +amountOff.toFixed(2),
    description,
    requires_code: !!promo.requires_code,
    stacks_with_others: !!promo.stacks_with_others,
    stack_priority: Number(promo.stack_priority) || 100,
  }
}

/**
 * Resolve stacking conflicts.
 * - All stackable promos co-exist with each other AND with at most 1 non-stackable.
 * - When multiple non-stackable applicable, pick the one with highest amount_off
 *   (tiebreak: lower stack_priority number = higher priority).
 */
export function resolveStacking(applicable: AppliedDiscount[]): AppliedDiscount[] {
  const stackable = applicable.filter(d => d.stacks_with_others)
  const nonStackable = applicable.filter(d => !d.stacks_with_others)
  if (nonStackable.length === 0) return stackable
  nonStackable.sort((a, b) => {
    if (b.amount_off !== a.amount_off) return b.amount_off - a.amount_off
    return a.stack_priority - b.stack_priority
  })
  return [...stackable, nonStackable[0]]
}

export function calculateApplicableDiscounts(
  cart: CartItem[],
  promotions: Promotion[],
  options: { now?: Date; customer?: Customer | null; usage?: UsageStats } = {}
): DiscountResult {
  const result: DiscountResult = { auto: [], manual: [], coupons: [] }
  if (!cart.length || !promotions.length) return result

  const now = options.now ?? new Date()
  const customer = options.customer ?? null
  const usage = options.usage ?? {}

  const eligible = promotions.filter(p =>
    isActiveNow(p, now) &&
    meetsCustomerConditions(p, customer) &&
    meetsUsageLimits(p, customer, usage)
  )

  const autoApplicable: AppliedDiscount[] = []
  for (const promo of eligible) {
    const applied = evalPromo(promo, cart)
    if (!applied) continue

    if (promo.requires_code) {
      result.coupons.push(applied)
      continue
    }

    const AUTO_TYPES = ['combo', 'happy_hour', 'bogo', 'bogo_half', 'free_item']
    if (AUTO_TYPES.includes(promo.promotion_type)) {
      autoApplicable.push(applied)
    } else {
      result.manual.push(applied)
    }
  }

  result.auto = resolveStacking(autoApplicable)
  result.auto.sort((a, b) => a.stack_priority - b.stack_priority)
  result.manual.sort((a, b) => a.stack_priority - b.stack_priority)

  return result
}

export function applyCode(
  code: string,
  cart: CartItem[],
  promotions: Promotion[],
  options: { now?: Date; customer?: Customer | null; usage?: UsageStats } = {}
): { ok: true; discount: AppliedDiscount } | { ok: false; error: string } {
  const now = options.now ?? new Date()
  const customer = options.customer ?? null
  const usage = options.usage ?? {}

  const promo = promotions.find(p => p.requires_code?.toUpperCase() === code.toUpperCase())
  if (!promo) return { ok: false, error: 'Invalid code' }
  if (!isActiveNow(promo, now)) return { ok: false, error: 'Code expired or not active now' }
  if (!meetsCustomerConditions(promo, customer)) return { ok: false, error: 'Code requires customer tier or history' }
  if (!meetsUsageLimits(promo, customer, usage)) return { ok: false, error: 'Code usage limit reached' }
  const applied = evalPromo(promo, cart)
  if (!applied) return { ok: false, error: 'Code does not apply to this cart' }
  return { ok: true, discount: { ...applied, code } }
}
