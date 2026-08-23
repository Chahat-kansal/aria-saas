import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { composeAgentSpec, planCreateAgent, ALWAYS_TRUE_BOX } from './composer'

// MS13 PHASE 4 — THE COMPOSER. describe → spec card → approve → row; NOTHING persists on reject.

const COMPOSER_SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'agents', 'composer.ts'), 'utf8')
const EXECUTOR_SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'aria', 'ask', 'action-executor.ts'), 'utf8')

describe('the spec card', () => {
  it('extracts a name and instructions from a describe message', () => {
    const spec = composeAgentSpec('create an agent called Review Watcher that summarises my Google reviews every Monday')
    expect(spec.name).toBe('Review Watcher')
    expect(spec.instructions).toContain('summarises my Google reviews')
  })

  it('always carries the ALWAYS-TRUE box — the guarantees that are not up to the agent', () => {
    const spec = composeAgentSpec('make an agent that checks stock levels')
    for (const line of ALWAYS_TRUE_BOX) expect(spec.card).toContain(line)
    expect(spec.card.join('\n')).toMatch(/decision card for YOUR approval/)
    expect(spec.card.join('\n')).toMatch(/tenant is resolved server-side/)
  })

  it('the staged action is read-only by default and requires confirmation', () => {
    const planned = planCreateAgent('build an agent that watches waste')
    expect(planned.type).toBe('create_agent')
    expect(planned.payload.allowed_tools).toEqual([])
    expect(planned.requires_confirmation).toBe(true)
    expect(planned.risk).toBe('low')
  })
})

describe('nothing persists on reject', () => {
  it('the composer is PURE — it cannot write: no supabase import, no insert/upsert anywhere', () => {
    // Staging goes through pending_action on the conversation row (cleared on reject/expiry by
    // the existing machinery). The composer itself must be structurally incapable of persisting —
    // THE mutation target: adding a supabase import + insert on stage turns this red.
    expect(COMPOSER_SRC).not.toMatch(/supabase/i)
    expect(COMPOSER_SRC).not.toMatch(/\.insert\(|\.upsert\(|\.update\(/)
  })

  it('the ONLY aria_skills agent write lives in the executor, behind confirm', () => {
    expect(EXECUTOR_SRC).toMatch(/case 'create_agent': \{/)
    expect(EXECUTOR_SRC).toMatch(/kind: 'agent',/)
    // and the executor path is the confirm path — runAction is only reached via executeAction
    // after isConfirmation() matched (route.ts:325 machinery, unchanged this sprint).
  })

  it('V5 stays closed: no CODE reads or writes aria_skills.share_token', () => {
    // share_token also exists on aria_task_outputs (a pre-existing, working share feature), so
    // the assertion is scoped to files that touch aria_skills, with two documented exclusions:
    // src/types/database.types.ts (generated schema types — describes the column, never queries
    // it) and comment lines (this sprint's own notes SAY share_token is reserved).
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const files = execSync('git grep -l "share_token" -- src/ || true', { encoding: 'utf8', cwd: process.cwd() })
      .split('\n').map(f => f.trim()).filter(Boolean)
      .filter(f => !f.endsWith('src/types/database.types.ts'))
      // …and test files: an assertion ABOUT share_token necessarily names it. (This exclusion was
      // added because this very test became its own offender the moment it was committed — git
      // grep only sees TRACKED files, so it passed while untracked and failed on the next push.
      // Recorded rather than quietly patched: a check whose result depends on staging state is a
      // check that can lie.)
      .filter(f => !/\.test\.tsx?$/.test(f))
    const offenders = files.filter(f => {
      const code = readFileSync(join(process.cwd(), f), 'utf8')
        .split('\n').filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join('\n')
      return /aria_skills/.test(code) && /share_token/.test(code)
    })
    expect(offenders).toEqual([])
  })
})

describe('the executor insert (unit, fake admin client)', () => {
  it('creates exactly one kind=agent row with empty allowed_tools on confirm', async () => {
    vi.resetModules()
    const writes: Array<{ table: string; payload: Record<string, unknown> }> = []
    vi.doMock('@/lib/supabase-admin', () => {
      // Fully chainable fake: every builder method returns the chain, and the chain resolves to
      // {data,error}. A hand-shaped fake ran out of .eq() depth AFTER the write and produced a
      // false "ok: false" — the write had actually happened. Depth is not the thing under test.
      const makeChain = (table: string): Record<string, unknown> => {
        const chain: Record<string, unknown> = {
          then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
          single: async () => ({ data: { id: 'agent-1' }, error: null }),
          maybeSingle: async () => ({ data: null, error: null }),
        }
        for (const m of ['select', 'eq', 'in', 'is', 'not', 'gt', 'gte', 'lt', 'lte', 'ilike', 'order', 'limit']) {
          chain[m] = () => chain
        }
        chain.insert = (payload: Record<string, unknown>) => { writes.push({ table, payload }); return chain }
        chain.update = (payload: Record<string, unknown>) => { writes.push({ table, payload }); return chain }
        chain.upsert = (payload: Record<string, unknown>) => { writes.push({ table, payload }); return chain }
        chain.delete = () => chain
        return chain
      }
      return { supabaseAdmin: { from: (table: string) => makeChain(table) } }
    })
    const { executeAction } = await import('@/lib/aria/ask/action-executor')
    const { planCreateAgent: plan } = await import('./composer')
    const result = await executeAction(plan('create an agent called Probe that lists dead stock'), 'biz-test', 'user-test')
    const agentWrites = writes.filter(w => w.table === 'aria_skills' && w.payload.kind !== undefined)
    expect(result.ok).toBe(true)
    expect(agentWrites.length).toBe(1)
    expect(agentWrites[0].payload.kind).toBe('agent')
    expect(agentWrites[0].payload.allowed_tools).toEqual([])
    expect(agentWrites[0].payload.business_id).toBe('biz-test')
    vi.doUnmock('@/lib/supabase-admin')
  })
})
