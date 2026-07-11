import { dbAdmin, hasDbAccess } from './supabase'

/** Business ID to run tests against. Prefer TEST_BUSINESS_ID env var (points to a
 *  dedicated test business), falling back to any business owned by the test user. */
export const TEST_BUSINESS_ID = process.env.TEST_BUSINESS_ID ?? ''

/** Resolve the business ID for the test user via the DB (requires service-role key). */
export async function resolveTestBusinessId(userId: string): Promise<string | null> {
  if (!hasDbAccess || !dbAdmin) return TEST_BUSINESS_ID || null
  // businesses.user_id, not owner_id — CLAUDE.md RULE 6 column trap.
  const { data } = await dbAdmin
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ?? (TEST_BUSINESS_ID || null)
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