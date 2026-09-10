/**
 * S6 PHASE 1 — WHICH BUSINESS A LIVE CHECK IS ALLOWED TO TOUCH.
 *
 * `check:live` signs in, asks a real question and triggers a real proposal. Every one of those
 * touches rows. The decision table's rule is absolute:
 *
 *   "Use the seeded test business only … Never touch Sip's live rows."
 *   "A check must never be able to pass by reading Sip."
 *
 * ⚠️ THE OBVIOUS GUARD — `id !== SIP` — IS THE WRONG ONE, and it is worth saying why. It passes for
 * an empty string, for `undefined`, for a typo, and for any other real business in the database. A
 * check that resolved its business id to `''` and then asserted "not Sip" would sail through while
 * testing nothing at all. That is this sprint's entire failure mode, reproduced in the safety rail.
 *
 * So this demands the id BE a seeded fixture — an allow-list by shape — rather than merely not
 * being the one business we remembered to name.
 *
 * Lives in `src/` rather than `e2e/helpers/` for one reason: vitest only collects `src/**`, and a
 * guard nothing can test is the other half of the same failure.
 */

/** The business `e2e/helpers/seed.ts` provisions. */
export const SEEDED_TEST_BUSINESS_ID = '00000000-0000-4000-a000-000000000001'

/** The smoke suite's fixture, created 25 Jul by SECURITY-P4. Also safe — also not Sip. */
export const SMOKE_TEST_BUSINESS_ID = '00000000-0000-4000-a000-000000000101'

/** The real café. Never a test target. */
export const LIVE_SIP_BUSINESS_ID = 'ff5055a0-c351-4ada-817a-1804961035f3'

/**
 * The reserved prefix every fixture id is allocated from: `00000000-0000-4000-a000-`.
 *
 * ⚠️ My first version of this pattern matched only the `…0001xx` sub-block and therefore REJECTED
 * the seeded business itself (`…000001`), which the seed allocates from `…0000xx`. Caught by the
 * test on its first run. The prefix is the real allocation marker: a `gen_random_uuid()` v4 cannot
 * produce all-zero first groups plus `a000`, so nothing real can collide with it.
 */
const FIXTURE_ID = /^00000000-0000-4000-a000-[0-9a-f]{12}$/

export function isSafeTestBusiness(id: string | null | undefined): boolean {
  if (typeof id !== 'string' || id.length === 0) return false
  if (id === LIVE_SIP_BUSINESS_ID) return false
  return FIXTURE_ID.test(id)
}

/**
 * Throws unless `id` is a fixture. Called before any write a live check performs, so a
 * misconfigured run stops rather than writing to whatever it happened to resolve.
 */
export function assertSafeTestBusiness(id: string | null | undefined, what: string): string {
  if (!isSafeTestBusiness(id)) {
    throw new Error(
      '[check:live] refusing to ' + what + ' against business id ' + JSON.stringify(id)
      + ' — only the seeded fixtures (00000000-0000-4000-a000-0000000001xx) may be touched. '
      + (id === LIVE_SIP_BUSINESS_ID ? 'That id is the LIVE Sip Café.' : 'Set TEST_BUSINESS_ID or run the seed.'),
    )
  }
  return id as string
}
