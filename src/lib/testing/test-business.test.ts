import { describe, it, expect } from 'vitest'
import {
  isSafeTestBusiness, assertSafeTestBusiness,
  SEEDED_TEST_BUSINESS_ID, SMOKE_TEST_BUSINESS_ID, LIVE_SIP_BUSINESS_ID,
} from './test-business'

/**
 * S6 PHASE 1 — the guard that stops a live check touching real rows.
 *
 * ⚠️ Every assertion CALLS the function. The point of this file is that the obvious guard
 * (`id !== SIP`) passes for an empty string and for every other real business — which is this
 * sprint's own failure mode, reproduced in the safety rail.
 */
describe('S6 phase 1 · only a seeded fixture may be touched', () => {
  it('the two real fixtures are allowed', () => {
    expect(isSafeTestBusiness(SEEDED_TEST_BUSINESS_ID)).toBe(true)
    expect(isSafeTestBusiness(SMOKE_TEST_BUSINESS_ID)).toBe(true)
  })

  it('⚠️ live Sip is refused, by id', () => {
    expect(isSafeTestBusiness(LIVE_SIP_BUSINESS_ID)).toBe(false)
    expect(() => assertSafeTestBusiness(LIVE_SIP_BUSINESS_ID, 'write')).toThrow(/LIVE Sip Café/)
  })

  it('⚠️ MUTATION — the "not Sip" guard passes for everything that is not Sip', () => {
    // The guard a reasonable person writes first, and why it is worthless.
    const naive = (id: string | null | undefined) => id !== LIVE_SIP_BUSINESS_ID
    for (const bad of ['', undefined, null, 'nonexistent-business-id-000', 'fd33fcbd-a533-47a7-b557-b1e652a279e0']) {
      expect(naive(bad as string), 'naive allows ' + JSON.stringify(bad)).toBe(true)
      expect(isSafeTestBusiness(bad), 'real guard refuses ' + JSON.stringify(bad)).toBe(false)
    }
  })

  it('an unseeded real business is refused even though it is not Sip', () => {
    // A random production uuid. Not Sip, and still not ours to write to.
    expect(isSafeTestBusiness('9f1c2b8e-4d3a-4f21-9c77-2b6e5a1d0c34')).toBe(false)
  })

  it('the id must be the right SHAPE, not merely a fixture-looking prefix', () => {
    expect(isSafeTestBusiness('00000000-0000-4000-a000-000000000102')).toBe(true)   // in the block
    expect(isSafeTestBusiness('00000000-0000-4000-a000-00000000000e')).toBe(true)   // the seed's own range
    expect(isSafeTestBusiness('10000000-0000-4000-a000-000000000101')).toBe(false)  // outside the prefix
    expect(isSafeTestBusiness('00000000-0000-4000-b000-000000000101')).toBe(false)  // wrong variant group
    expect(isSafeTestBusiness('00000000-0000-4000-a000-00000000010')).toBe(false)   // truncated
    expect(isSafeTestBusiness('00000000-0000-4000-a000-000000000101x')).toBe(false) // trailing junk
  })

  it('assertSafeTestBusiness returns the id when it is safe, so it can be used inline', () => {
    expect(assertSafeTestBusiness(SEEDED_TEST_BUSINESS_ID, 'read')).toBe(SEEDED_TEST_BUSINESS_ID)
    expect(() => assertSafeTestBusiness('', 'read')).toThrow(/refusing to read/)
    expect(() => assertSafeTestBusiness(undefined, 'seed')).toThrow(/refusing to seed/)
  })

  it('ANTI-VACUITY — the guard returns both answers, and the constants are distinct', () => {
    expect(isSafeTestBusiness(SEEDED_TEST_BUSINESS_ID)).toBe(true)
    expect(isSafeTestBusiness(LIVE_SIP_BUSINESS_ID)).toBe(false)
    expect(new Set([SEEDED_TEST_BUSINESS_ID, SMOKE_TEST_BUSINESS_ID, LIVE_SIP_BUSINESS_ID]).size).toBe(3)
  })
})
