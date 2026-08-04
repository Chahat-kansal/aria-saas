import { describe, it, expect } from 'vitest'
import { calculateApplicableDiscounts } from '@/lib/pos/discount-engine'
import { cartItem, promo, MANUAL_TYPE, TEST_NOW } from '@/lib/pos/__fixtures__/cart'

// INFRA-UNITTEST-1 — the S-PROMO-RULE-1 assertions, ported. Every expectation was observed against
// the real engine in that sprint and then deleted with the probe script.
//
// EVERY FAIL-CLOSED TEST HAS A POSITIVE CONTROL NEXT TO IT. This is not ceremony: twice now a
// promotion suite passed its fail-closed cases because the fixture was wrong and NOTHING applied in
// any scenario. A test asserting "does not apply" is worthless unless a sibling proves the same
// code path CAN apply. Each describe block below pairs them deliberately.

const cart = [cartItem({ unit_price: 100 })]

function applies(over: Record<string, unknown>, weather: { max_temp_c: number } | null): boolean {
  const p = promo({ promotion_type: MANUAL_TYPE, ...over })
  const r = calculateApplicableDiscounts(cart, [p], { now: TEST_NOW, weather })
  return r.auto.length + r.manual.length + r.coupons.length > 0
}

const COLD = { trigger_type: 'weather_max_temp_below', trigger_config: { celsius: 10 } }
const HOT = { trigger_type: 'weather_max_temp_above', trigger_config: { celsius: 30 } }

describe('unconditional promotions are unaffected by the trigger work', () => {
  it('applies with no signal present', () => {
    expect(applies({}, null)).toBe(true)
  })
  it('applies with a signal present', () => {
    expect(applies({}, { max_temp_c: 30 })).toBe(true)
  })
})

describe('cold-day trigger — boundary is INCLUSIVE', () => {
  it('8C applies (below threshold)', () => expect(applies(COLD, { max_temp_c: 8 })).toBe(true))
  it('10C applies (exactly at threshold)', () => expect(applies(COLD, { max_temp_c: 10 })).toBe(true))
  it('11C does not apply (above threshold)', () => expect(applies(COLD, { max_temp_c: 11 })).toBe(false))
})

describe('hot-day trigger — boundary is INCLUSIVE', () => {
  it('32C applies (above threshold)', () => expect(applies(HOT, { max_temp_c: 32 })).toBe(true))
  it('30C applies (exactly at threshold)', () => expect(applies(HOT, { max_temp_c: 30 })).toBe(true))
  it('29C does not apply (below threshold)', () => expect(applies(HOT, { max_temp_c: 29 })).toBe(false))
})

describe('FAIL CLOSED — each paired with a positive control', () => {
  it('POSITIVE CONTROL: this exact rule DOES apply when the signal is present', () => {
    expect(applies(COLD, { max_temp_c: 4 })).toBe(true)
  })

  it('no signal (missing or expired) — cold rule does not apply', () => {
    expect(applies(COLD, null)).toBe(false)
  })
  it('no signal — hot rule does not apply', () => {
    expect(applies(HOT, null)).toBe(false)
  })
  it('celsius absent from trigger_config — does not apply', () => {
    expect(applies({ trigger_type: 'weather_max_temp_below', trigger_config: {} }, { max_temp_c: 0 })).toBe(false)
  })
  it('celsius non-numeric — does not apply', () => {
    expect(applies({ trigger_type: 'weather_max_temp_below', trigger_config: { celsius: 'ten' } }, { max_temp_c: 0 })).toBe(false)
  })
  it('unknown trigger type (a future CHECK value shipped before this code) — does not apply', () => {
    expect(applies({ trigger_type: 'stock_below', trigger_config: { celsius: 10 } }, { max_temp_c: 0 })).toBe(false)
  })
})

describe('the trigger filters, it does not bypass the existing gates', () => {
  // Positive control: 0C satisfies the cold rule, so any failure below is the OTHER gate closing.
  it('POSITIVE CONTROL: cold rule at 0C applies when nothing else blocks it', () => {
    expect(applies(COLD, { max_temp_c: 0 })).toBe(true)
  })

  it('inactive promotion still does not apply', () => {
    expect(applies({ ...COLD, active: false }, { max_temp_c: 0 })).toBe(false)
  })
  it('wrong day of week still does not apply', () => {
    // TEST_NOW is a Tuesday (ISO 2); allowing only Monday must close the gate.
    expect(applies({ ...COLD, active_days: [1] }, { max_temp_c: 0 })).toBe(false)
  })
})

describe('daily cap — the sprint headline rule, "max 3 per member per day"', () => {
  function withUsage(dailyCount: number) {
    const p = promo({ id: 'p1', promotion_type: MANUAL_TYPE, ...COLD, max_uses_per_day: 3 })
    const r = calculateApplicableDiscounts(cart, [p], {
      now: TEST_NOW,
      weather: { max_temp_c: 0 },
      usage: { daily_redemptions: { p1: dailyCount } },
    })
    return r.auto.length + r.manual.length + r.coupons.length > 0
  }

  it('2 of 3 used — still applies (positive control)', () => expect(withUsage(2)).toBe(true))
  it('3 of 3 used — cap reached, does not apply', () => expect(withUsage(3)).toBe(false))
})
