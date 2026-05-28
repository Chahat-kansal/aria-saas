import type { SupabaseClient } from '@supabase/supabase-js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Resolve a public URL param (UUID or hub slug) to the real business UUID.
// Reusable across every public-by-id route so slug links never 404.
export async function resolveBusinessId(db: SupabaseClient, idOrSlug: string): Promise<string | null> {
  if (!idOrSlug) return null
  if (UUID_RE.test(idOrSlug)) return idOrSlug
  const { data } = await db.from('businesses').select('id').eq('slug', idOrSlug).maybeSingle()
  return (data?.id as string) ?? null
}
