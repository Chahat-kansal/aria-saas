import { describe, it, expect } from 'vitest'
import { findDrift, describeDrift, DRIFT_TOLERANCE, type BusinessDrift } from '@/lib/loyalty/reconcile'

// ARIA-LOYALTY-FIX-1 §2b — the divergence this exists to catch is real and was measured:
// Sip held 13,785 points on customer rows against 9 in the ledger, from ONE ledger row.
// Nothing compared the two, so nothing noticed.

const d = (businessId: string, balanceTotal: number, ledgerTotal: number): BusinessDrift =>
  ({ businessId, balanceTotal, ledgerTotal, drift: balanceTotal - ledgerTotal })

describe('findDrift', () => {
  it('catches the exact divergence that prompted this — 13,785 vs 9', () => {
    const out = findDrift([d('sip', 13785, 9)])
    expect(out).toHaveLength(1)
    expect(out[0].drift).toBe(13776)
  })

  it('a reconciled business is silent', () => {
    expect(findDrift([d('sip', 9, 9)])).toEqual([])
    expect(findDrift([d('sip', 0, 0)])).toEqual([])
  })

  it('catches drift in BOTH directions', () => {
    // Balances above the ledger = points nobody can explain. Below = earns that never reached the
    // customer, which is the quieter failure and the one a customer complains about.
    expect(findDrift([d('a', 100, 0)])[0].drift).toBe(100)
    expect(findDrift([d('b', 0, 100)])[0].drift).toBe(-100)
  })

  it('reports worst first, so a big divergence is not buried', () => {
    const out = findDrift([d('small', 10, 0), d('huge', 13785, 9), d('mid', 500, 0)])
    expect(out.map((r) => r.businessId)).toEqual(['huge', 'mid', 'small'])
  })

  it('tolerance is ZERO by default — this is a bookkeeping identity, not a statistic', () => {
    expect(DRIFT_TOLERANCE).toBe(0)
    expect(findDrift([d('a', 1, 0)])).toHaveLength(1)   // a single unexplained point still reports
  })

  it('an explicit tolerance suppresses only what it is asked to', () => {
    expect(findDrift([d('a', 5, 0)], 10)).toEqual([])
    expect(findDrift([d('a', 11, 0)], 10)).toHaveLength(1)
  })
})

describe('describeDrift', () => {
  it('names the direction, because the two mean opposite things', () => {
    expect(describeDrift(d('sip', 13785, 9))).toContain('unbacked by the ledger')
    expect(describeDrift(d('sip', 0, 100))).toContain('missing from balances')
  })

  it('carries both totals, so the line is actionable without a second query', () => {
    const s = describeDrift(d('sip', 13785, 9))
    expect(s).toContain('13785')
    expect(s).toContain('9')
    expect(s).toContain('+13776')
  })
})
