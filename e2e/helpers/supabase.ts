import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/** Service-role Supabase client for DB assertions in tests. Requires
 *  SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars. */
export const dbAdmin = SUPABASE_URL && SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null

export const hasDbAccess = !!(SUPABASE_URL && SERVICE_ROLE_KEY)

/** Wait up to `ms` ms for `fn` to return a truthy value, polling every 500ms. */
export async function waitFor<T>(
  fn: () => Promise<T | null | undefined>,
  ms = 8_000,
): Promise<T | null> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const result = await fn()
    if (result) return result
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}