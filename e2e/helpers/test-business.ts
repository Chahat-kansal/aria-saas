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