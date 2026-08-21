import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importPackFields } from '@/lib/inventory/uom'

// MS12 PHASE 5 — THE IMPORT HOLE. MS11 tombstoned items_per_case/case_quantity/cases_*/sell_uom;
// the CSV import still wrote two of them. A tombstone only holds if nothing writes to it — an
// import path is exactly how a dead column gets quietly repopulated.

const CSV = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'import', 'csv', 'route.ts'), 'utf8')
const PIMPORT = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'products', 'import', 'route.ts'), 'utf8')

describe('importPackFields — the front-door conversion', () => {
  it('a pack column writes the canonical pair: unit "case" (the column IS the unit), qty from the cell', () => {
    expect(importPackFields('24', null)).toEqual({ ok: true, patch: { purchase_uom: 'case', purchase_uom_qty: 24 } })
    expect(importPackFields(null, 12)).toEqual({ ok: true, patch: { purchase_uom: 'case', purchase_uom_qty: 12 } })
  })

  it('no pack columns → no patch, no refusal — packs are optional', () => {
    expect(importPackFields(null, null)).toEqual({ ok: true, patch: null })
    expect(importPackFields('', '')).toEqual({ ok: true, patch: null })
  })

  it('agreeing duplicates pass; disagreeing duplicates refuse as ambiguous', () => {
    expect(importPackFields('24', '24')).toEqual({ ok: true, patch: { purchase_uom: 'case', purchase_uom_qty: 24 } })
    const r = importPackFields('12', '24')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toContain('disagree')
  })

  it('invalid values refuse the row with a reason — never defaulted, never dropped silently', () => {
    for (const bad of ['0', '-6', 'a dozen']) {
      const r = importPackFields(bad, null)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.reason).toContain('refused')
    }
  })
})

describe('the import routes no longer write tombstoned columns', () => {
  it('csv import: pack cells land on purchase_uom/purchase_uom_qty, nothing tombstoned in the payload', () => {
    expect(CSV).toContain('importPackFields')
    expect(CSV).toMatch(/purchase_uom: packResult\.patch\?\.purchase_uom/)
    // The tombstoned keys must not appear as INSERT/UPDATE payload keys any more.
    expect(CSV).not.toMatch(/case_quantity, items_per_case,/)
    // The one allowed appearance is the LLM column-mapping prompt line ('- items_per_case: items
    // per case'); the lookahead sits DIRECTLY after the colon so \s* cannot backtrack around it
    // (the original form matched via zero-width \s* — a real backtracking hole this comment marks).
    expect(CSV).not.toMatch(/\bitems_per_case\s*[,:](?! items per case)/)
  })

  it('csv import: a refused pack size refuses the ROW, with the reason in errors', () => {
    expect(CSV).toMatch(/if \(!packResult\.ok\) \{/)
    expect(CSV).toMatch(/errors\.push\(`\$\{name\}: \$\{packResult\.reason\}`\)/)
  })

  it('products/import: same conversion, same refusal', () => {
    expect(PIMPORT).toContain('importPackFields')
    expect(PIMPORT).toMatch(/__pack_refusal/)
    expect(PIMPORT).not.toMatch(/product\.items_per_case =/)
  })
})
