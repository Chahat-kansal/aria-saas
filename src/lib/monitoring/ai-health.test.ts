import { describe, it, expect } from 'vitest'
import { shouldAlert, MIN_CALLS_FOR_RATE, FAILURE_RATE_THRESHOLD, type ProviderHealthRow } from '@/lib/monitoring/ai-health'

// AI-HEALTH-1 §4 — the threshold, pinned.
//
// The case that matters most is the third one: a SINGLE credit-balance error in an otherwise
// healthy provider must alert at high severity. That clause is the whole sprint — the real outage
// produced 1,605 credit errors, and a rate-only rule would still have taken days to trip while
// every agent was already degraded.

const row = (o: Partial<ProviderHealthRow> = {}): ProviderHealthRow => ({
  provider: 'anthropic', total_calls: 100, failures: 0, top_error: null, agents_affected: 0, ...o,
})

describe('shouldAlert — failure rate', () => {
  it('below threshold: no alert', () => {
    expect(shouldAlert([row({ failures: 10 })])).toHaveLength(0)   // 10% < 20%
  })

  it('above threshold: alert, medium severity', () => {
    const out = shouldAlert([row({ failures: 48 })])              // 48% > 20%
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('medium')
    expect(out[0].reason).toBe('failure_rate')
    expect(out[0].failureRate).toBeCloseTo(0.48)
  })

  it('exactly at threshold does not alert — strictly greater', () => {
    expect(shouldAlert([row({ total_calls: 100, failures: 20 })])).toHaveLength(0)
  })

  it('ignores low volume: a high rate on too few calls is noise', () => {
    // 3 of 4 is 75%, but four calls prove nothing.
    expect(shouldAlert([row({ total_calls: 4, failures: 3 })])).toHaveLength(0)
    expect(MIN_CALLS_FOR_RATE).toBe(20)
    expect(FAILURE_RATE_THRESHOLD).toBe(0.2)
  })
})

describe('shouldAlert — auth/credit escalates on ONE occurrence', () => {
  it('a single credit-balance error in an otherwise healthy provider alerts HIGH', () => {
    // 1 failure in 1,000 calls = 0.1%, nowhere near the rate threshold. It must still alert:
    // one credit error means the account is down and every agent is degraded.
    const out = shouldAlert([row({
      total_calls: 1000, failures: 1,
      top_error: 'Your credit balance is too low to access the Anthropic API',
      agents_affected: 14,
    })])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
    expect(out[0].reason).toBe('auth_or_credit')
    expect(out[0].agentsAffected).toBe(14)
  })

  it.each([
    ['Your credit balance is too low', 'credit balance'],
    ['insufficient funds for this request', 'insufficient'],
    ['You exceeded your current quota', 'quota'],
    ['401 Unauthorized', '401'],
    ['403 Forbidden', '403'],
  ])('matches %s', (err) => {
    const out = shouldAlert([row({ total_calls: 500, failures: 1, top_error: err })])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
  })

  it('an ordinary error does NOT escalate — only rate applies', () => {
    const out = shouldAlert([row({ total_calls: 500, failures: 1, top_error: 'overloaded_error: retry later' })])
    expect(out).toHaveLength(0)
  })
})

describe('shouldAlert — edges', () => {
  it('zero calls: no alert, no divide-by-zero', () => {
    const out = shouldAlert([row({ total_calls: 0, failures: 0 })])
    expect(out).toHaveLength(0)
    expect(out.every(a => Number.isFinite(a.failureRate))).toBe(true)
  })

  it('a healthy provider alongside a broken one alerts only for the broken one', () => {
    const out = shouldAlert([
      row({ provider: 'google', total_calls: 888, failures: 136 }),               // 15%, healthy-ish
      row({ provider: 'anthropic', total_calls: 3594, failures: 1718,
            top_error: 'Your credit balance is too low', agents_affected: 14 }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].provider).toBe('anthropic')
  })

  it('reproduces the real outage: 48% and a credit error -> high, not medium', () => {
    // The live 30-day numbers. Both clauses match; auth/credit must win, because "top up the
    // account" is a different instruction from "investigate elevated failures".
    const out = shouldAlert([row({
      total_calls: 3594, failures: 1718,
      top_error: 'Your credit balance is too low', agents_affected: 14,
    })])
    expect(out).toHaveLength(1)
    expect(out[0].severity).toBe('high')
    expect(out[0].reason).toBe('auth_or_credit')
  })
})
