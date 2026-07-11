import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Constructing a Supabase client at MODULE SCOPE (i.e. outside any function,
// executed the instant the file is imported) crashes Next's build-time
// "Collecting page data" phase with "supabaseUrl is required" whenever env
// vars aren't available in that specific execution context — this bug class
// has bitten twice now (industry-features.ts leaking supabaseAdmin into a
// client bundle; supabase-admin.ts's own module-scope createClient() call
// breaking the build for /api/aria/task-outputs/[id]/share). This factory
// wraps the client in a Proxy so every call site (`.from(...)`, `.auth`,
// `.storage`, etc.) works exactly like a real SupabaseClient, but the actual
// createClient(...) call — and its env-var read — only fires on first real
// property access, at REQUEST time, never at import/build time.
export function makeLazyServiceRoleClient(): SupabaseClient {
  let client: SupabaseClient | null = null
  function resolve(): SupabaseClient {
    if (!client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!url || !key) {
        throw new Error('Supabase service-role client: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
      }
      client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    }
    return client
  }
  return new Proxy({} as SupabaseClient, {
    get(_target, prop, _receiver) {
      const real = resolve()
      const value = Reflect.get(real, prop, real)
      return typeof value === 'function' ? value.bind(real) : value
    },
  })
}
