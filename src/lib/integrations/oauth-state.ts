import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { verifyBusinessAccess } from '@/lib/auth/verify-business-access'

// CONNECTOR-VAULT-1a — the one signed-state implementation every connector's OAuth initiate/
// callback pair should use. Square and the generic pos/integrations?action=start route already had
// the right shape (a random token persisted server-side on a pending pos_oauth_integrations row,
// looked up — not decoded — on the way back) but neither enforced an expiry, and only Square added
// the session/business ownership check as an afterthought. This formalizes both as the default, not
// an opt-in: a stale, never-completed OAuth attempt's state token stops being valid after 10
// minutes, and every redemption re-confirms the current session actually owns the business the
// state was issued for — not just that the opaque string matches.

const STATE_TTL_MS = 10 * 60 * 1000

/** Issue a fresh, single-use state token for one business+connector pair and persist it. */
export async function issueOAuthState(businessId: string, integrationKey: string): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex')
  await supabaseAdmin.from('pos_oauth_integrations').upsert({
    business_id: businessId,
    integration_key: integrationKey,
    status: 'pending',
    auth_state_token: state,
    auth_state_expires_at: new Date(Date.now() + STATE_TTL_MS).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'business_id,integration_key' })
  return state
}

export interface RedeemedOAuthState {
  businessId: string
  integrationId: string
}

/**
 * Redeem a state token from an OAuth callback. Verifies: the token exists (never trust a decoded
 * value), it hasn't expired, and the current session's user actually has access to the business it
 * was issued for. Consumes the token immediately on a successful match — a token is never valid
 * twice, whether the caller succeeds or fails afterward. Returns null on ANY failure; callers should
 * treat every null the same way (redirect to a generic error), not branch on why it failed.
 */
export async function redeemOAuthState(
  state: string | null | undefined,
  integrationKey: string,
  userId: string | null | undefined,
): Promise<RedeemedOAuthState | null> {
  if (!state) return null
  const { data: row } = await supabaseAdmin
    .from('pos_oauth_integrations')
    .select('id, business_id, auth_state_expires_at')
    .eq('auth_state_token', state)
    .eq('integration_key', integrationKey)
    .maybeSingle()
  if (!row?.business_id) return null
  if (!row.auth_state_expires_at || new Date(row.auth_state_expires_at as string).getTime() < Date.now()) return null

  const denied = await verifyBusinessAccess(userId, row.business_id as string)
  if (denied) return null

  await supabaseAdmin.from('pos_oauth_integrations').update({
    auth_state_token: null,
    auth_state_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id)

  return { businessId: row.business_id as string, integrationId: row.id as string }
}
