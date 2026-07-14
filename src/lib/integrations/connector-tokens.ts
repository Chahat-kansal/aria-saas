import { supabaseAdmin } from '@/lib/supabase-admin'
import { encryptFieldSafe, decryptFieldSafe } from '@/lib/encryption'

// CONNECTOR-VAULT-1a — the generic version of the read/write pair src/lib/integrations/square.ts
// already proved out (getSquareTokens/writeSquareTokens): every connector's tokens live encrypted in
// pos_oauth_integrations, one row per (business_id, integration_key), so new connectors don't each
// re-implement table + crypto. Square's own helpers are left exactly as they are (extend-never-
// remove) — this is additive infrastructure new/migrated connectors call directly.

export interface ConnectorTokens {
  integration_id: string
  access_token: string | null
  refresh_token: string | null
  external_account_id: string | null
  external_account_name: string | null
  config: Record<string, unknown> | null
  token_expires_at: string | null
  status: string | null
}

/** Read + decrypt a connector's tokens for a business. Null if not connected. */
export async function getConnectorTokens(businessId: string, integrationKey: string): Promise<ConnectorTokens | null> {
  const { data } = await supabaseAdmin
    .from('pos_oauth_integrations')
    .select('id, access_token_encrypted, refresh_token_encrypted, external_account_id, external_account_name, config, token_expires_at, status')
    .eq('business_id', businessId)
    .eq('integration_key', integrationKey)
    .maybeSingle()
  if (!data) return null
  return {
    integration_id: data.id as string,
    access_token: decryptFieldSafe(data.access_token_encrypted as string | null, businessId),
    refresh_token: decryptFieldSafe(data.refresh_token_encrypted as string | null, businessId),
    external_account_id: (data.external_account_id as string | null) ?? null,
    external_account_name: (data.external_account_name as string | null) ?? null,
    config: (data.config as Record<string, unknown> | null) ?? null,
    token_expires_at: (data.token_expires_at as string | null) ?? null,
    status: (data.status as string | null) ?? null,
  }
}

/** Encrypt + persist a connector's tokens onto an existing pending row (used by the OAuth callback,
 * after redeemOAuthState has already resolved integrationId). */
export async function writeConnectorTokens(
  businessId: string,
  integrationId: string,
  t: {
    access_token: string
    refresh_token?: string | null
    token_expires_at?: string | null
    external_account_id?: string | null
    external_account_name?: string | null
    config?: Record<string, unknown> | null
    scopes?: string[] | null
  },
): Promise<void> {
  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'connected',
    access_token_encrypted: encryptFieldSafe(t.access_token, businessId),
    refresh_token_encrypted: encryptFieldSafe(t.refresh_token ?? null, businessId),
    token_expires_at: t.token_expires_at ?? null,
    external_account_id: t.external_account_id ?? null,
    ...(t.external_account_name ? { external_account_name: t.external_account_name } : {}),
    ...(t.config ? { config: t.config } : {}),
    ...(t.scopes ? { scopes: t.scopes } : {}),
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', integrationId)
}

/** Update a connector's sync status without touching its tokens. */
export async function setConnectorStatus(businessId: string, integrationKey: string, status: string, error?: string | null): Promise<void> {
  await supabaseAdmin.from('pos_oauth_integrations').update({
    status,
    last_sync_at: new Date().toISOString(),
    ...(error !== undefined ? { last_error: error } : {}),
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', integrationKey)
}

/** Clear a connector's tokens (disconnect). Leaves the row (and its sync history) in place. */
export async function clearConnectorTokens(businessId: string, integrationKey: string): Promise<void> {
  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'disconnected',
    access_token_encrypted: null,
    refresh_token_encrypted: null,
    token_expires_at: null,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', integrationKey)
}
