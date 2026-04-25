import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Returns the active business_id for a user, verifying they own it.
 * Reads from user_active_business table — never trusts a client-supplied value.
 */
export async function getActiveBusinessId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .single();

  if (!data?.business_id) return null;

  // Verify the business actually belongs to this user
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', data.business_id)
    .eq('user_id', userId)
    .single();

  return biz?.id ?? null;
}

/**
 * Verifies that a given business_id belongs to the authenticated user.
 * Use this in any API route that accepts business_id from the client.
 */
export async function verifyBusinessOwnership(
  supabase: SupabaseClient,
  userId: string,
  businessId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('businesses')
    .select('id')
    .eq('id', businessId)
    .eq('user_id', userId)
    .single();

  return !!data;
}