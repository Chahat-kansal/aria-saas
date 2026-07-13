import type { createServerSupabaseClient } from '@/lib/supabase-server'

// SECURITY-P2 M-14 — canonical replacement for the getBid()/getBiz() helper independently
// copy-pasted into 362 route files (verified count, audit's original ~250 estimate was low).
// Same resolution order every copy used: user_active_business.business_id first, then the
// oldest active businesses row owned by the user. A future discrepancy in one of those 362
// copies silently opens an auth bypass — this is the single audit point going forward.
// P2 migrates only the routes this sprint's fixes touched; the rest are a tracked P3
// mechanical-migration list (SECURITY-P2-REPORT.md) — this file is additive, no existing
// local getBid() was deleted by this sprint unless that specific route was already being edited.
export async function getBid(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
): Promise<string | null> {
  const { data: active } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (active?.business_id) return active.business_id as string
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
