# Prompt 90 — Kiosk access control: rotating QR tokens + counter-tablet mode

## Why
Right now `/in-store/{slug}` is wide open — anyone with the URL can chat with
Aria from anywhere. At ~$0.09 per Sonnet call, a single shared URL screenshot
in a Facebook group could burn a business's entire monthly AI budget by lunch.
This locks the kiosk down without making the real-customer experience worse.

## Two modes, two URLs

### Mode A — Customer phone (rotating QR, 3-hour session)
- URL: `/in-store/{slug}?t={token}` — the customer scans the printed QR
- Token is rotated by a cron daily at 4am AEST. Previous 7 days of tokens stay valid (so prints don't need to be reissued constantly).
- On first load, the route validates `t` against the active tokens table; if valid, sets a session cookie `ariakiosk_{business_id}` good for 3 hours; from then on, requests authorise via the cookie not the token.
- Cookie scope: HttpOnly, Secure, SameSite=Lax, Path=/in-store, Max-Age=10800 (3h).
- After cookie expires: page redirects to a friendly "Please scan the QR in-store to chat with Aria again" landing.

### Mode B — Counter tablet (always-on, owner-issued key)
- URL: `/kiosk-tablet/{slug}?key={kiosk_api_key}`
- Key is generated once when the owner sets up a tablet; stored on `instore_kiosk_configs.tablet_api_key` (UUID, one per business — owner can rotate from dashboard).
- No session expiry, no cookie expiry. The tablet stays loaded all day.
- This URL is NEVER on the printed QR — the owner copies it manually into the tablet's browser.

## DB schema

```sql
-- New table for rotating QR tokens
CREATE TABLE IF NOT EXISTS instore_kiosk_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL  -- 7 days from generation
);
CREATE INDEX idx_kiosk_tokens_business_active ON instore_kiosk_tokens(business_id, active) WHERE active = true;
CREATE INDEX idx_kiosk_tokens_token_lookup ON instore_kiosk_tokens(token) WHERE active = true;

ALTER TABLE instore_kiosk_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kiosk_tokens_owner_read" ON instore_kiosk_tokens
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Counter-tablet key on existing config
ALTER TABLE instore_kiosk_configs
  ADD COLUMN IF NOT EXISTS tablet_api_key uuid;

-- One-time backfill: generate a tablet key for every existing config
UPDATE instore_kiosk_configs SET tablet_api_key = gen_random_uuid() WHERE tablet_api_key IS NULL;
```

## Cron — daily token rotation at 04:00 AEST

New route: `/api/cron/kiosk-token-rotate`
- Schedule in vercel.json: `0 18 * * *` (UTC — that's 04:00 AEST during AEST/AEDT — use UTC, document in route comment)
- For every business with an active kiosk config:
  - Generate a new 32-char URL-safe token: `randomBytes(24).toString('base64url')`
  - INSERT a new row with `expires_at = now() + 7 days`
  - Mark tokens older than 7 days as `active = false` (don't delete — for audit)
- This means at any moment, ~7 valid tokens exist per business. A QR poster printed today stays valid for 7 days. After that, the owner needs to reprint.
- Notify the owner in the dashboard when their printed QR token is in its final day, with a "Print a new poster" button.

## Route changes

### `/in-store/[slug]/page.tsx` (CUSTOMER PHONE MODE)
1. Read `?t=` from search params on initial load.
2. If `t` present: POST `/api/in-store/redeem-token` with `{business_id, token}`. Server validates, sets `ariakiosk_{business_id}` cookie, returns success. Then redirect to the URL without the `?t=` query string (clean URL).
3. If no `t` and no cookie: render the "Please scan the QR in-store" friendly landing.
4. If cookie valid: render the kiosk as today.

### `/kiosk-tablet/[slug]/page.tsx` (COUNTER TABLET MODE)
1. Read `?key=` from search params.
2. POST `/api/in-store/tablet-auth` with `{business_id, key}`. Server validates against `instore_kiosk_configs.tablet_api_key`. Sets a longer-lived cookie `ariakiosk_tablet_{business_id}` (30 days, HttpOnly).
3. After auth: render the kiosk. The 30-day cookie means the tablet stays signed in unless someone clears browser data.

### `/api/public/instore/chat/route.ts` (the existing chat endpoint)
- Add session check: must have either the customer cookie OR the tablet cookie for this business_id. If neither: return 401 with `{error: 'session_expired', scan_qr: true}`.
- Frontend handles 401 by redirecting to the scan-QR landing page.

## Dashboard — Share page (from prompt 89)
On `/dashboard/share`:
- The kiosk QR card shows the URL with the CURRENT day's token: `ariaos.site/in-store/{slug}?t={token}`
- "Print A5 poster" button generates the PDF with that token's QR embedded
- Below the QR: warning if active tokens are within their last 2 days ("This poster expires in X days — print a new one")
- A separate small card: "Set up a counter tablet" — reveals the `/kiosk-tablet/{slug}?key={tablet_api_key}` URL with a "Copy" button and "Rotate key" link (regenerates the UUID — invalidates the old tablet)

## What does NOT change
- Browser TTS still works (no auth changes)
- `instore_demand_signals` and `instore_conversations` continue to be written
- All existing kiosk improvements (streaming, chips, stall guard) keep working
- The customer experience inside a valid session is identical to today

## Cost-impact telemetry
Add to the existing aria_ai_calls insert from the chat route:
- `auth_method: 'phone_qr' | 'tablet_key' | 'expired'` (extra column on aria_ai_calls — add via ALTER)
- Cron `/api/cron/kiosk-cost-summary` (daily) — for every business, summarise yesterday's kiosk costs in `aria_monthly_spend` row so it shows up in admin and customer billing dashboards.

## Rules
- npx tsc --noEmit + npm run build pass before each commit
- The cron MUST be daily — never sub-daily (Vercel Pro silent-fail rule)
- Cookie names include business_id so a customer who used two kiosks in two shops doesn't get cross-contamination
- Never use IP geolocation — too fragile for mobile networks
- Tokens are random, never sequential, never guessable
- After all commits: git push origin main

## Commits
- "feat(kiosk-auth): rotating QR tokens table + daily rotation cron"
- "feat(kiosk-auth): customer phone mode — token redeem + 3h session cookie"
- "feat(kiosk-auth): counter tablet mode + owner-issued tablet_api_key"
- "feat(kiosk-auth): chat route enforces session cookie or returns 401 with scan-QR redirect"
- "feat(share): kiosk QR poster includes current token + counter-tablet setup card"

## If limit runs low
Priority:
1. DB + cron + token rotation (the foundation)
2. Customer phone mode + chat route auth check (the actual lockdown)
3. Counter tablet mode (only matters if owner uses tablets — can ship later)
4. Share page integration (nice but not blocking — owner can copy URLs manually)
Finish current commit, push, STOP, report.
