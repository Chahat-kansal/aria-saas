import { describe, it, expect } from 'vitest'
import { PROMO_FIELDS } from '@/lib/pos/promo-fields'

// PROMO-FORM-PARITY-1 — PROMO_FIELDS is LOAD-BEARING and fails silently.
//
// It is a strict allowlist applied immediately before the DB write, so a column missing from it is
// dropped without error: the owner ticks "can't be combined", the form saves happily, and the
// setting never persists. That exact trap was caught by hand in S-PROMO-RULE-1 (trigger_type and
// trigger_config were missing). Now that a unit runner exists, it cannot recur unnoticed.
//
// This asserts CONTAINMENT, not equality — the list legitimately grows, and a test that broke on
// every new column would be deleted within a month. What it pins is the set the promotion FORMS
// can actually set, which is the set whose loss is invisible.

describe('PROMO_FIELDS — the allowlist the promotion forms depend on', () => {
  it('carries every column the promotion forms can set', () => {
    expect(PROMO_FIELDS).toEqual(expect.arrayContaining([
      'stacks_with_others', 'stack_priority', 'trigger_type', 'trigger_config',
    ]))
  })

  it('carries the scheduling fields the discount engine gates on', () => {
    // isActiveNow() reads these; if a form could set them but the allowlist dropped them, a
    // promotion would appear scheduled in the UI and run unrestricted at the till.
    expect(PROMO_FIELDS).toEqual(expect.arrayContaining([
      'active', 'active_days', 'active_hour_start', 'active_hour_end', 'starts_at', 'ends_at',
    ]))
  })

  it('carries the usage caps', () => {
    expect(PROMO_FIELDS).toEqual(expect.arrayContaining([
      'max_total_uses', 'max_uses_per_customer', 'max_uses_per_day', 'current_uses',
    ]))
  })

  it('still excludes the legacy alias keys, which normPromoPayload folds in and deletes', () => {
    // 'type' -> promotion_type and 'is_active' -> active are handled by the alias logic before the
    // allowlist runs. Listing them here would let a raw key reach the DB.
    expect(PROMO_FIELDS).not.toContain('type')
    expect(PROMO_FIELDS).not.toContain('is_active')
  })
})
