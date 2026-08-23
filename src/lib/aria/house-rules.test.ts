import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatHouseRulesBlock, HOUSE_RULE_KIND } from './house-rules'

// MS14 PHASE 4 — HOUSE RULES AS MEMORY, VERSIONED NOT OVERWRITTEN.
//
// A rule the owner changed is a NEW VERSION; the old wording stays readable. "We used to round to
// $0.05" is exactly the kind of thing an owner needs to look up, and an overwrite destroys it.

const SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'house-rules.ts'), 'utf8')

type Row = Record<string, unknown>

/** In-memory aria_business_memory with real insert/update semantics. */
function makeMemoryDb(seed: Row[] = []) {
  const rows: Row[] = [...seed]
  let nextId = 1
  const client = {
    from: (_t: string) => {
      const filters: Array<(r: Row) => boolean> = []
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => { filters.push(r => r[col] === val); return chain },
        is: (col: string, val: unknown) => { filters.push(r => (val === null ? r[col] == null : r[col] === val)); return chain },
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows.filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
        single: async () => {
          const m = rows.filter(r => filters.every(f => f(r)))[0] ?? null
          return { data: m, error: m ? null : { message: 'no rows' } }
        },
        insert: (payload: Row) => {
          const row = { id: 'rule-' + nextId++, created_at: new Date(2026, 0, nextId).toISOString(), deleted_at: null, superseded_by: null, ...payload }
          rows.push(row)
          return {
            select: () => ({
              single: async () => ({ data: row, error: null }),
              maybeSingle: async () => ({ data: row, error: null }),
            }),
          }
        },
        update: (patch: Row) => {
          const upd: Record<string, unknown> = { ...chain }
          const applyFilters: Array<(r: Row) => boolean> = [...filters]
          const updChain: Record<string, unknown> = {
            eq: (col: string, val: unknown) => { applyFilters.push(r => r[col] === val); return updChain },
            then: (res: (v: unknown) => unknown) => {
              for (const r of rows) if (applyFilters.every(f => f(r))) Object.assign(r, patch)
              return Promise.resolve({ data: null, error: null }).then(res)
            },
          }
          void upd
          return updChain
        },
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows.filter(r => filters.every(f => f(r))), error: null }).then(res),
      }
      return chain
    },
  }
  return { client, rows }
}

async function loadWith(seed: Row[] = []) {
  vi.resetModules()
  const { client, rows } = makeMemoryDb(seed)
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: client }))
  const mod = await import('./house-rules')
  return { ...mod, rows }
}

describe('a rule is stored as a kind in aria_business_memory — no new table', () => {
  it('creates one row with kind=house_rule and the owner’s words verbatim', async () => {
    const { createHouseRule, rows } = await loadWith()
    const r = await createHouseRule({ businessId: 'biz-1', content: 'never discount coffee', topic: 'pricing' })
    expect(r.ok).toBe(true)
    expect(rows.length).toBe(1)
    expect(rows[0]).toMatchObject({
      business_id: 'biz-1', kind: HOUSE_RULE_KIND, content: 'never discount coffee', topic: 'pricing',
    })
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('an empty rule is refused — an unstated rule is not a rule', async () => {
    const { createHouseRule, rows } = await loadWith()
    expect((await createHouseRule({ businessId: 'b', content: '   ' })).ok).toBe(false)
    expect(rows.length).toBe(0)
    vi.doUnmock('@/lib/supabase-admin')
  })
})

describe('editing SUPERSEDES — the previous version stays readable', () => {
  const seed = [{
    id: 'rule-old', business_id: 'biz-1', kind: HOUSE_RULE_KIND, content: 'we round prices to $0.05',
    topic: 'pricing', is_active: true, deleted_at: null, superseded_by: null, importance: 9,
    created_at: '2026-01-01T00:00:00.000Z',
  }]

  it('creates a new row and points the old one at it — never an in-place overwrite', async () => {
    const { editHouseRule, rows } = await loadWith(seed)
    const res = await editHouseRule({ businessId: 'biz-1', ruleId: 'rule-old', newContent: 'we round prices to $0.10' })
    expect(res.ok).toBe(true)

    // TWO rows now exist: the history is intact.
    expect(rows.length).toBe(2)
    const oldRow = rows.find(r => r.id === 'rule-old')!
    const newRow = rows.find(r => r.id !== 'rule-old')!

    // THE MUTATION TARGET: the old wording is still there, word for word.
    expect(oldRow.content).toBe('we round prices to $0.05')
    expect(newRow.content).toBe('we round prices to $0.10')

    // …and it is retired, pointing at its replacement, in the shape every reader already filters.
    expect(oldRow.is_active).toBe(false)
    expect(oldRow.deleted_at).toBeTruthy()
    expect(oldRow.deleted_reason).toBe('superseded')
    expect(oldRow.superseded_by).toBe(newRow.id)
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('only the current version is in force; history still lists both', async () => {
    const { editHouseRule, listHouseRules, listHouseRuleHistory } = await loadWith(seed)
    await editHouseRule({ businessId: 'biz-1', ruleId: 'rule-old', newContent: 'we round prices to $0.10' })
    const live = await listHouseRules('biz-1')
    expect(live.map(r => r.content)).toEqual(['we round prices to $0.10'])
    const history = await listHouseRuleHistory('biz-1')
    expect(history.length).toBe(2)
    expect(history.map(r => r.content)).toContain('we round prices to $0.05')
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('the new version is written BEFORE the old is retired — never a gap with no rule in force', () => {
    const createAt = SRC.indexOf('const created = await createHouseRule')
    const supersedeAt = SRC.indexOf("deleted_reason: 'superseded'")
    expect(createAt).toBeGreaterThan(-1)
    expect(createAt).toBeLessThan(supersedeAt)
  })

  it('the source performs no in-place content update', () => {
    // An `.update({ content ... })` anywhere in this module would be an overwrite by definition.
    expect(SRC).not.toMatch(/\.update\(\s*\{[^}]*content:/)
  })
})

describe('Aria never authors the content', () => {
  it('the module contains no model call and no generated text', () => {
    expect(SRC).not.toMatch(/anthropic|callAnthropic|messages\.create|openai|gemini/i)
  })

  it('the prompt block presents rules as the owner’s standing instructions, below safety rules', () => {
    const block = formatHouseRulesBlock([{ content: 'never discount coffee' }, { content: 'target GP 68%' }])
    expect(block).toContain('stated by the owner')
    expect(block).toContain('• never discount coffee')
    expect(block).toMatch(/unless they conflict with a safety, grounding, or legal rule above — those always win/)
  })

  it('no rules → no block at all (zero prompt cost when unused)', () => {
    expect(formatHouseRulesBlock([])).toBe('')
  })
})
