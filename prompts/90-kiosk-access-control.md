# Prompt 90 — Kiosk access control + Scan-and-Go self-checkout

## Two things to ship together
1. Lock down the kiosk URL so screenshots burn negligible tokens
2. Add scan-and-go: customer scans products in-store with their phone, generates one barcode, cashier scans it → all items appear in Aria POS

Both share the same QR/token infrastructure, that's why they're in one prompt.

---

# PART A — Kiosk access control

## Honest caveat I have to surface up front
"Make only actual barcode scans work, not screenshots" — browsers physically
cannot distinguish a real-world camera scan of a printed QR from a camera
scan of a screen displaying the QR. Both produce identical pixel data. There
is no JavaScript API that returns "real-world scan vs screen-of-a-screen."

What we CAN do — and it's nearly as good:
- Token rotates every 5 days. Yesterday's screenshot dies in 5 days.
- Session lasts 7 minutes from first chat. Screenshotter has tiny window to
  share + have someone use it before expiry.
- Cost cap from prompt 86 is the ACTUAL margin protection. This prompt limits
  abuse window, but the cost cap is what genuinely protects the business.

Customer experience inside a valid session is identical to today.

## Two modes, two URLs

### Mode A — Customer phone (rotating QR, 7-minute session)
- URL: `/in-store/{slug}?t={token}`
- Token rotates daily at 04:00 AEST. Previous 5 days of tokens stay valid.
- On first load with `t`: server validates token, sets `ariakiosk_{business_id}` cookie (HttpOnly, Secure, SameSite=Lax, Path=/in-store, Max-Age=420 = 7 minutes), redirects to clean URL.
- After 7 minutes: friendly "Scan the QR in-store to chat with Aria again" landing.
- This intentionally short — customers don't linger in small businesses. If they want another chat (a café customer thinking of a follow-up question), they re-scan. Trivial friction in-shop, hard friction at-home.

### Mode B — Counter tablet (always-on, owner-issued key)
- URL: `/kiosk-tablet/{slug}?key={kiosk_api_key}`
- Key stored on `instore_kiosk_configs.tablet_api_key` (UUID, owner can rotate from dashboard).
- 30-day cookie on the tablet. Owner copies the URL onto the tablet manually — this URL is NEVER printed on a QR.

## DB
```sql
CREATE TABLE IF NOT EXISTS instore_kiosk_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  generated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_kiosk_tokens_business_active ON instore_kiosk_tokens(business_id, active) WHERE active = true;
CREATE INDEX idx_kiosk_tokens_token_lookup ON instore_kiosk_tokens(token) WHERE active = true;

ALTER TABLE instore_kiosk_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kiosk_tokens_owner_read" ON instore_kiosk_tokens
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE instore_kiosk_configs ADD COLUMN IF NOT EXISTS tablet_api_key uuid;
UPDATE instore_kiosk_configs SET tablet_api_key = gen_random_uuid() WHERE tablet_api_key IS NULL;
```

## Cron — daily token rotation at 04:00 AEST (18:00 UTC)
`/api/cron/kiosk-token-rotate` — vercel.json schedule `0 18 * * *`
- For every active kiosk config: generate new 32-char URL-safe token, INSERT with `expires_at = now() + 5 days`.
- Mark tokens older than 5 days as `active = false`.
- ~5 tokens valid per business at any moment. Poster printed today is valid for 5 days.
- Dashboard banner when poster has 2 days or less remaining.
- Email/SMS the owner 2 days before final expiry: "Reprint your kiosk QR by Friday — your current poster expires Sunday."

## Route changes
- `/in-store/[slug]/page.tsx` — read `?t=`, redeem against token table, set 7-min cookie, redirect to clean URL. If no `t` and no cookie: "scan the QR" landing.
- `/kiosk-tablet/[slug]/page.tsx` (NEW) — read `?key=`, validate against tablet_api_key, set 30-day cookie.
- `/api/public/instore/chat/route.ts` — require either cookie type for the business_id. Return 401 with `{error: 'session_expired'}` otherwise. Frontend redirects to scan-QR landing on 401.

## Dashboard /dashboard/share kiosk card
- Show URL with current token, QR PNG, A5 poster PDF.
- Below: warning if active tokens are within their last 2 days.
- Separate small card: "Set up a counter tablet" — reveals `/kiosk-tablet/{slug}?key=...` with "Copy" + "Rotate key" buttons.

## Commits — Part A
- "feat(kiosk-auth): rotating QR tokens + daily rotation cron (5-day window)"
- "feat(kiosk-auth): customer phone — 7-min session cookie + scan-QR landing"
- "feat(kiosk-auth): counter tablet mode + owner-issued tablet_api_key"
- "feat(kiosk-auth): chat route enforces session cookie, 401 redirects to scan-QR"
- "feat(share): kiosk QR poster reflects current token + counter tablet setup + expiry warnings"

---

# PART B — Scan-and-Go self-checkout

## What this is
Customer scans products in-store with their phone camera. Phone keeps a basket.
When done, phone generates ONE barcode containing the basket. Cashier scans
that barcode at the POS. Every item appears instantly. Cashier collects
payment. Customer walks out.

This is the same pattern as Amazon Fresh, Decathlon Mobile Checkout, Coles
Mobile Self-Checkout, Sam's Club Scan & Go. A real, proven feature.

## Hard requirements (non-negotiable)

### 1. Age-restricted items MUST get manual ID check
For liquor, tobacco, R18+ — when scanned into the customer basket, flag with
`age_restricted: true`. At the cashier side, the cart-redemption flow MUST show
"ID CHECK REQUIRED" before allowing the sale to complete. Cashier physically
verifies age, taps "ID confirmed". Without that confirmation, the sale cannot
finalise. This is Australian liquor licensing law — non-negotiable.

### 2. Browser BarcodeDetector or fallback library
The customer's phone needs to scan product barcodes. Browser BarcodeDetector
API is the cheapest path (free, native, fast). Falls back to ZXing-js on
browsers that don't support it (Safari iOS < 17, older Android browsers).
NO Vision API — too expensive at scale.

### 3. Cart barcode format
The cart-to-cashier barcode contains a short token (6-10 chars), NOT the cart
contents. Cashier scans the token, POS API calls `/api/pos/scan-and-go/redeem`
with the token, server returns the full cart. Token expires 15 min after cart
is "finished." This way the printed/displayed barcode stays short enough for a
standard QR/Code128 scanner.

### 4. Loyalty auto-apply
If the customer is signed in to the loyalty program (we have their session via
the kiosk token or a saved loyalty cookie), their loyalty discount/points
auto-apply when the cashier redeems the cart.

## Customer flow

### Entry points (three places — same destination)
The customer can start scan-and-go from any of these:

**1. In-shop QR sticker (the BIG one)** — the printed QR by the till.
This QR now lands on a tiny chooser page `/in-store/{slug}/welcome?t={token}` showing two big buttons:
- "Ask Aria a question" → existing kiosk chat at `/in-store/{slug}`
- "Skip the queue — scan as you shop" → `/in-store/{slug}/cart`
Both buttons use the same session cookie from the token redeem. Customer picks once.

If the business has scan-and-go DISABLED in their kiosk config: skip the chooser entirely, the QR goes straight to the kiosk chat as before. The chooser only appears for businesses that have opted in.

**2. Unified hub at `ariaos.site/{slug}`** — one of the hub cards is "Skip the queue — scan as you shop." Tapping it requires the customer to scan the in-shop QR first to get a valid session (we cannot let them shop from home and generate a basket from the couch). The card on the hub redirects to a friendly "Please scan our in-shop QR to get started — your phone needs to be in our shop for this to work."

**3. Inside the kiosk chat itself** — if the customer is mid-conversation with Aria and asks something like "do you have ABC?" Aria can reply with a "Yes — tap here to start a basket and skip the queue" action_card block. One-tap into the scan-and-go flow with the cookie already valid.

All three entry points end up at `/in-store/{slug}/cart` with a valid session.

### Cart page `/in-store/{slug}/cart`
- Big "Tap to scan a product" button — opens browser camera with BarcodeDetector overlay
- Scanned items appear as a list — product name, price, qty, "remove" + "+/-" qty controls
- Running total at top, item count
- "Finish shopping" button at bottom

### Finish
- Cart is sealed (no more adds), gets a short token, server stores in `pos_self_checkout_carts`
- Display a big QR code on the customer's phone — "Show this to the cashier"
- 15-minute countdown — after that, cart expires. Customer can re-open if they had to wait.

### After cashier redeems
- Customer's phone shows "Paid — thank you" and (if loyalty) "+47 points earned"
- They can leave a review or join loyalty from this confirmation screen

## Cashier flow
- Cashier opens the POS sale screen
- Either: scans the cart QR with the POS barcode scanner, OR taps a new "Scan customer cart" button which opens the camera (for POS-on-tablet without a scanner gun)
- Cart contents appear in the sale
- Age-restricted items show a red banner: "ID CHECK REQUIRED — verify customer is 18+"
- Cashier ticks "ID confirmed" — banner clears
- Cashier processes payment as normal
- On payment success: cart marked `redeemed`, customer's phone updates, points awarded

## DB
```sql
CREATE TABLE IF NOT EXISTS pos_self_checkout_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,  -- 8-char URL-safe, the customer-facing barcode
  items jsonb NOT NULL DEFAULT '[]',  -- [{product_id, name, price, qty, age_restricted}]
  subtotal_cents int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'shopping' CHECK (status IN ('shopping','finished','redeemed','expired','cancelled')),
  customer_session_token text,  -- if joined to loyalty
  loyalty_customer_id uuid REFERENCES pos_customers(id),
  finished_at timestamptz,
  expires_at timestamptz,  -- finished_at + 15 min
  redeemed_at timestamptz,
  redeemed_sale_id uuid REFERENCES pos_sales(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_checkout_carts_token ON pos_self_checkout_carts(token) WHERE status IN ('finished','shopping');
CREATE INDEX idx_checkout_carts_business_status ON pos_self_checkout_carts(business_id, status);

ALTER TABLE pos_self_checkout_carts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carts_owner" ON pos_self_checkout_carts
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- Add age_restricted flag to products if not present
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS age_restricted boolean DEFAULT false;
```

## Routes
- POST `/api/public/scan-and-go/cart` — create/update cart {business_id, session_token, action: 'add' | 'remove' | 'update_qty', barcode, product_id, qty}
- POST `/api/public/scan-and-go/finish` — seal cart, return token + QR data
- GET `/api/public/scan-and-go/cart?token=` — customer's phone polls for status (so it can show "paid" after cashier redeems)
- POST `/api/pos/scan-and-go/redeem` — cashier-side, called from POS, returns full cart contents for that token
- POST `/api/pos/scan-and-go/complete` — cashier-side, marks cart redeemed, links to created pos_sales row

## Cron — `/api/cron/expire-checkout-carts`
- Daily 04:00 AEST: mark `status = 'expired'` for any finished cart older than 15 min not yet redeemed
- Don't delete — keep for analytics on abandonment

## Honest pre-condition: products MUST have barcodes
Right now Sip has 0 barcodes in `pos_product_barcodes`. The feature literally
cannot work for that business until barcodes are added. Two parts:
1. Dashboard `/dashboard/products` — add a barcode input field per product, and a bulk-add CSV importer for barcode-to-product mapping (rows: barcode, product_sku).
2. On the products page, show a strip at the top: "X of Y products are missing barcodes — scan-and-go won't work for them yet."
3. When a customer scans a barcode in-store that doesn't match any product, the cart page shows a friendly "we don't have that one yet — please bring it to the counter."

## Owner setup toggle
On `/dashboard/in-store` (the kiosk config page), add a section:
- "Enable Scan-and-Go self-checkout" toggle (default: off — owner opts in once they have barcodes set up)
- A short explainer + a "Test the flow" button that opens a mock cart

## Cashier UI
Find the POS sale page. Add a "Scan customer cart" button next to the existing
add-item buttons. On click: camera opens for barcode scan, OR a manual entry
field for the cart token. Decode → call redeem → populate the sale.

## Aria intelligence layer
- Daily briefing mentions: "X customers used scan-and-go today, average basket
  $Y, vs $Z for normal checkout" — measure if the feature actually moves basket
  size (often it does — customers walking the aisles longer)
- Customer Inbox (from prompt 89): scan-and-go sessions appear as a stream too,
  so the owner sees which products customers most commonly self-scan, abandonment
  rate (started but not finished), and average dwell time

## Commits — Part B
- "feat(scan-go): DB schema + pos_self_checkout_carts table + age_restricted flag"
- "feat(kiosk-welcome): /in-store/{slug}/welcome chooser page (Ask Aria | Skip the queue)"
- "feat(scan-go): customer scan + cart + finish + token-QR flow"
- "feat(scan-go): cashier-side redeem in POS sale page with ID-check enforcement"
- "feat(scan-go): owner toggle on /dashboard/in-store + barcode setup helper"
- "feat(scan-go): briefing + Customer Inbox integration"

---

# Final
After all Part A and Part B commits: `git push origin main`

## If limit runs low
Priority across both parts:
1. Part A — kiosk auth (cost protection — highest urgency, ship even if Part B has to wait)
2. Part B — scan-and-go basic flow (DB + customer + cashier — the actual feature)
3. Part B — owner toggle + barcode helpers (can ship after with manual barcode entry)
4. Part B — intelligence layer (post-launch is fine)
Finish current commit, push, STOP, report.
