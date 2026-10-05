import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * M18B · PHASE 1 — THE REAL CLASSIFIER AND THE REAL TWO TTLs.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE TWO MUTATIONS FAILED TO FAIL. `ai-router-breaker.test.ts` mocks
 * `@/lib/aria/circuit-breaker`, which is right for testing the ROUTER's decisions — but it meant
 * breaking `isHardProviderError` or collapsing the hard TTL changed nothing in the suite. The
 * mutation check found a genuine hole, not a formality:
 *
 *     a 429 is misclassified as a hard fault   STILL GREEN - NOT VERIFIED
 *     the hard TTL collapses to OPEN_SEC       STILL GREEN - NOT VERIFIED
 *
 * These drive the real module. Nothing here is mocked except the database.
 */

type Row = { id: string; started_at: string; trigger_error: string | null }
let rows: Row[] = []
let readError: string | null = null
const inserted: Array<Record<string, unknown>> = []

vi.mock('@/lib/supabase-admin', () => {
  const builder = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const self: any = {}
    for (const m of ['select', 'eq', 'is', 'gte', 'order', 'limit', 'update']) self[m] = () => self
    self.insert = (row: Record<string, unknown>) => {
      inserted.push(row)
      return { select: () => ({ single: async () => ({ data: { id: 'new-incident' }, error: null }) }) }
    }
    self.maybeSingle = async () => ({ data: rows[0] ?? null, error: readError ? { message: readError } : null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    self.then = (res: any, rej: any) =>
      Promise.resolve({ data: rows, error: readError ? { message: readError } : null }).then(res, rej)
    return self
  }
  return { supabaseAdmin: { from: () => builder() } }
})
vi.mock('@/lib/security/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }))

const { isHardProviderError, isTransientError, isAnthropicUnreachable, isAnthropicCircuitOpen, recordAnthropicHardDown } =
  await import('./circuit-breaker')

const ago = (sec: number) => new Date(Date.now() - sec * 1000).toISOString()

beforeEach(() => {
  rows = []
  readError = null
  inserted.length = 0
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('M18B phase 1 · isHardProviderError — only a human can clear these', () => {
  it('⚠️ THE TWO FAULTS THIS SPRINT EXISTS FOR ARE HARD', () => {
    expect(isHardProviderError('400 "Your credit balance is too low to access the Anthropic API"')).toBe(true)
    expect(isHardProviderError('Could not resolve authentication method. Expected one of apiKey, authToken, credentials, config, or profile to be set.')).toBe(true)
  })

  it('⚠️ A 429 AND A TIMEOUT ARE NOT HARD — the brief requires this exactly', () => {
    // "A 429 or a timeout is different — leave existing retry behaviour for those alone." A rate limit
    // clears by waiting; an empty balance does not. This is the assertion the mutation check demanded.
    expect(isHardProviderError('429 rate_limit_error: Number of requests has exceeded your rate limit')).toBe(false)
    expect(isHardProviderError('Request timed out after 30000ms')).toBe(false)
    expect(isHardProviderError('529 overloaded_error')).toBe(false)
    expect(isHardProviderError('503 Service Unavailable')).toBe(false)
    expect(isHardProviderError('ECONNRESET')).toBe(false)
  })

  it('⚠️ A 429 THAT ALSO MENTIONS BILLING IS STILL NOT HARD — the exclusion runs first, on purpose', () => {
    // Anthropic messages sometimes carry both words. Treating this as hard would stop retrying
    // something that clears by waiting, which is the one regression this phase must not cause.
    expect(isHardProviderError('429 rate_limit_error — upgrade your billing tier to raise this limit')).toBe(false)
  })

  it('an empty or absent message is not hard — never trip the circuit on nothing', () => {
    expect(isHardProviderError('')).toBe(false)
    expect(isHardProviderError(null)).toBe(false)
    expect(isHardProviderError(undefined)).toBe(false)
  })

  it('⚠️ THE THREE CLASSIFIERS STAY DISTINCT — collapsing any pair is the real danger', () => {
    const credit = '400 Your credit balance is too low'
    const overload = '529 overloaded_error'
    // Billing: NOT transient (surface it), IS unreachable (fail over), IS hard (stop dialling).
    expect(isTransientError(credit)).toBe(false)
    expect(isAnthropicUnreachable(credit)).toBe(true)
    expect(isHardProviderError(credit)).toBe(true)
    // Overload: IS transient, IS unreachable, NOT hard.
    expect(isTransientError(overload)).toBe(true)
    expect(isAnthropicUnreachable(overload)).toBe(true)
    expect(isHardProviderError(overload)).toBe(false)
  })
})

describe('M18B phase 1 · isAnthropicCircuitOpen — two windows, chosen by what opened it', () => {
  it('⚠️ A HARD INCIDENT STAYS OPEN LONG PAST THE 120s TRANSIENT WINDOW', () => {
    // 30 minutes old. Under the single old window (OPEN_SEC = 120) this read CLOSED, which is how a
    // dead provider was re-dialled every two minutes for two weeks.
    rows = [{ id: 'hard-1', started_at: ago(1800), trigger_error: 'Your credit balance is too low' }]
    return isAnthropicCircuitOpen().then(r => {
      expect(r.open).toBe(true)
      expect(r.hard).toBe(true)
      expect(r.incidentId).toBe('hard-1')
    })
  })

  it('⚠️ A TRANSIENT INCIDENT OF THE SAME AGE READS CLOSED — behaviour for 5xx is UNCHANGED', async () => {
    // Anti-vacuity for the test above, and the guarantee that this phase did not quietly extend the
    // breaker for everything. Same age, different trigger, opposite answer.
    rows = [{ id: 'soft-1', started_at: ago(1800), trigger_error: '529 overloaded_error' }]
    const r = await isAnthropicCircuitOpen()
    expect(r.open).toBe(false)
  })

  it('a FRESH transient incident still reads open, as it always did', async () => {
    rows = [{ id: 'soft-2', started_at: ago(30), trigger_error: '529 overloaded_error' }]
    const r = await isAnthropicCircuitOpen()
    expect(r.open).toBe(true)
    expect(r.hard).toBe(false)
  })

  it('a hard incident older than the hard TTL finally reads closed, so a top-up can be noticed', async () => {
    rows = [{ id: 'hard-old', started_at: ago(4000), trigger_error: 'Your credit balance is too low' }]
    const r = await isAnthropicCircuitOpen()
    expect(r.open).toBe(false)
  })

  it('⚠️ picks the HARD incident even when a newer transient one has expired — it scans, not just the top row', async () => {
    // Ordered newest-first by the query. The newest is a stale transient; the one that matters is older.
    rows = [
      { id: 'soft-stale', started_at: ago(600), trigger_error: 'timed out' },
      { id: 'hard-live', started_at: ago(1200), trigger_error: 'Could not resolve authentication method' },
    ]
    const r = await isAnthropicCircuitOpen()
    expect(r.open).toBe(true)
    expect(r.incidentId).toBe('hard-live')
  })

  it('a failed read reports and reads CLOSED — availability over strictness, but not silently', async () => {
    readError = 'permission denied for table aria_provider_incidents'
    const spy = vi.spyOn(console, 'error')
    const r = await isAnthropicCircuitOpen()
    expect(r.open).toBe(false)
    expect(spy.mock.calls.flat().join(' ')).toContain('permission denied')
  })
})

describe('M18B phase 1 · recordAnthropicHardDown — opens on the FIRST occurrence', () => {
  it('⚠️ INSERTS AN INCIDENT WITH NO THRESHOLD WAIT, carrying the reason', async () => {
    rows = []
    const r = await recordAnthropicHardDown('400 Your credit balance is too low')
    expect(r.tripped).toBe(true)
    expect(inserted).toHaveLength(1)
    expect(inserted[0]!.provider).toBe('anthropic')
    expect(String(inserted[0]!.trigger_error)).toContain('credit balance')
  })

  it('⚠️ DOES NOT STACK ROWS when a hard incident is already open — one outage, one row, one log line', async () => {
    rows = [{ id: 'hard-1', started_at: ago(60), trigger_error: 'Your credit balance is too low' }]
    const r = await recordAnthropicHardDown('Your credit balance is too low')
    expect(r.tripped).toBe(true)
    expect(r.incidentId).toBe('hard-1')
    expect(inserted).toHaveLength(0)
  })

  it('a hard fault DOES open a new incident when only a transient one is open — they are different states', async () => {
    // Anti-vacuity for the test above: if any open incident suppressed the insert, a hard fault
    // arriving during a 529 blip would be recorded as transient and re-dialled in two minutes.
    rows = [{ id: 'soft-1', started_at: ago(30), trigger_error: '529 overloaded_error' }]
    await recordAnthropicHardDown('Your credit balance is too low')
    expect(inserted).toHaveLength(1)
  })
})
