import type { CartItem } from '@/lib/pos/discount-engine'
import { calculateApplicableDiscounts } from '@/lib/pos/discount-engine'

type Promotion = Parameters<typeof calculateApplicableDiscounts>[1][number]

/**
 * INFRA-UNITTEST-1 — cart item for promotion tests.
 *
 * PREVENTS: the fixture fault that produced FALSE PASSES twice (S-PROMO-RULE-1 and again in
 * PROMO-STACK-1). CartItem.line_total is required by the engine; omit it and every promotion
 * silently evaluates to "does not apply", which makes every fail-closed assertion pass for
 * entirely the wrong reason — a suite that proves nothing while looking green.
 *
 * line_total is DERIVED here and deliberately NOT accepted as an override, so a caller cannot
 * forget it or set it inconsistently with quantity x unit_price. That is the whole point of this
 * helper existing rather than tests hand-rolling an object literal.
 */
export function cartItem(
  overrides: Partial<Omit<CartItem, 'line_total'>> = {},
): CartItem {
  const quantity = overrides.quantity ?? 1
  const unit_price = overrides.unit_price ?? 100
  return {
    product_id: 'prod-1',
    product_name: 'Pancakes',
    category_id: null,
    ...overrides,
    quantity,
    unit_price,
    line_total: +(quantity * unit_price).toFixed(2),   // derived, never passed in
  }
}

/**
 * INFRA-UNITTEST-1 — promotion row for engine tests.
 *
 * PREVENTS: the second half of the same fault. A promotion only reaches the discount calculation
 * after isActiveNow() passes, so an inactive flag or a closed date/day/hour window makes every case
 * return "does not apply" — indistinguishable from the behaviour under test. Defaults here are
 * deliberately wide open (active, all 7 days, hours 0-23, no date bounds) so a test that wants a
 * gate to close must close it EXPLICITLY, and the reader can see it doing so.
 *
 * Both `active` and `is_active` are set: the live table populates both columns and the engine reads
 * `active`. Reconciling that duplicate pair is a different sprint, so the fixture mirrors reality
 * rather than picking a side.
 *
 * stacks_with_others defaults to FALSE to match the database default — the owner's safety switch is
 * off unless deliberately enabled, and tests should inherit that same starting point.
 */
export function promo(overrides: Record<string, unknown> = {}): Promotion {
  return {
    id: 'promo-1',
    name: 'Promo',
    promotion_type: 'percent_off',
    applies_to: 'order',
    category_id: null,
    product_id: null,
    product_ids: null,
    bundle_price: null,
    discount_percent: 10,
    discount_amount: null,
    active_days: [1, 2, 3, 4, 5, 6, 7],
    active_hour_start: 0,
    active_hour_end: 23,
    starts_at: null,
    ends_at: null,
    requires_code: null,
    stacks_with_others: false,
    stack_priority: 100,
    active: true,
    is_active: true,
    min_spend: null,
    buy_quantity: null,
    get_quantity: null,
    customer_group_id: null,
    min_customer_lifetime_spend: null,
    min_customer_visits: null,
    max_total_uses: null,
    current_uses: 0,
    max_uses_per_customer: null,
    max_uses_per_day: null,
    exclude_discounted: false,
    trigger_type: null,
    trigger_config: null,
    ...overrides,
  } as unknown as Promotion
}

/**
 * The bucket a promotion lands in decides whether resolveStacking runs at all — this was the OTHER
 * false-pass trap. Exported as named constants so a test says which path it is exercising instead
 * of encoding a magic string a reader has to cross-check against AUTO_TYPES.
 *   AUTO   — in AUTO_TYPES, lands in result.auto, auto-applied in a loop by DiscountBar
 *   MANUAL — not in AUTO_TYPES, lands in result.manual, rendered as buttons a cashier clicks
 */
export const AUTO_TYPE = 'happy_hour'
export const MANUAL_TYPE = 'percent_off'

/** Fixed instant used across promotion tests: Tuesday 2026-08-04, 10:00. */
export const TEST_NOW = new Date('2026-08-04T10:00:00')
