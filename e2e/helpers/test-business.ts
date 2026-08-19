import { dbAdmin, hasDbAccess } from './supabase'

/** Business ID to run tests against. Prefer TEST_BUSINESS_ID env var (points to a
 *  dedicated test business), falling back to any business owned by the test user. */
export const TEST_BUSINESS_ID = process.env.TEST_BUSINESS_ID ?? ''

/**
 * Resolve the business ID for the test suite.
 *
 * MS8 PHASE 5 — EXPLICIT FIRST. `TEST_BUSINESS_ID` now wins outright.
 *
 * This used to resolve "the newest business owned by the test user", and that heuristic is the
 * whole reason CI has never been green. SECURITY-P4 created a fixture for the SMOKE suite on
 * 25 Jul; because it was newer than the e2e fixture, it silently repointed the entire e2e suite at
 * a business `seed.ts` does not seed. Nothing announced it, nothing failed loudly, and the specs
 * simply began asserting against the wrong data.
 *
 * A resolver whose answer changes when an unrelated sprint inserts a row is not a resolver. The
 * env var is now the mechanism; the heuristic survives only as a last resort for a local run with
 * no env var set, and it warns when it fires so it can never silently decide again.
 */
export async function resolveTestBusinessId(userId: string): Promise<string | null> {
  // 1. Explicit wins, always — and without a DB round-trip.
  if (TEST_BUSINESS_ID) return TEST_BUSINESS_ID
  if (!hasDbAccess || !dbAdmin) return null

  // 2. Last resort: newest owned business. Local runs only; CI sets the env var.
  console.warn(
    '[test-business] TEST_BUSINESS_ID is not set — falling back to the newest business owned by ' +
    'the test user. This heuristic silently repointed the whole e2e suite once already ' +
    '(see docs/aria/CI-TRIAGE-2.md §3). Set TEST_BUSINESS_ID.',
  )
  // businesses.user_id, not owner_id — CLAUDE.md RULE 6 column trap.
  const { data } = await dbAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

/** Look up the authenticated user's ID by email via DB. */
export async function getUserIdByEmail(email: string): Promise<string | null> {
  if (!hasDbAccess || !dbAdmin) return null
  const { data } = await dbAdmin.auth.admin.listUsers()
  const match = data?.users?.find(u => u.email === email)
  return match?.id ?? null
}

// ONBOARD-WIZARD-1 — "Aria Test Liquor" is the permanent retail/liquor test
// fixture (Sip Café's product-business twin — Sip covers cafe/service-flavored
// paths, this covers product/POS + the liquor feature set: loyalty, reviews,
// compliance, reorder). Created once via a real fresh onboard through the
// rebuilt wizard, verified against live DB rows, and deliberately never
// deleted — see the ONBOARD-WIZARD-1 sprint notes. Resolve it by NAME, never
// by re-running onboarding when it already exists, so e2e runs are always
// idempotent and can never create a second "Aria Test Liquor" business.
export const LIQUOR_FIXTURE_NAME = 'Aria Test Liquor'
export const LIQUOR_FIXTURE_EMAIL = process.env.LIQUOR_FIXTURE_EMAIL ?? 'aria-test-liquor@example.com'
export const LIQUOR_FIXTURE_PASSWORD = process.env.LIQUOR_FIXTURE_PASSWORD ?? 'AriaTestLiquorFixture2026!'

/** Resolve the permanent liquor fixture's business ID, or null if it doesn't
 *  exist yet in this environment (e.g. a fresh Supabase project). */
export async function findLiquorFixtureId(): Promise<string | null> {
  if (!hasDbAccess || !dbAdmin) return null
  const { data } = await dbAdmin.from('businesses').select('id').eq('name', LIQUOR_FIXTURE_NAME).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}