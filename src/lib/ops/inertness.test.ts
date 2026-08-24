import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { classifyWriter, classifyCron, sortColdest, WRITER_REGISTRY } from './inertness'

// MS15 PHASES 5-6 — THE INERTNESS LEDGER.
//
// COLD IS NOT BROKEN. That distinction is the whole design: conflating them produces an alert
// list nobody reads, which is exactly how ten "exists, looks correct, does nothing" instances got
// through. The mutation for this phase is precisely that conflation.

const NOW = new Date('2026-08-24T00:00:00Z')
const COLD_LIST_SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'ops', 'cold-list.ts'), 'utf8')

describe('cold, stale and warm are three different things', () => {
  it('COLD + trigger has NOT happened = expected, and NOT suspicious', () => {
    const v = classifyWriter(
      { target: 'aria_skills (kind=agent)', writer: 'the composer', deployedAt: '2026-08-22', triggerHasOccurred: false },
      { rowCount: 0, lastRowAt: null }, NOW,
    )
    expect(v.state).toBe('cold')
    expect(v.suspicious).toBe(false) // nobody has built an agent — that is not a fault
    expect(v.detail).toMatch(/expected/)
  })

  it('COLD + trigger HAS happened = the trackUsage shape, and IS suspicious', () => {
    const v = classifyWriter(
      { target: 'usage_logs', writer: 'trackUsage()', deployedAt: '2026-08-22', triggerHasOccurred: true },
      { rowCount: 0, lastRowAt: null }, NOW,
    )
    expect(v.state).toBe('cold')
    expect(v.suspicious).toBe(true)
    expect(v.detail).toMatch(/it is not working/)
  })

  it('STALE — it worked once and stopped — is always worth a look', () => {
    const v = classifyWriter(
      { target: 'aria_conversation_summaries', writer: 'summariser', deployedAt: '2026-06-15', triggerHasOccurred: true, staleAfterDays: 14 },
      { rowCount: 1, lastRowAt: '2026-07-01T00:00:00Z' }, NOW,
    )
    expect(v.state).toBe('stale')
    expect(v.suspicious).toBe(true)
    expect(v.daysSinceLastRow).toBeGreaterThan(14)
  })

  it('WARM is silent', () => {
    const v = classifyWriter(
      { target: 'aria_action_log', writer: 'executeAction', deployedAt: '2026-06-25', triggerHasOccurred: true, staleAfterDays: 30 },
      { rowCount: 64, lastRowAt: '2026-08-23T00:00:00Z' }, NOW,
    )
    expect(v.state).toBe('warm')
    expect(v.suspicious).toBe(false)
  })

  it('THE MUTATION TARGET — cold must never be reported as broken', () => {
    // Treating cold as broken is the failure this phase exists to avoid. Every cold-but-expected
    // writer must stay out of the suspicious set, or the list becomes noise and stops being read.
    const expectedCold = WRITER_REGISTRY.filter(w => !w.triggerHasOccurred)
    expect(expectedCold.length).toBeGreaterThan(0)
    for (const w of expectedCold) {
      const v = classifyWriter(w, { rowCount: 0, lastRowAt: null }, NOW)
      expect(v.state).toBe('cold')
      expect(v.suspicious).toBe(false)
    }
  })
})

describe('the ledger stops reporting once a row lands', () => {
  it('a single row moves usage_logs out of cold', () => {
    const expectation = WRITER_REGISTRY.find(w => w.target === 'usage_logs')!
    const cold = classifyWriter(expectation, { rowCount: 0, lastRowAt: null }, NOW)
    const warm = classifyWriter(expectation, { rowCount: 1, lastRowAt: '2026-08-23T12:00:00Z' }, NOW)
    expect(cold.state).toBe('cold')
    expect(warm.state).toBe('warm')
    expect(warm.suspicious).toBe(false)
  })
})

describe('crons are asked the same question', () => {
  it('a registered cron that has NEVER logged is cold and suspicious — the Smoke Suite shape', () => {
    const v = classifyCron('some-registered-job', { runs: 0, lastRunAt: null }, NOW)
    expect(v.state).toBe('cold')
    expect(v.suspicious).toBe(true)
    expect(v.detail).toMatch(/never logged a run/)
  })

  it('a cron that stopped is stale', () => {
    // Real data: hypothesis-engine last ran 2026-07-12 after 58 runs.
    const v = classifyCron('hypothesis-engine', { runs: 58, lastRunAt: '2026-07-12T15:00:10Z' }, NOW)
    expect(v.state).toBe('stale')
    expect(v.suspicious).toBe(true)
    expect(v.daysSinceLastRun).toBeGreaterThan(30)
  })

  it('a cron that ran this morning is warm', () => {
    const v = classifyCron('customer-scoring', { runs: 97, lastRunAt: '2026-08-24T03:01:01Z' }, NOW)
    expect(v.state).toBe('warm')
    expect(v.suspicious).toBe(false)
  })
})

describe('the list is ordered the way you would work it', () => {
  it('suspicious first, then oldest', () => {
    const items = [
      { name: 'fresh-ok', suspicious: false, age: 1 },
      { name: 'old-ok', suspicious: false, age: 90 },
      { name: 'recent-bad', suspicious: true, age: 2 },
      { name: 'old-bad', suspicious: true, age: 60 },
    ]
    const sorted = sortColdest(items, i => i.age)
    expect(sorted.map(i => i.name)).toEqual(['old-bad', 'recent-bad', 'old-ok', 'fresh-ok'])
  })
})

describe('THE MUTATION TARGET (phase 6) — the list is generated, never hardcoded', () => {
  it('cold-list.ts holds no literal verdict array', () => {
    const body = COLD_LIST_SRC.split('\n')
      .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
      .join('\n')
    // A hardcoded entry would look like a state assigned to a name in a literal.
    expect(body).not.toMatch(/state:\s*'(cold|stale|warm)'/)
    expect(body).not.toMatch(/writers:\s*\[\s*\{/)
  })

  it('every verdict comes from the registry crossed with a live observation', () => {
    expect(COLD_LIST_SRC).toMatch(/for \(const expectation of WRITER_REGISTRY\)/)
    expect(COLD_LIST_SRC).toMatch(/await observeTarget\(expectation\.target\)/)
    expect(COLD_LIST_SRC).toMatch(/classifyWriter\(expectation, observed, now\)/)
    expect(COLD_LIST_SRC).toMatch(/from\('cron_logs'\)/)
  })

  it('a FAILED observation is reported as nothing, never as cold', () => {
    // Inventing a finding from a broken query is the failure-pattern-#5 trap: a diagnostic that
    // manufactures the problem it claims to find.
    expect(COLD_LIST_SRC).toMatch(/rowCount: -1/)
    expect(COLD_LIST_SRC).toMatch(/if \(observed\.rowCount < 0\) continue/)
  })

  it('every registry entry names what writes it and when it shipped', () => {
    for (const w of WRITER_REGISTRY) {
      expect(w.writer.length).toBeGreaterThan(10)
      expect(w.deployedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof w.triggerHasOccurred).toBe('boolean')
    }
    // The three the sprint brief names must all be watched.
    const targets = WRITER_REGISTRY.map(w => w.target)
    expect(targets).toContain('usage_logs')
    expect(targets.some(t => t.includes('house_rule'))).toBe(true)
    expect(targets.some(t => t.includes('agent'))).toBe(true)
  })
})
