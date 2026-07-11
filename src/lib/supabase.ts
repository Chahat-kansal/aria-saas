import { createBrowserClient } from '@supabase/ssr';
import { makeLazyServiceRoleClient } from '@/lib/supabase-lazy';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Browser client — uses @supabase/ssr so the session is written to cookies,
// making it readable by server components and route handlers.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null as any;

// Server-side admin client — uses service role, bypasses RLS. Lazy (see
// supabase-lazy.ts) — this used to construct eagerly at module scope,
// null-guarded so it wouldn't crash the build, but that meant any caller
// silently got `null` instead of a working client whenever this module
// happened to load before env vars were readable, instead of just working
// once they were (which is virtually always true by request time).
export const supabaseAdmin = makeLazyServiceRoleClient();
