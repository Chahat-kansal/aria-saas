import { describe, it, expect } from 'vitest'
import { decideManualApply } from '@/lib/pos/manual-discount-policy'
import type { AppliedDiscount } from '@/lib/pos/discount-engine'

// PROMO-EXCLUSIVE-UI-1 — the manual-path rule, unit-tested.
//
// DiscountBar itself needs a DOM and this repo has no React testing stack (INFRA-UNITTEST-1
// installed Vitest only). Rather than add one, or fall back to a Playwright spec that would not run
// on the pre-push hook, the decision was extracted to a pure function — so the money rule IS covered
// and the component is left as a thin renderer of the outcome.

function d(over: Partial<AppliedDiscount> = {}): AppliedDiscount {
  return {
    promotion_id: 'p1', promotion_name: 'P1', type: 'percent_off',
    amount_off: 10, description: '10% off', requires_code: false,
    stacks_with_others: false,   // matches the DB default — the safety switch is OFF unless enabled
    stack_priority: 100,
    ...over,
  }
}

const EXCLUSIVE_A = d({ promotion_id: 'A', promotion_name: 'Winter Parlour', stacks_with_others: false })
const EXCLUSIVE_B = d({ promotion_id: 'B', promotion_name: 'Cold Day 50', stacks_with_others: false })
const STACKABLE_C = d({ promotion_id: 'C', promotion_name: 'Happy Hour', stacks_with_others: true })
const STACKABLE_D = d({ promotion_id: 'D', promotion_name: 'Member Bonus', stacks_with_others: true })

describe('nothing applied yet — everything is allowed', () => {
  it('applies an exclusive promotion', () => {
    expect(decideManualApply([], EXCLUSIVE_A).action).toBe('apply')
  })
  it('applies a stackable promotion', () => {
    expect(decideManualApply([], STACKABLE_C).action).toBe('apply')
  })
})

describe('an exclusive is already applied — nothing may join it', () => {
  it('refuses a second exclusive, naming the blocker', () => {
    const r = decideManualApply([EXCLUSIVE_A], EXCLUSIVE_B)
    expect(r.action).toBe('refuse')
    if (r.action === 'refuse') {
      expect(r.notice).toContain('Winter Parlour')
      expect(r.notice).toContain('Remove it first')
    }
  })

  it('refuses a stackable one too — the rule holds in BOTH directions', () => {
    expect(decideManualApply([EXCLUSIVE_A], STACKABLE_C).action).toBe('refuse')
  })

  it('re-tapping the SAME promotion is a no-op, not a refusal', () => {
    // Refusing a promotion because of itself would read as a broken button.
    expect(decideManualApply([EXCLUSIVE_A], EXCLUSIVE_A).action).toBe('apply')
  })
})

describe('applying an exclusive over existing discounts — replace, and say so', () => {
  it('replaces a single stackable and names what it replaced', () => {
    const r = decideManualApply([STACKABLE_C], EXCLUSIVE_A)
    expect(r.action).toBe('replace')
    if (r.action === 'replace') {
      expect(r.removeIds).toEqual(['C'])
      expect(r.notice).toContain('Winter Parlour replaced Happy Hour')
    }
  })

  it('replaces MULTIPLE stackables, naming all of them', () => {
    const r = decideManualApply([STACKABLE_C, STACKABLE_D], EXCLUSIVE_A)
    expect(r.action).toBe('replace')
    if (r.action === 'replace') {
      expect(r.removeIds.sort()).toEqual(['C', 'D'])
      expect(r.notice).toContain('Happy Hour')
      expect(r.notice).toContain('Member Bonus')
    }
  })
})

describe('stackables still stack — the switch only constrains exclusives', () => {
  it('a stackable joins another stackable', () => {
    expect(decideManualApply([STACKABLE_C], STACKABLE_D).action).toBe('apply')
  })
  it('and a third joins two', () => {
    expect(decideManualApply([STACKABLE_C, STACKABLE_D], d({ promotion_id: 'E', stacks_with_others: true })).action).toBe('apply')
  })
})

describe('the invariant, stated directly', () => {
  it('an exclusive is never combined with anything, in either direction', () => {
    // incoming exclusive over an existing one -> replace (never both)
    const over = decideManualApply([STACKABLE_C], EXCLUSIVE_A)
    expect(over.action).not.toBe('apply')
    // anything over an existing exclusive -> refused (never both)
    expect(decideManualApply([EXCLUSIVE_A], STACKABLE_C).action).toBe('refuse')
    expect(decideManualApply([EXCLUSIVE_A], EXCLUSIVE_B).action).toBe('refuse')
  })
})
