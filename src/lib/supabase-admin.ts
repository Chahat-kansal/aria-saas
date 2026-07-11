import { makeLazyServiceRoleClient } from '@/lib/supabase-lazy'

// Service role client — bypasses RLS. Use ONLY for internal server
// writes (aria_ai_calls, aria_signal_cache) where no user session exists.
// NEVER import this in client components or expose to the browser.
// Lazy (see supabase-lazy.ts) — a module-scope createClient() call here
// crashed the build for /api/aria/task-outputs/[id]/share with "supabaseUrl
// is required" during "Collecting page data" (ONBOARD-WIZARD-1 CI fix).
export const supabaseAdmin = makeLazyServiceRoleClient()
