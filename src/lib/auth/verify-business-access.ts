import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Authorization gate for /api/pos/* routes that accept a client-supplied
 * business_id. Confirms the authenticated user is a member of that business via
 * the live membership tables:
 *   - user_active_business (user_id ↔ business_id)
 *   - pos_users           (user_id | auth_user_id ↔ business_id)
 *
 * Mirrors the verifyCronAuth approach (SEC-1): returns a Response to short-circuit
 * the handler, or null when access is granted. Returning (rather than throwing)
 * guarantees the correct status code whether or not the route is wrapped in
 * withErrorCapture — a thrown Response would become a 500 on unwrapped routes.
 *
 * Fails closed: missing user → 401, missing business_id → 400, no membership
 * row OR a query error → 403 (never assume the membership query succeeded — RULE 11).
 *
 * Usage:
 *   const denied = await verifyBusinessAccess(user.id, businessId)
 *   if (denied) return denied
 */
export async function verifyBusinessAccess(
  userId: string | null | undefined,
  businessId: string | null | undefined,
): Promise<NextResponse | null> {
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!businessId) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  // Primary membership: user_active_business
  const { data: uab, error: uabErr } = await supabaseAdmin
    .from('user_active_business')
    .select('business_id')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle()
  if (uabErr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (uab) return null

  // Secondary membership: pos_users (auth linkage is user_id or auth_user_id)
  const { data: pu, error: puErr } = await supabaseAdmin
    .from('pos_users')
    .select('id')
    .eq('business_id', businessId)
    .or(`user_id.eq.${userId},auth_user_id.eq.${userId}`)
    .limit(1)
    .maybeSingle()
  if (puErr) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (pu) return null

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
