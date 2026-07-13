-- SECURITY-P1 — schema changes for remaining CRITICAL fixes.

-- ── C-08: staff-portal session overhaul ────────────────────────────────────
-- staff_members.portal_token / portal_token_expires_at were referenced throughout
-- src/app/api/staff-portal/* but NEVER EXISTED in this database (confirmed live via
-- information_schema, no migration anywhere ever created them) -- the OTP login flow has been
-- non-functional in production, not just insecure. Fixed correctly from scratch: portal_otp_hash
-- stores a SHA-256 hash of the OTP (never plaintext, closing M-03 as part of this same fix), and a
-- separate staff_portal_sessions table holds the POST-verification bearer session (a cryptographically
-- random 32-byte token, only its hash stored) -- OTP and session are different credentials with
-- different lifetimes, matching the audit's Group 7 fix pattern.
ALTER TABLE staff_members
  ADD COLUMN IF NOT EXISTS portal_otp_hash text NULL,
  ADD COLUMN IF NOT EXISTS portal_otp_expires_at timestamptz NULL;

CREATE TABLE IF NOT EXISTS staff_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_member_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_portal_sessions_token_hash ON staff_portal_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_staff_portal_sessions_staff_member ON staff_portal_sessions (staff_member_id);

-- ── C-01: receipt view token ────────────────────────────────────────────────
-- public/receipt/[sale_id] had zero auth -- any valid sale UUID returned full sale/payment/business
-- detail. No current code path constructs a link to this route yet (confirmed via repo-wide grep),
-- so this closes the gap before the feature (QR code / SMS receipt link) is ever wired up, with zero
-- risk of breaking an existing flow. DEFAULT backfills every existing sale with a real token so nothing
-- is ever NULL (a NULL token must never be treated as "no gate needed").
ALTER TABLE pos_sales
  ADD COLUMN IF NOT EXISTS receipt_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sales_receipt_token ON pos_sales (receipt_token);
