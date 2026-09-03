import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describeStep, renderRunReport, type RecordedStep } from './report'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

/**
 * M11 PHASE 5 — WHAT ARIA ACTUALLY CHANGED.
 *
 * ⚠️ EVERY FIXTURE BELOW IS A REAL PRODUCTION ROW, copied verbatim out of `aria_action_log` on
 * 3 Sep 2026 — ids, values, oddities and all. They are not invented shapes, which matters here more
 * than usual: this module's whole job is to read a JSONB blob somebody else wrote, and a fixture
 * written to match the reader is a test of nothing. `[V3] A` really is called that, and
 * `adjust_type: "garbage_mode"` really is in the record — which is exactly why the describer reads
 * `from`/`to` and never tries to interpret `adjust_type`.
 *
 * The defect being fixed is already shipped on two surfaces: `AuditLogCard` rendered
 * "Bulk price update · 2 items" and nothing else, while the row it was rendering said
 * `[V3] A was A$10.00, [V3] B was A$10.00, rule: set 0.0001`.
 */

// ── REAL ROWS ───────────────────────────────────────────────────────────────────────────────────
const REAL_ADJUST_STOCK: RecordedStep = {
  id: 'bfe2345f-6b99-4053-8161-2e326f715fac',
  action_type: 'adjust_stock',
  before_state: { products: [{ id: 'fa0727e2-1141-4275-832f-6de8e8de4f9b', name: '[V3] A', stock: 55 }] },
  after_state: {
    moves: [{ to: 50, from: 55, name: '[V3] A', delta: -5, product_id: 'fa0727e2-1141-4275-832f-6de8e8de4f9b' }],
    affected: 1, quantity: 5, canonical: 'items_on_hand', adjust_type: 'garbage_mode',
  },
  executed_at: '2026-06-25T03:43:22.288+00:00', rolled_back_at: null,
}

const REAL_BULK_PRICE: RecordedStep = {
  id: 'b703dd60-48b5-4afe-bd28-d2c93b67c77a',
  action_type: 'bulk_price_update',
  before_state: {
    products: [
      { id: 'fa0727e2-1141-4275-832f-6de8e8de4f9b', name: '[V3] A', price: 10 },
      { id: 'e3f5d94a-e807-4ad1-bd8b-29c6a3a01ffa', name: '[V3] B', price: 10 },
    ],
  },
  after_state: { failed: 0, affected: 2, price_change_type: 'set', price_change_value: 0.0001 },
  rolled_back_at: null,
}

const REAL_UPDATE_PROMO: RecordedStep = {
  id: '933e425f-bf47-4e95-a603-6f73e2ccaa94',
  action_type: 'update_promotion',
  before_state: { id: 'efcc01a7-e2b8-4834-b690-fc062e9db1eb', bundle_price: null, promotion_type: 'percentage_discount', discount_amount: null, discount_percent: 15 },
  after_state: { name: '10% Off Iced Coffee', value: 18, updated_at: '2026-06-25T03:46:29.179Z', promotion_id: 'efcc01a7-e2b8-4834-b690-fc062e9db1eb', discount_percent: 18 },
  rolled_back_at: null,
}

const REAL_CATEGORY_DISCOUNT: RecordedStep = {
  id: '4a9acc9f-f261-437d-a9e5-f0bdee7a8207',
  action_type: 'apply_category_discount',
  before_state: {},
  after_state: {
    name: 'Free Coffee Promotion', active: true, applies_to: 'category', active_days: [1, 2, 3, 4, 5, 6, 7],
    category_id: '82e4202e-83c7-4d7f-af3c-0622b9f9be9f', promotion_id: '7d6e7967-ffe6-4466-9555-3086607494d6',
    category_name: 'Coffee', promotion_type: 'percentage_discount', discount_percent: 100,
  },
  rolled_back_at: null,
}

describe('M11 phase 5 · a real row says what changed, not how many items', () => {
  it('adjust_stock: the from→to is rendered, and adjust_type is NOT interpreted', () => {
    const d = describeStep(REAL_ADJUST_STOCK)
    expect(d.changes).toEqual(['[V3] A: 55 → 50 (-5)'])
    expect(d.status).toBe('changed')
    // The real row's adjust_type is the string "garbage_mode". Anything that read it as a verb
    // would render nonsense; from/to is the truth regardless of what the type field says.
    expect(d.changes.join(' ')).not.toContain('garbage')
  })

  it('bulk_price_update: the OLD prices come from before_state — which the route did not fetch', () => {
    const d = describeStep(REAL_BULK_PRICE)
    expect(d.changes).toContain('[V3] A: was A$10.00')
    expect(d.changes).toContain('[V3] B: was A$10.00')
    expect(d.changes).toContain('Rule applied: set 0.0001')
    expect(d.affected_count).toBe(2)
    expect(d.failed_count).toBe(0)
  })

  it('bulk_price_update does NOT state a new price, because the row does not record one', () => {
    // Deriving it (10 → 0.0001 by rule "set") would be arithmetic presented as a reading. If the
    // rule were ever misread, the owner would be shown a price that was never applied.
    const d = describeStep(REAL_BULK_PRICE)
    expect(d.changes.join(' ')).not.toContain('→')
    expect(d.changes.join(' ')).not.toContain('A$0.00 ')
  })

  it('update_promotion: 15% → 18%, both halves from the record', () => {
    expect(describeStep(REAL_UPDATE_PROMO).changes).toContain('10% Off Iced Coffee: 15% → 18%')
  })

  it('apply_category_discount: the name, the category and the percentage', () => {
    const d = describeStep(REAL_CATEGORY_DISCOUNT)
    expect(d.changes).toEqual(['Created "Free Coffee Promotion"', 'Applies to the Coffee category', '100% off'])
  })

  it('money is rendered as dollars with two places — RULE 6', () => {
    expect(describeStep(REAL_BULK_PRICE).changes.join(' ')).toMatch(/A\$10\.00/)
  })
})

describe('M11 phase 5 · GROUNDING-TEETH — nothing is stated that is not in the record', () => {
  it('an unrecognised action type says so rather than describing it in generalities', () => {
    const d = describeStep({ id: 'x', action_type: 'create_invoice', before_state: {}, after_state: { total: 400 } })
    expect(d.status).toBe('unrecorded')
    expect(d.headline).toContain('recorded this action but not what it changed')
    expect(d.changes).toEqual([])
    // And emphatically NOT "completed successfully", which the row does not support.
    expect(d.headline).not.toMatch(/success|completed|done/i)
  })

  it('a missing count is null, never 0 — "we do not know" is not "none"', () => {
    const d = describeStep({ id: 'x', action_type: 'adjust_stock', after_state: { moves: [{ name: 'A', from: 1, to: 2 }] } })
    expect(d.failed_count).toBeNull()
    expect(d.affected_count).toBeNull()
  })

  it('a half-written move is skipped rather than rendered with a hole in it', () => {
    const d = describeStep({
      id: 'x', action_type: 'adjust_stock',
      after_state: { moves: [{ name: 'A', from: 1, to: 2 }, { name: 'B', from: null }, { from: 3, to: 4 }] },
    })
    expect(d.changes).toEqual(['A: 1 → 2 (+1)'])
  })

  it('null and malformed states do not throw', () => {
    for (const s of [
      { id: 'a', action_type: 'adjust_stock', before_state: null, after_state: null },
      { id: 'b', action_type: 'bulk_price_update', after_state: { products: 'nope' } },
      { id: 'c', action_type: 'create_promotion', after_state: [] as unknown as Record<string, unknown> },
    ] as RecordedStep[]) {
      expect(() => describeStep(s)).not.toThrow()
      expect(describeStep(s).status).toBe('unrecorded')
    }
  })

  it('a deduped create says it did not create anything', () => {
    const d = describeStep({ id: 'x', action_type: 'create_promotion', after_state: { name: 'Weekend', deduped: true } })
    expect(d.changes).toContain('Already existed — the same promotion was not created twice')
  })
})

describe('M11 phase 5 · a failure is the FIRST line, never a footnote', () => {
  const failed: RecordedStep = {
    id: 'f1', action_type: 'bulk_price_update',
    before_state: { products: [{ name: 'Flat White', price: 5 }] },
    after_state: { failed: 3, affected: 0, price_change_type: 'increase_pct', price_change_value: 10 },
  }
  const partly: RecordedStep = {
    id: 'f2', action_type: 'bulk_price_update',
    before_state: { products: [{ name: 'Latte', price: 5 }] },
    after_state: { failed: 1, affected: 4, price_change_type: 'increase_pct', price_change_value: 10 },
  }

  it('nothing landed → failed; some landed → partly failed. They are different sentences.', () => {
    expect(describeStep(failed).status).toBe('failed')
    expect(describeStep(failed).headline).toContain('FAILED')
    expect(describeStep(partly).status).toBe('partly_failed')
    expect(describeStep(partly).headline).toContain('4 went through, 1 did not')
  })

  it('the run report leads with the failure count, before any success', () => {
    const out = renderRunReport([REAL_ADJUST_STOCK, partly, REAL_UPDATE_PROMO])
    expect(out.split('\n')[0]).toContain('1 of 3 steps did not complete')
    // And the failing step's body precedes the successful ones.
    expect(out.indexOf('PARTLY FAILED')).toBeLessThan(out.indexOf('[V3] A: 55 → 50'))
  })

  it('a clean run has no warning line at all — the flag means something', () => {
    const out = renderRunReport([REAL_ADJUST_STOCK, REAL_UPDATE_PROMO])
    expect(out).not.toContain('did not complete')
    expect(out.split('\n')[0]).toContain('Adjust stock')
  })

  it('an undone step is neither a success nor a failure', () => {
    const d = describeStep({ ...REAL_ADJUST_STOCK, rolled_back_at: '2026-06-25T04:00:00Z' })
    expect(d.status).toBe('rolled_back')
    expect(d.headline).toContain('undone')
  })

  it('the summary counts unrecorded SEPARATELY from changed', () => {
    const out = renderRunReport([
      REAL_ADJUST_STOCK,
      { id: 'u', action_type: 'create_invoice', after_state: {} },
    ])
    expect(out).toContain('1 changed')
    expect(out).toContain('1 with no record of what changed')
  })

  it('an empty run says so rather than rendering an empty report', () => {
    expect(renderRunReport([])).toBe('Nothing has been done yet.')
  })

  it('MUTATION — dropping the failed step from the report makes this suite RED', () => {
    // The sprint's named mutation. A report built from only the steps that worked reads as a clean
    // run, which is the single worst thing this module could produce.
    const steps = [REAL_ADJUST_STOCK, partly, REAL_UPDATE_PROMO]
    const honest = renderRunReport(steps)
    const mutated = renderRunReport(steps.filter(s => s.id !== 'f2'))

    expect(honest).toContain('did not complete')
    expect(mutated).not.toContain('did not complete')      // ← what the drop costs
    expect(mutated).not.toContain('PARTLY FAILED')
    expect(honest).not.toBe(mutated)
  })
})

describe('M11 phase 5 · THE RAIL — the surfaces actually render it', () => {
  it('the audit route now selects before_state, and still selects everything it did', () => {
    const route = read('src/app/api/aria/ask/audit/route.ts')
    expect(route).toContain('before_state')
    // RULE 0: purely additive. Every field the one consumer already read is still there.
    for (const f of ['id', 'action_type', 'entity_type', 'entity_ids', 'after_state', 'triggered_by', 'executed_at', 'rolled_back_at', 'message_excerpt']) {
      expect(route, 'audit route dropped ' + f).toContain(f)
    }
  })

  it('AuditLogCard renders the CHANGES, through the shared describer', () => {
    const card = read('src/components/aria/AuditLogCard.tsx')
    expect(card).toContain("from '@/lib/aria/works/report'")
    expect(card).toContain('describeStep(')
    expect(card).toContain('d.changes.map')
    // RULE 0 — the item count and the Undo button it sat beside are KEPT, not replaced.
    expect(card).toContain('item{entry.entity_ids.length !== 1')
    expect(card).toContain('Undo')
  })

  it('there is ONE describer, not one per surface', () => {
    // The card and any future plan report must not word the same change differently. N-copies
    // drift, failure pattern #4: six business-id resolvers, three health computations.
    // Comments stripped first: the card's own header QUOTES an example rendering ("[V3] A 55 → 50")
    // to explain what was missing, and a naive scan matches that prose rather than any code. My
    // first version of this assertion did exactly that and failed on my own comment.
    const card = read('src/components/aria/AuditLogCard.tsx')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
    expect(card).not.toMatch(/\.moves\b/)
    expect(card).not.toMatch(/after_state\.(discount_percent|price_change_type|failed)/)
    expect(card).not.toContain('→')
  })
})
