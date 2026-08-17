import { describe, it, expect } from 'vitest'
import { findDrift, describeDrift, DRIFT_TOLERANCE, type BusinessDrift, findIdentitySplits, describeSplit, computeIdentitySplits } from '@/lib/loyalty/reconcile'

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

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ARIA-LOYALTY-CLOSEOUT-1 §2 — the identity-split detector.
//
// Against real data this returns [] no matter how it is written, because
// pos_customers_identity_uniq enforces the invariant in the database. That makes these tests the
// ONLY thing separating a working detector from `return []` — the healthy case cannot tell them
// apart, and the unhealthy case only occurs if the index has already been dropped or bypassed.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

type C = { id: string; business_id: string; loyalty_identity_id: string | null; deleted_at?: string | null }
const c = (id: string, business_id: string, loyalty_identity_id: string | null, deleted_at: string | null = null): C =>
  ({ id, business_id, loyalty_identity_id, deleted_at })

describe('findIdentitySplits', () => {
  it('reports nothing for healthy data — one live row per identity per business', () => {
    expect(findIdentitySplits([
      c('c1', 'biz', 'i1'), c('c2', 'biz', 'i2'), c('c3', 'other', 'i1'),
    ])).toEqual([])
  })

  it('catches the split this sprint exists to make impossible', () => {
    // The 8 July shape: one identity, several live customer rows, one business.
    const out = findIdentitySplits([c('a', 'biz', 'i1'), c('b', 'biz', 'i1'), c('z', 'biz', 'i2')])
    expect(out).toHaveLength(1)
    expect(out[0].identityId).toBe('i1')
    expect(out[0].businessId).toBe('biz')
    // Every offending row is named — a count alone is not actionable, and the fix is a merge that
    // needs to know WHICH rows.
    expect(out[0].customerIds.sort()).toEqual(['a', 'b'])
  })

  it('ignores exactly what the unique index ignores', () => {
    // If either filter drifts from the index predicate, this detector reports splits the database
    // permits (noise) or misses ones it no longer blocks (silence).
    expect(findIdentitySplits([
      c('live', 'biz', 'i1'),
      c('merged-away', 'biz', 'i1', '2026-07-08'),   // soft-deleted — the 8 July merge losers
    ])).toEqual([])
    expect(findIdentitySplits([
      c('n1', 'biz', null), c('n2', 'biz', null),     // NULLs are distinct in a unique index
    ])).toEqual([])
  })

  it('does not merge across businesses — the index is scoped per business', () => {
    // loyalty_identity is global by design (LOY-NETWORK). The same person at two venues is two
    // customer rows and is CORRECT; treating it as a split would alarm on normal operation.
    expect(findIdentitySplits([c('x', 'biz-1', 'i1'), c('y', 'biz-2', 'i1')])).toEqual([])
  })

  it('orders worst-first with a stable tiebreak', () => {
    const out = findIdentitySplits([
      c('a', 'b', 'zzz'), c('b', 'b', 'zzz'),
      c('d', 'b', 'aaa'), c('e', 'b', 'aaa'), c('f', 'b', 'aaa'),
      c('g', 'b', 'mmm'), c('h', 'b', 'mmm'),
    ])
    expect(out.map((s) => s.identityId)).toEqual(['aaa', 'mmm', 'zzz'])
  })
})

describe('describeSplit', () => {
  it('names the identity, the business and every row, so the line stands alone', () => {
    const s = describeSplit({ businessId: 'sip', identityId: 'i1', customerIds: ['a', 'b'] })
    expect(s).toContain('sip')
    expect(s).toContain('i1')
    expect(s).toContain('a')
    expect(s).toContain('b')
    expect(s).toContain('pos_customers_identity_uniq')
  })
})

describe('computeIdentitySplits', () => {
  /** Stand-in for the one filtered read this makes. */
  const dbReturning = (res: { data: C[] | null; error: { message?: string } | null }) => ({
    from: () => ({ select: () => ({ not: () => ({ is: async () => res }) }) }),
  })

  it('reports checked:true and the splits it found', async () => {
    const r = await computeIdentitySplits(dbReturning({ data: [c('a', 'b', 'i1'), c('b2', 'b', 'i1')], error: null }))
    expect(r.checked).toBe(true)
    expect(r.splits).toHaveLength(1)
  })

  it('a read failure is checked:false — NOT a clean bill of health', async () => {
    // The whole sprint is about this distinction. An empty list from a broken query reads as "no
    // splits", which is how link-identity reported links it never wrote.
    const r = await computeIdentitySplits(dbReturning({ data: null, error: { message: 'permission denied' } }))
    expect(r.checked).toBe(false)
    expect(r.splits).toEqual([])
    expect(r.error).toContain('permission denied')
  })

  it('a thrown error is contained and reported, never propagated', async () => {
    // It rides a cron that also expires points; a reporting failure must not take that down.
    const r = await computeIdentitySplits({ from: () => { throw new Error('db down') } })
    expect(r.checked).toBe(false)
    expect(r.error).toContain('db down')
  })
})
