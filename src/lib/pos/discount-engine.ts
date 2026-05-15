/**
 * Discount Engine — pure functions, no DB calls.
 * Called from DiscountBar in the terminal and from /api/pos/promotions/applicable.
 */

export interface CartItem {
  product_id: string
  product_name: string
  category_id: string | null
  quantity: number
  unit_price: number
  line_total: number
}

export interface Promotion {
  id: string
  name: string
  promotion_type: string          // 'percent_off'|'amount_off'|'bogo'|'bogo_half'|'combo'|'free_item'|'happy_hour'
  applies_to: string | null       // 'order'|'category'|'item'
  category_id: string | null
  product_id: string | null
  product_ids: string[] | null    // for combo
  bundle_price: number | null     // combo price
  discount_percent: number | null
  discount_amount: number | null
  active_days: number[] | null    // ISO weekday 1=Mon...7=Sun
  active_hour_start: number | null
  active_hour_end: number | null
  requires_code: string | null
  stacks_with_others: boolean
  active: boolean
  min_spend: number | null
  buy_quantity: number | null
  get_quantity: number | null
}

export interface AppliedDiscount {
  promotion_id: string
  promotion_name: string
  type: string
  amount_off: number
  description: string
  requires_code: boolean
  code?: string
}

export interface DiscountResult {
  auto:    AppliedDiscount[]   // auto-detected: happy hour, combo, bogo
  manual:  AppliedDiscount[]   // applicable but not auto (require manual selection)
  coupons: AppliedDiscount[]   // coupon-code-only promos
}

function isActiveNow(promo: Promotion, now: Date): boolean {
  if (!promo.active) return false

  // Check active days (ISO: 1=Mon, 7=Sun)
  if (promo.active_days?.length) {
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay() // convert Sun=0 to 7
    if (!promo.active_days.includes(dayOfWeek)) return false
  }

  // Check active hours
  const hour = now.getHours()
  if (promo.active_hour_start !== null && hour < promo.active_hour_start) return false
  if (promo.active_hour_end   !== null && hour >= promo.active_hour_end)  return false

  return true
}

function cartTotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + i.line_total, 0)
}

function evalPromo(promo: Promotion, cart: CartItem[]): AppliedDiscount | null {
  const total = cartTotal(cart)
  if (promo.min_spend && total < promo.min_spend) return null

  const type = promo.promotion_type

  // Combo: all combo products present with required qty
  if (type === 'combo' && promo.product_ids?.length && promo.bundle_price != null) {
    const comboMet = promo.product_ids.every(pid =>
      cart.some(i => i.product_id === pid && i.quantity >= 1)
    )
    if (!comboMet) return null
    const comboItemsTotal = cart
      .filter(i => promo.product_ids!.includes(i.product_id))
      .reduce((s, i) => s + i.unit_price, 0)
    const amountOff = Math.max(0, comboItemsTotal - promo.bundle_price)
    if (amountOff <= 0) return null
    return {
      promotion_id: promo.id, promotion_name: promo.name, type,
      amount_off: +amountOff.toFixed(2),
      description: `${promo.name} — bundle price A$${promo.bundle_price.toFixed(2)}`,
      requires_code: !!promo.requires_code,
    }
  }

  // BOGO: buy N get N free on same product
  if (type === 'bogo' || type === 'bogo_half') {
    const buyQty  = promo.buy_quantity  ?? 1
    const getQty  = promo.get_quantity  ?? 1
    const scope   = promo.applies_to
    const targets = scope === 'category' && promo.category_id
      ? cart.filter(i => i.category_id === promo.category_id)
      : scope === 'item' && promo.product_id
      ? cart.filter(i => i.product_id === promo.product_id)
      : cart

    let amountOff = 0
    for (const item of targets) {
      const sets = Math.floor(item.quantity / (buyQty + getQty))
      if (sets < 1) continue
      const freeQty = sets * getQty
      const discount = type === 'bogo' ? item.unit_price * freeQty : item.unit_price * freeQty * 0.5
      amountOff += discount
    }
    if (amountOff <= 0) return null
    return {
      promotion_id: promo.id, promotion_name: promo.name, type,
      amount_off: +amountOff.toFixed(2),
      description: `${promo.name} — buy ${buyQty} get ${getQty} ${type === 'bogo_half' ? 'half price' : 'free'}`,
      requires_code: !!promo.requires_code,
    }
  }

  // Percent off / happy hour
  if (type === 'percent_off' || type === 'happy_hour') {
    const pct = promo.discount_percent ?? 0
    if (pct <= 0) return null
    const scope   = promo.applies_to
    const targets = scope === 'category' && promo.category_id
      ? cart.filter(i => i.category_id === promo.category_id)
      : scope === 'item' && promo.product_id
      ? cart.filter(i => i.product_id === promo.product_id)
      : cart
    const base = targets.reduce((s, i) => s + i.line_total, 0)
    const amountOff = base * (pct / 100)
    if (amountOff <= 0) return null
    return {
      promotion_id: promo.id, promotion_name: promo.name, type,
      amount_off: +amountOff.toFixed(2),
      description: `${promo.name} — ${pct}% off`,
      requires_code: !!promo.requires_code,
    }
  }

  // Amount off
  if (type === 'amount_off') {
    const amt = promo.discount_amount ?? 0
    if (amt <= 0) return null
    const amountOff = Math.min(amt, total)
    return {
      promotion_id: promo.id, promotion_name: promo.name, type,
      amount_off: +amountOff.toFixed(2),
      description: `${promo.name} — A$${amt.toFixed(2)} off`,
      requires_code: !!promo.requires_code,
    }
  }

  // Free item: discount = unit_price of the cheapest matching item
  if (type === 'free_item' && promo.product_id) {
    const target = cart.find(i => i.product_id === promo.product_id)
    if (!target) return null
    return {
      promotion_id: promo.id, promotion_name: promo.name, type,
      amount_off: +target.unit_price.toFixed(2),
      description: `${promo.name} — 1 × ${target.product_name} free`,
      requires_code: !!promo.requires_code,
    }
  }

  return null
}

export function calculateApplicableDiscounts(
  cart: CartItem[],
  promotions: Promotion[],
  now: Date = new Date()
): DiscountResult {
  const result: DiscountResult = { auto: [], manual: [], coupons: [] }
  if (!cart.length || !promotions.length) return result

  const active = promotions.filter(p => isActiveNow(p, now))

  for (const promo of active) {
    const applied = evalPromo(promo, cart)
    if (!applied) continue

    if (promo.requires_code) {
      result.coupons.push(applied)
    } else {
      // Auto-apply: combos, happy hour, bogo
      const AUTO_TYPES = ['combo', 'happy_hour', 'bogo', 'bogo_half', 'free_item']
      if (AUTO_TYPES.includes(promo.promotion_type)) {
        result.auto.push(applied)
      } else {
        result.manual.push(applied)
      }
    }
  }

  return result
}

/** Apply a coupon code — returns the matching discount or null */
export function applyCode(
  code: string,
  cart: CartItem[],
  promotions: Promotion[],
  now: Date = new Date()
): AppliedDiscount | null {
  const promo = promotions.find(
    p => p.requires_code?.toUpperCase() === code.toUpperCase() && isActiveNow(p, now)
  )
  if (!promo) return null
  const applied = evalPromo(promo, cart)
  if (!applied) return null
  return { ...applied, code }
}