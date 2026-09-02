import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { labelApplies } from './labels'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * TS-1 PHASE 5 — LABELS EXPIRE OUT OF READS; SUPERSEDE REPLACES OUT LOUD.
 *
 * The live proof (3 labels → read returns 2, table holds 3; supersede link resolves; second
 * attempt claims 0) is in the report. This holds the two properties that would rot silently: the
 * null-expiry arm of the filter, and the single-statement supersede.
 */
describe('TS-1 phase 5 · a null expiry means NEVER expires', () => {
  it('THE TRAP: `expires_at > now()` alone silently drops every never-expiring label', () => {
    // Proven live: the naive filter returned 1 of the 3 seeded labels, losing "forever".
    const forever = { expires_at: null }
    const live = { expires_at: new Date(Date.now() + 86_400_000).toISOString() }
    const dead = { expires_at: new Date(Date.now() - 86_400_000).toISOString() }

    expect(labelApplies(forever)).toBe(true)
    expect(labelApplies(live)).toBe(true)
    expect(labelApplies(dead)).toBe(false)

    // The naive predicate, for contrast — it is wrong on exactly one of the three.
    const naive = (l: { expires_at: string | null }) =>
      l.expires_at !== null && new Date(l.expires_at).getTime() > Date.now()
    expect(naive(forever)).toBe(false)          // ← the bug
    expect(labelApplies(forever)).not.toBe(naive(forever))
  })

  it('the boundary is the instant itself, and it is exclusive', () => {
    const at = new Date('2026-09-02T12:00:00.000Z')
    expect(labelApplies({ expires_at: '2026-09-02T12:00:00.000Z' }, at)).toBe(false)
    expect(labelApplies({ expires_at: '2026-09-02T12:00:00.001Z' }, at)).toBe(true)
  })

  it('the query filter and labelApplies use the SAME rule', () => {
    // Two rules would drift: a list filtered in SQL and then re-filtered in JS would disagree.
    const src = strip(read('src/lib/team/labels.ts'))
    expect(src).toContain('expires_at.is.null,expires_at.gt.')
    expect(src).toMatch(/if \(!label\.expires_at\) return true/)
  })

  it('include_expired is OPT-IN, so no ordinary read gets stale labels by forgetting a flag', () => {
    const src = strip(read('src/lib/team/labels.ts'))
    expect(src).toMatch(/include_expired = false/)
    expect(src).toMatch(/if \(!include_expired\)/)
  })

  it('a read error THROWS rather than returning an empty label set', () => {
    // Returning [] would tell the caller "this customer has no labels" when the truth is
    // "we could not find out". RULE 7.
    const src = strip(read('src/lib/team/labels.ts'))
    expect(src).toMatch(/throw new Error\('labels_unavailable/)
    expect(src).not.toMatch(/catch\s*\{\s*return \[\]/)
  })

  it('no select(*) and no check-then-insert', () => {
    const src = strip(read('src/lib/team/labels.ts'))
    expect(src).not.toMatch(/\.select\('\*'\)/)
    expect(src).toContain('LABEL_COLUMNS')
    // Re-applying a label is an upsert on the DB's unique index, not a prior existence read.
    expect(src).toContain('onConflict')
  })

  it('THE ONE EXISTING READER now filters expired tags — and ONLY tags', () => {
    const route = strip(read('src/app/api/pos/classifications/route.ts'))
    expect(route).toMatch(/if \(table === 'pos_tags'\)/)
    expect(route).toContain('expires_at.is.null,expires_at.gt.')
    // brands and families are untouched: the filter is inside the tag branch, and select('*')
    // is deliberately left alone rather than narrowed (that would drop fields a client may read).
    expect(route).toContain(".select('*')")
  })
})

describe('TS-1 phase 5 · supersede is one statement, and never leaves a pending row linked', () => {
  const src = strip(read('src/lib/decisions/supersede.ts'))

  it('ANTI-VACUITY — the module was read', () => {
    expect(src.length).toBeGreaterThan(800)
    expect(src).toContain('supersedeDecision')
  })

  it('status and superseded_by are set in the SAME update — never two statements', () => {
    const at = src.indexOf('.update({')
    expect(at).toBeGreaterThan(-1)
    const patch = src.slice(at, src.indexOf('})', at))
    expect(patch).toContain("status: 'superseded'")
    expect(patch).toContain('superseded_by: newId')
    // Two statements would leave a window where the row carries a link while still reading
    // pending — exactly the "looks valid" state this abolishes.
    expect((src.match(/\.update\(\{/g) ?? []).length).toBe(1)
  })

  it('the claim is atomic on status=pending, so two racing supersedes cannot both win', () => {
    expect(src).toMatch(/\.eq\('status', 'pending'\)/)
    expect(src).toMatch(/if \(!data\) return \{ ok: false, reason: 'not_pending' \}/)
  })

  it('a row cannot supersede itself', () => {
    expect(src).toMatch(/oldId === newId/)
  })

  it('the spine CHECK is not extended — declined is used, and the payload keeps them separable', () => {
    // business_events.event_type has no 'superseded' value and the standing ruling forbids adding
    // one. 'declined' is the closest true statement: the old proposal will not be acted on.
    expect(src).toContain("event_type: 'declined'")
    expect(src).not.toMatch(/event_type: 'superseded'/)
    expect(src).toContain("entity_type: 'decision'")
  })
})
