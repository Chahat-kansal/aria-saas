import { createClient } from '@supabase/supabase-js'

// Service role client — bypasses RLS. Use ONLY for internal server
// writes (aria_ai_calls, aria_signal_cache) where no user session exists.
// NEVER import this in client components or expose to the browser.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
