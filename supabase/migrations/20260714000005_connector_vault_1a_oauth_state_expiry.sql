-- CONNECTOR-VAULT-1a — the existing auth_state_token CSRF pattern (already correct for Square/
-- Shopify: a random token persisted server-side, looked up not decoded, on the OAuth callback) had
-- no expiry: a stale, never-completed OAuth attempt's state token stayed valid forever until the
-- next connect attempt overwrote it. Adds a nullable expiry column, consumed the same way the
-- token itself already is (nulled on redemption via src/lib/integrations/oauth-state.ts).
ALTER TABLE pos_oauth_integrations ADD COLUMN IF NOT EXISTS auth_state_expires_at timestamptz;
