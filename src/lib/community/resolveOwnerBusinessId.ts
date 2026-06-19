import { createServerSupabaseClient } from '@/lib/supabase-server'

// ARCH-F1-RESOLVE-BID — the single deterministic owner-business resolver. Replaces 16 divergent
// inline getBid() copies (10 had a non-deterministic no-ORDER-BY fallback; 6 ordered by created_at).
//
// Resolution sequence:
//   1) The owner's explicitly-chosen active business (user_active_business) — but only if it still
//      EXISTS, is OWNED by this user, and is ACTIVE. None of the old copies re-validated this; we now
//      do, so a stale/foreign active row can never leak another business (RULE 7). On current data this
//      is a no-op (all user_active_business rows are valid).
//   2) Fallback: the owner's OLDEST active business (created_at ASC). This is the standardization — the
//      10 no-ORDER-BY copies previously returned an arbitrary business; they now deterministically
//      return the oldest, so every route resolves the same business in a session.
//
// Returns null when the owner has no active business — callers keep their existing null-handling.
export async function resolveOwnerBusinessId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (active?.business_id) {
    const { data: valid } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', active.business_id as string)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    if (valid?.id) return valid.id as string
  }

  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
