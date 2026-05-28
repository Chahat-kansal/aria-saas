# Prompt 89 — Customer-facing share links + loyalty platform completion

## The gap
We have built powerful customer-facing surfaces (kiosk, loyalty signup, public
bookings, Aria Community) but the owner has no way to share these with their
customers. The customer would never type `/in-store/Sip` or `/loyalty/Sip` —
they need a printable QR / shareable link / SMS-able URL.

Also: loyalty plumbing exists but no owner has actually CONFIGURED a loyalty
program. `pos_loyalty_config` is empty. Without config there's no signup-bonus,
no points-per-dollar, no redemption — so even if a customer signs up, nothing
happens.

This prompt closes both gaps.

## TASK 1 — One central "Share with your customers" hub

### New page: /dashboard/share-with-customers

A single page where the owner generates every customer-facing share link in one
place. Layout: 5-6 cards, one per surface.

For EACH surface:
- The customer URL (e.g. `https://ariaos.site/loyalty/Sip`)
- A "Copy link" button
- A "Download QR code" button (PNG, 1200x1200, with the business logo in the
  middle if available, suitable for printing on a poster)
- An "Open preview" button that opens the customer URL in a new tab so the
  owner sees what their customer would see
- A short "Where to put this" hint:
  - Kiosk → "Print and stick by the till — customers scan to order/ask Aria"
  - Loyalty → "Print and put on receipts, or text to customers after purchase"
  - Bookings → "Add to your Instagram bio, Google Business Profile, website"
  - Community → "Tell regulars they can follow your shop and get deals"
  - Online ordering (if exists) → "Share in WhatsApp groups, post to socials"
  - Reviews ask (if exists) → "Send via SMS after a purchase"

### Surfaces to surface (verify each exists)
1. **In-Store Kiosk** — `/in-store/{slug}` (already has a QR generator in
   /dashboard/in-store — reuse that QR logic, do not rebuild)
2. **Loyalty signup** — `/loyalty/{slug}`
3. **Public bookings** — there's an API at `/api/public/bookings/{slug}` but
   probably no UI page yet. Build `/book/{slug}/page.tsx` (or wherever the
   existing booking widget lives) as a simple mobile-friendly booking page that
   uses the existing public bookings API.
4. **Aria Community profile** — `/community/businesses/{slug}` or wherever the
   business profile is
5. **Online ordering** — only if /kiosk/{outlet_id} (POS-ordering, the OTHER
   kiosk path) exists for this business
6. **Leave a review** — `/review/{slug}` if exists, else hide this card

### QR generator
Use the `qrcode` npm package (already a dep — verify). Generate at 1200x1200
PNG, embed the business logo if `business.logo_url` exists. Provide both PNG
download and a print-ready A5 poster PDF with:
- Big QR code in the middle
- Business name above
- A clear instruction below ("Scan to join our loyalty program", "Scan to talk
  to our shop assistant", etc.)
Reuse the existing kiosk A5 poster generator pattern — extend it to all surfaces.

### Sidebar entry
Add "Share with customers" to the dashboard sidebar under the existing
"Customer surfaces" section from prompt 83. Lucide icon: `share-2` or `qr-code`.

### Commit
"feat(share): central 'Share with customers' hub with QR codes and posters for kiosk, loyalty, bookings, community, ordering, reviews"

## TASK 2 — Owner-facing loyalty program configuration

### What's missing
`pos_loyalty_config` is empty for every business. Owners have never been asked
to configure their loyalty program. So even if a customer signs up, nothing
happens (no welcome bonus, no points accumulate, no rewards to redeem).

### What to build

Page: /dashboard/loyalty/setup (or upgrade the existing /dashboard/loyalty
if it exists and is empty)

Configure:
- **Points per dollar spent** (default 1) — number input
- **Signup bonus** (default 50 points) — number input
- **Birthday bonus** (default 100 points) — toggle + number
- **Welcome message** — text (used in SMS + signup confirmation)
- **Reward tiers** — table of "X points = $Y off / free item" rules. Pre-seeded
  with sensible defaults the owner can edit:
  - 100 points → $5 off
  - 250 points → $15 off
  - 500 points → 20% off your next purchase
- **Auto-enrol** — toggle. If on, any customer who purchases gets auto-enrolled
  (no signup page needed). If off, customers must visit /loyalty/{slug} and
  enrol themselves.
- **Communication preferences** — checkboxes: SMS welcome / Email welcome /
  Birthday SMS / Points-update SMS after every transaction

### DB
`pos_loyalty_config` table exists — read its schema, fill in the missing
columns if needed:
```sql
ALTER TABLE pos_loyalty_config
  ADD COLUMN IF NOT EXISTS points_per_dollar numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS signup_bonus int DEFAULT 50,
  ADD COLUMN IF NOT EXISTS birthday_bonus int DEFAULT 100,
  ADD COLUMN IF NOT EXISTS welcome_message text,
  ADD COLUMN IF NOT EXISTS auto_enrol boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_welcome boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sms_points_update boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_birthday boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS reward_tiers jsonb DEFAULT '[{"points":100,"reward":"$5 off"},{"points":250,"reward":"$15 off"},{"points":500,"reward":"20% off"}]';
```

### Wiring up the actual loyalty engine
- POS sale completes (`pos_sales` insert) → cron or trigger awards points based
  on `points_per_dollar` × sale total → insert into `pos_loyalty_transactions`
- Customer signs up via `/api/public/loyalty/{slug}/enrol` → awards `signup_bonus`
  → fires welcome SMS (if `sms_welcome=true`) with the configured welcome message
- Customer hits a tier threshold → fires "you've earned {reward}!" SMS

### Commit
"feat(loyalty): owner configuration page + auto-enrol + auto-award points + tier rewards"

## TASK 3 — Public-facing loyalty page polish

### Current state
`/loyalty/[business_id]/page.tsx` exists. Verify and polish:
1. Customer arrives at `/loyalty/Sip` (or similar slug)
2. Top of page: business logo, business name, "Join {biz_name}'s rewards"
3. If not signed up: simple form — phone OR email, first name. Submit → POST
   /api/public/loyalty/{slug}/enrol → awards signup_bonus → shows confirmation
4. If signed up (cookie or phone-lookup): show current points balance, history
   of recent earns (last 10), and the tier rewards table — visually
   highlighting which tiers are unlocked vs locked
5. Add "Why join" benefit list at the top for new visitors (auto-generated from
   reward_tiers + signup_bonus): "Get 50 points just for joining. Earn 1 point
   per $1 spent. Unlock $5 off at 100 points."

### Design
Match the Pipel-direction community design (light theme, lime accent, ink
borders) — that's the locked customer-facing visual system from prompt 83.

### Commit
"feat(loyalty-public): polished customer-facing signup + points-check experience"

## TASK 4 — Aria intelligence for loyalty

Add invoice-style intelligence for loyalty into the daily briefing + weekly
report:
- New signups this period: X
- Points awarded this period: Y
- Rewards redeemed: Z worth $W
- At-risk: customers in {tier} who haven't visited in 60 days (winback target)
- Top loyalty earner this month: {customer_name}

Also on the loyalty dashboard, add the AriaSays banner with the same data.

### Commit
"feat(loyalty-intel): briefing + weekly report + dashboard banner include loyalty stats"

## RULES
- Each task is its own commit
- npx tsc --noEmit + npm run build pass before each commit
- After all commits: git push origin main
- Customer-facing pages match the locked Pipel design from prompt 83
- Reuse the existing kiosk QR generator pattern for all share-link QRs

## PRIORITY ORDER (if limit runs low)
1. Task 1 (Share hub) — most-important launch fix, makes everything discoverable
2. Task 2 (Loyalty config) — needed so loyalty actually works
3. Task 3 (Public loyalty page polish) — verify, may already be fine
4. Task 4 (Loyalty intelligence) — nice-to-have, post-launch is OK

Finish current commit, push, STOP, report.
