import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sanitiseMetadata } from './track-usage'

// MS14 PHASE 3 — METERING THAT ACTUALLY WRITES, AND NEVER BLOCKS.
//
// usage_logs had ZERO rows despite five live callers because the insert was dispatched as
// `void builder` — and a PostgREST builder only issues its request inside `then()`. These tests
// pin BOTH halves: the request is genuinely dispatched (not merely constructed), and the caller
// is never made to wait for it.

const SRC = readFileSync(join(process.cwd(), 'src', 'lib', 'track-usage.ts'), 'utf8')

/** A builder that records whether anyone actually dispatched it by calling then(). */
function makeSpyClient(behaviour: 'resolve' | 'reject' | 'never' = 'resolve') {
  const state = { inserts: [] as Array<Record<string, unknown>>, dispatched: 0 }
  const client = {
    from: (_table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        state.inserts.push(payload)
        return {
          then: (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
            state.dispatched++ // ← the request is only sent when this runs
            if (behaviour === 'resolve') return Promise.resolve({ error: null }).then(onOk, onErr)
            if (behaviour === 'reject') return Promise.reject(new Error('insert failed')).then(onOk, onErr)
            return new Promise(() => {}) // never settles
          },
        }
      },
    }),
  }
  return { client, state }
}

async function loadWith(behaviour: 'resolve' | 'reject' | 'never') {
  vi.resetModules()
  const { client, state } = makeSpyClient(behaviour)
  vi.doMock('@/lib/supabase-admin', () => ({ supabaseAdmin: client }))
  const mod = await import('./track-usage')
  return { trackUsage: mod.trackUsage, state }
}

describe('the write is actually dispatched — the bug that kept usage_logs empty', () => {
  it('one action writes exactly one usage row, and the request is SENT', async () => {
    const { trackUsage, state } = await loadWith('resolve')
    trackUsage({ business_id: 'biz-1', event_type: 'outlet_created' })
    await new Promise(r => setTimeout(r, 0))
    expect(state.inserts.length).toBe(1)
    expect(state.dispatched).toBe(1) // constructing the builder is NOT enough — this is the fix
    expect(state.inserts[0]).toMatchObject({ business_id: 'biz-1', event_type: 'outlet_created' })
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('the insert chain TERMINATES in .then() — the dispatch, not just the builder', () => {
    // Asserted positively: the insert(...) call is followed by .then( (comments allowed between).
    // A negative "no bare void builder" regex was tried first and MATCHED THE FIXED CODE — its
    // [^;]* ran past the .then to the statement's semicolon. A check that passes on the broken
    // code and fails on the fixed one is worse than no check; recorded rather than quietly swapped.
    expect(SRC).toMatch(/\.insert\(\{[\s\S]*?\}\)\s*(?:\/\/[^\n]*\n\s*)*\.then\(/)
  })

  it('a call with no business_id or no event_type writes nothing', async () => {
    const { trackUsage, state } = await loadWith('resolve')
    trackUsage({ business_id: '', event_type: 'x' })
    trackUsage({ business_id: 'b', event_type: '' })
    await new Promise(r => setTimeout(r, 0))
    expect(state.inserts.length).toBe(0)
    vi.doUnmock('@/lib/supabase-admin')
  })
})

describe('it can never block or break the action it measures', () => {
  it('returns undefined SYNCHRONOUSLY even when the write never settles', async () => {
    const { trackUsage, state } = await loadWith('never')
    const before = Date.now()
    const returned = trackUsage({ business_id: 'biz-1', event_type: 'sale_adjacent' })
    const elapsed = Date.now() - before
    // THE mutation target: awaiting the insert would return a Promise (and hang on 'never').
    expect(returned).toBeUndefined()
    expect(elapsed).toBeLessThan(50)
    expect(state.dispatched).toBe(1) // dispatched, but not waited on
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('a REJECTED write never throws into the caller and never becomes an unhandled rejection', async () => {
    const { trackUsage } = await loadWith('reject')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => trackUsage({ business_id: 'biz-1', event_type: 'staff_created' })).not.toThrow()
    await new Promise(r => setTimeout(r, 0))
    expect(spy).toHaveBeenCalled() // logged, not swallowed silently — and not fatal
    spy.mockRestore()
    vi.doUnmock('@/lib/supabase-admin')
  })

  it('the function is not async — it cannot be awaited into a hot path', () => {
    expect(SRC).toMatch(/export function trackUsage\(/)
    expect(SRC).not.toMatch(/export async function trackUsage/)
  })
})

describe('event types and counts only — never personal data', () => {
  it('drops customer identifiers and message content even if a caller passes them', () => {
    const out = sanitiseMetadata({
      mode: 'daily', count: 3,
      customer_name: 'Jane Smith', email: 'jane@x.com', phone: '0400000000',
      message: 'hi Jane', body: 'text', note: 'called her',
    })
    expect(out).toEqual({ mode: 'daily', count: 3 })
  })

  it('drops nested objects — the usual way personal data reaches telemetry', () => {
    expect(sanitiseMetadata({ count: 1, payload: { customer: 'Jane' } })).toEqual({ count: 1 })
  })

  it('caps string length so free text cannot ride along', () => {
    const out = sanitiseMetadata({ source: 'x'.repeat(500) })
    expect(String(out.source).length).toBe(64)
  })
})

describe('the events the limits are about are actually metered', () => {
  it.each([
    ['outlet_created', join('src', 'app', 'api', 'pos', 'outlets', 'route.ts')],
    ['staff_created', join('src', 'app', 'api', 'staff', 'members', 'route.ts')],
    ['agent_created', join('src', 'lib', 'aria', 'ask', 'action-executor.ts')],
    ['routine_created', join('src', 'app', 'api', 'aria', 'intelligence', 'schedules', 'route.ts')],
  ])('%s is recorded at its creation point', (event, file) => {
    const src = readFileSync(join(process.cwd(), file), 'utf8')
    expect(src).toContain(`event_type: '${event}'`)
  })

  it('AI spend is NOT double-metered — aria_ai_calls already measures it', () => {
    // Deliberate: a second meter for the same thing is a second source that drifts (MS12's
    // lesson). ai_spend_usd is enforced against aria_monthly_spend, which is already written.
    const outlets = readFileSync(join(process.cwd(), 'src', 'app', 'api', 'pos', 'outlets', 'route.ts'), 'utf8')
    expect(outlets).not.toContain("event_type: 'ai_call'")
  })
})
