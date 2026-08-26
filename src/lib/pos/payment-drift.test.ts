import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { computeDrift, describeDrift, PAYMENTS_RECORDED_FROM } from './payment-drift'
import { buildPaymentRows } from './create-sale'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const CREATE_SALE = read('src/lib/pos/create-sale.ts')
const TERMINAL = read('src/app/pos/(fullscreen)/terminal/page.tsx')
const SALE_PAYMENTS = read('src/app/api/pos/sale-payments/route.ts')
const DRIFT = read('src/lib/pos/payment-drift.ts')

/** Strip comments before asserting — otherwise a prose mention passes for an implementation. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// An explicit loop, deliberately — see the note in payment-drift.ts. The canon rail flags any
// file carrying both a `total_amount` reference and a functional-fold call. This file has both,
// but what it sums is tender lines in a fixture, not revenue. Keeping the guard strict is worth
// more than the shorter expression.
function sum(ns: number[]): number { let t = 0; for (const n of ns) t += n; return t }

const sale = (id: string, total: number, method = 'cash') => ({
  id, created_at: '2026-08-27T01:00:00.000Z', payment_method: method, total_amount: total,
})

describe('POS-INTEGRITY-1 §2.1 · a tender line is written in dollars AND cents', () => {
  it('single tender = one row for the sale total', () => {
    const rows = buildPaymentRows({ paymentMethod: 'card', totalAmount: 16 }, 'sale-1', 'biz-1')
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(16)
    expect(rows[0].amount_cents).toBe(1600)
    expect(rows[0].business_id).toBe('biz-1')
    expect(rows[0].sale_id).toBe('sale-1')
  })

  it('cents are DERIVED from dollars, never the reverse', () => {
    // 0.1 + 0.2 style values are exactly where a cents->dollars round trip drifts.
    const rows = buildPaymentRows({ paymentMethod: 'cash', totalAmount: 20.55 }, 's', 'b')
    expect(rows[0].amount).toBe(20.55)
    expect(rows[0].amount_cents).toBe(2055)
    expect(rows[0].amount_cents / 100).toBe(rows[0].amount)
  })

  it('the fixed split pair produces one row per tender, summing to the total', () => {
    const rows = buildPaymentRows(
      { paymentMethod: 'split', splitCash: 10, splitCard: 8, totalAmount: 18 }, 's', 'b')
    expect(rows.map(r => r.method)).toEqual(['cash', 'card'])
    expect(sum(rows.map(r => r.amount))).toBe(18)
  })

  it('an arbitrary split array produces one row per tender', () => {
    const rows = buildPaymentRows({
      paymentMethod: 'split', totalAmount: 30,
      splitPayments: [{ method: 'cash', amount: 5 }, { method: 'card', amount: 20 }, { method: 'gift_card', amount: 5 }],
    }, 's', 'b')
    expect(rows).toHaveLength(3)
    expect(sum(rows.map(r => r.amount))).toBe(30)
  })

  it('TWO IDENTICAL $5.00 CASH TENDERS BOTH SURVIVE — they are a real transaction', () => {
    // Two people each paying $5 cash on one split bill. Any dedupe on (sale_id, method, amount)
    // would silently drop one of them and under-record the till by $5.
    const rows = buildPaymentRows({
      paymentMethod: 'split', totalAmount: 10,
      splitPayments: [{ method: 'cash', amount: 5 }, { method: 'cash', amount: 5 }],
    }, 's', 'b')
    expect(rows).toHaveLength(2)
    expect(sum(rows.map(r => r.amount))).toBe(10)
  })

  it('a zero-value leg of a split is not written as a row', () => {
    const rows = buildPaymentRows({ paymentMethod: 'split', splitCash: 18, splitCard: 0, totalAmount: 18 }, 's', 'b')
    expect(rows).toHaveLength(1)
    expect(rows[0].method).toBe('cash')
  })

  it('tips ride on the first line only — a split tip is never invented as an allocation', () => {
    const rows = buildPaymentRows(
      { paymentMethod: 'split', splitCash: 10, splitCard: 8, totalAmount: 18, tipAmount: 3 }, 's', 'b')
    expect(rows[0].tip_amount).toBe(3)
    expect(rows[1].tip_amount).toBe(0)
    expect(sum(rows.map(r => r.tip_amount))).toBe(3)
  })

  it('with no tip supplied every line is a truthful 0, not a guess', () => {
    const rows = buildPaymentRows({ paymentMethod: 'cash', totalAmount: 9 }, 's', 'b')
    expect(rows[0].tip_amount).toBe(0)
  })
})

describe('POS-INTEGRITY-1 §3 · reconciliation arithmetic', () => {
  it('a fully-paid sale is not an incident', () => {
    const r = computeDrift([sale('s1', 18)], [{ sale_id: 's1', amount: 10 }, { sale_id: 's1', amount: 8 }])
    expect(r.incidents).toHaveLength(0)
    expect(r.sales_total).toBe(18)
    expect(r.recorded_total).toBe(18)
  })

  it('CATCHES THE DOUBLE-WRITE THAT WAS LIVE — 4 rows on an $18 split reads as -$18.00', () => {
    // The exact shape of sale 1296dff9-0935-4234-9f00-086fadce133c before this sprint:
    // card=8 | cash=10 | card=8 | cash=10 = 36.00 recorded against an 18.00 sale.
    const r = computeDrift([sale('s1', 18, 'split')], [
      { sale_id: 's1', amount: 8 }, { sale_id: 's1', amount: 10 },
      { sale_id: 's1', amount: 8 }, { sale_id: 's1', amount: 10 },
    ])
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].recorded_payments).toBe(36)
    expect(r.incidents[0].drift).toBe(-18)
  })

  it('catches a sale with NO tender lines at all', () => {
    const r = computeDrift([sale('s1', 40)], [])
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].drift).toBe(40)
  })

  it('compares at cent precision, so float addition does not manufacture an incident', () => {
    // 0.1 + 0.2 === 0.30000000000000004 — a naive !== would report this fully-paid sale.
    const r = computeDrift([sale('s1', 0.3)], [{ sale_id: 's1', amount: 0.1 }, { sale_id: 's1', amount: 0.2 }])
    expect(r.incidents).toHaveLength(0)
  })

  it('a one-cent shortfall IS an incident — precision tolerance is not a rounding amnesty', () => {
    const r = computeDrift([sale('s1', 10)], [{ sale_id: 's1', amount: 9.99 }])
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].drift).toBeCloseTo(0.01, 10)
  })

  it('payments belonging to another sale are never credited to this one', () => {
    const r = computeDrift([sale('s1', 10)], [{ sale_id: 's2', amount: 10 }])
    expect(r.incidents).toHaveLength(1)
    expect(r.incidents[0].recorded_payments).toBe(0)
  })
})

describe('POS-INTEGRITY-1 §3 · the report never invents a figure (GROUNDING-TEETH)', () => {
  const base = { from: '2026-08-27T00:00:00.000Z', to: '2026-08-28T00:00:00.000Z' }

  it('says there were no sales rather than reporting $0.00 as a measurement', () => {
    const s = describeDrift({ sales_checked: 0, sales_total: 0, recorded_total: 0, incidents: [], ...base })
    expect(s).toMatch(/no completed sales/i)
    expect(s).not.toContain('$0.00')
  })

  it('reads like an accountant when everything reconciles', () => {
    const s = describeDrift({ sales_checked: 41, sales_total: 1284.5, recorded_total: 1284.5, incidents: [], ...base })
    expect(s).toBe('41 sales, $1284.50 in sales, $1284.50 in recorded payments, drift $0.00.')
  })

  it('names incidents as incidents', () => {
    const s = describeDrift({
      sales_checked: 2, sales_total: 28, recorded_total: 46,
      incidents: [{ sale_id: 's1', created_at: base.from, payment_method: 'split', sale_total: 18, recorded_payments: 36, drift: -18 }],
      ...base,
    })
    expect(s).toContain('1 sale do not reconcile')
    expect(s).toContain('-$18.00')
    expect(s).toContain('incident')
  })

  it('a window that could not be checked is never reported as clean', () => {
    // The cron pushes this string on failure; it must not read like a pass.
    expect(code(read('src/app/api/cron/reconciliation/route.ts')))
      .toMatch(/Payment drift could not be checked/)
  })
})

describe('POS-INTEGRITY-1 §2.2 · the payment insert is fatal', () => {
  it('voids the sale and returns an error, matching the item insert', () => {
    const c = code(CREATE_SALE)
    expect(c).toMatch(/system:payments_insert_failed/)
    expect(c).toMatch(/return \{ sale: null, error: paymentsErr\.message, status: 500, voided: true \}/)
  })

  it('MUTATION PROBE — reverting to the swallow is detectable', () => {
    const mutated = CREATE_SALE.replace(
      "await supabase.from('pos_sales').update({ status: 'voided', notes: 'system:payments_insert_failed' }).eq('id', sale.id)",
      "console.error('[createSale] pos_sale_payments insert failed:', paymentsErr.message)",
    )
    expect(mutated).not.toBe(CREATE_SALE)
    expect(code(mutated)).not.toMatch(/system:payments_insert_failed/)
  })
})

describe('POS-INTEGRITY-1 §2.3 · every sale carries an idempotency key', () => {
  it('the till sends one', () => {
    expect(code(TERMINAL)).toMatch(/idempotency_key: capturedIdempotencyKey/)
  })

  it('the key is derived from the business operation, not minted per attempt', () => {
    const c = code(TERMINAL)
    expect(c).toMatch(/'sale-' \+ capturedBusinessId \+ '-' \+ capturedRegisterKey \+ '-' \+ saleRef\.current/)
    // minted only when absent — the whole point
    expect(c).toMatch(/if \(!saleRef\.current\)/)
  })

  it('THE REF DIES WITH THE CART — otherwise the next customer is swallowed as a replay', () => {
    // The dangerous failure mode of this change: a key that outlives its cart makes the NEXT sale
    // an idempotent replay of the last one, and the till would take money for nothing.
    const clearSale = code(TERMINAL).match(/function clearSale\(\)[\s\S]{0,600}?\n  \}/)?.[0] ?? ''
    expect(clearSale, 'clearSale() must reset saleRef').toMatch(/saleRef\.current = null/)
  })

  it('MUTATION PROBE — a ref that outlives the cart is detectable', () => {
    // Regex, not a literal: this repo's working tree is CRLF, so a '\n'-terminated literal never
    // matches and the probe would pass vacuously while proving nothing.
    const mutated = TERMINAL.replace(/\r?\n\s*saleRef\.current = null;/, '')
    expect(mutated).not.toBe(TERMINAL)
    const clearSale = code(mutated).match(/function clearSale\(\)[\s\S]{0,600}?\n  \}/)?.[0] ?? ''
    expect(clearSale).not.toMatch(/saleRef\.current = null/)
  })
})

describe('POS-INTEGRITY-1 §2.4 · a retry never duplicates tender lines', () => {
  it('the replay path counts existing lines before writing any', () => {
    const c = code(CREATE_SALE)
    expect(c).toMatch(/from\('pos_sale_payments'\)[\s\S]{0,120}count: 'exact', head: true/)
    expect(c).toMatch(/if \(\(existingLines \?\? 0\) === 0\)/)
  })

  it('repair reuses buildPaymentRows — there is ONE definition of a tender line', () => {
    // Two definitions would drift; this codebase's most-repeated failure.
    const c = code(CREATE_SALE)
    const calls = c.match(/buildPaymentRows\(/g) ?? []
    expect(calls.length).toBeGreaterThanOrEqual(3) // declaration + normal path + repair path
    expect(c).toMatch(/const repairRows = buildPaymentRows\(params, String\(existing\.id\), businessId\)/)
  })

  it('MUTATION PROBE — dropping the existing-lines check is detectable', () => {
    const mutated = CREATE_SALE.replace('if ((existingLines ?? 0) === 0) {', 'if (true) {')
    expect(mutated).not.toBe(CREATE_SALE)
    expect(code(mutated)).not.toMatch(/if \(\(existingLines \?\? 0\) === 0\)/)
  })
})

describe('POS-INTEGRITY-1 · the duplicate split write is gone', () => {
  it('the terminal no longer POSTs split tenders to /api/pos/sale-payments', () => {
    // createSale already writes them from split_cash/split_card; posting again double-recorded
    // every split sale (proven live: 4 rows, -$18.00 drift).
    expect(code(TERMINAL)).not.toMatch(/fetch\('\/api\/pos\/sale-payments'/)
  })

  it('but the route itself still exists for out-of-band corrections (RULE 0)', () => {
    expect(code(SALE_PAYMENTS)).toMatch(/from\('pos_sale_payments'\)\s*\.insert\(/)
  })

  it('and the till still sends the split amounts the rail writes from', () => {
    const c = code(TERMINAL)
    expect(c).toMatch(/split_cash: capturedPayMethod === 'split'/)
    expect(c).toMatch(/split_card: capturedPayMethod === 'split'/)
  })
})

describe('POS-INTEGRITY-1 · scoping and honesty of the drift reads', () => {
  it('both reads carry their own business_id filter — supabaseAdmin bypasses RLS', () => {
    const c = code(DRIFT)
    expect((c.match(/\.eq\('business_id', businessId\)/g) ?? []).length).toBe(2)
  })

  it("uses the canonical completed filter, not != 'voided' (RULE 6)", () => {
    const c = code(DRIFT)
    expect(c).toMatch(/\.eq\('status', 'completed'\)/)
    expect(c).not.toMatch(/neq\('status', 'voided'\)/)
  })

  it('never examines before tender data was trustworthy', () => {
    expect(PAYMENTS_RECORDED_FROM).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(code(DRIFT)).toMatch(/const from = sinceIso > floor \? sinceIso : floor/)
  })

  it('does NOT backfill history', () => {
    const c = code(DRIFT)
    expect(c).not.toMatch(/\.update\(|\.insert\(|\.upsert\(/)
  })

  it('MUTATION PROBE — an unscoped read is detectable', () => {
    // Drops only the FIRST occurrence (the sales read), leaving the payments read scoped, so the
    // probe proves the count assertion above can actually go red.
    const mutated = DRIFT.replace(/\r?\n\s*\.eq\('business_id', businessId\)[^\r\n]*/, '')
    expect(mutated).not.toBe(DRIFT)
    expect((code(mutated).match(/\.eq\('business_id', businessId\)/g) ?? []).length).toBe(1)
  })
})
