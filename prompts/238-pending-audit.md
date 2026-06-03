# Prompt 238 — All Genuinely Pending Prompts (Full Audit Result)

## Pre-flight
```
git pull origin main
npx tsc --noEmit
```
Read CLAUDE.md (RULE 0). Run tasks in the order listed. Push after every commit.

---

## CONFIRMED PENDING (code evidence missing)

### 1. Prompt 04 — Setup Guide: Post-Onboarding Checklist with Spotlight
**What it is:** After onboarding, owner sees a checklist ("Connect Instagram", "Add first product", "Run first sale") with a spotlight UI that highlights each step in the actual UI. Like Intercom's product tours.

**Build:**
- `src/app/dashboard/setup/page.tsx` — checklist page with steps and completion tracking
- `src/app/api/setup/progress/route.ts` — GET/PATCH progress per business
- DB: `setup_progress` table (business_id, step_key, completed_at)
- Steps: connect_pos, add_products, first_sale, connect_social, connect_xero, enable_aria
- Sidebar entry under dashboard nav
- Once all steps complete, banner disappears permanently

Commit: `"feat(setup-guide): post-onboarding checklist with step tracking"`

---

### 2. Prompt 17+18 — POS Layout Customisation (Level 1, 2, 3)
**What it is:** Owners can drag-and-drop rearrange their POS product grid, create custom categories/tabs, pin frequently sold items, and set layout presets per outlet.

**Check first:** Read `src/app/pos/(fullscreen)/terminal/page.tsx` to see current layout. Read `src/app/dashboard/pos` contents.

**Build:**
- `src/app/dashboard/pos-layout/page.tsx` — layout editor with drag-and-drop grid
- `src/app/api/pos/layout/route.ts` — GET/POST layout config per business
- DB: `pos_layout_configs` table (business_id, outlet_id, layout_json, updated_at)
- Features: category tabs ordering, product grid ordering, pinned items, layout presets
- "Save layout" button syncs to DB; POS terminal reads layout_config on load

Commit: `"feat(pos-layout): drag-and-drop POS layout customisation"`

---

### 3. Prompt 29 — Privacy Sprint: Data Export + Deletion
**What it is:** GDPR/Australian Privacy Act compliance. Owner can export all their business data as a ZIP, or delete their account and all data permanently. Already has `/app/privacy` page but needs the actual export/deletion routes.

**Check first:** Read `src/app/privacy/page.tsx` to see what's there. Check `src/app/api/business/export/route.ts`.

**Build (if missing):**
- `POST /api/business/export` — generates a ZIP of all business data (sales, customers, products, staff) and emails it
- `POST /api/business/delete-account` — hard deletes all data, cancels Stripe subscription, sends confirmation email
- Add to privacy page: "Export my data" and "Delete account" buttons with confirmation modals

Commit: `"feat(privacy): data export ZIP + account deletion routes"`

---

### 4. Prompt 62 — Multi-Outlet: Add/Manage Outlets + Switch in POS Terminal
**What it is:** Business owners with multiple physical locations can add outlets, assign registers per outlet, and switch outlets in the POS terminal. API routes exist (`/api/pos/outlets`) but no dashboard UI.

**Check first:** Read `src/app/api/pos/outlets/route.ts`. Check `src/app/dashboard/pos` for any outlet page.

**Build:**
- `src/app/dashboard/outlets/page.tsx` — outlet management: add/edit/deactivate outlets, assign registers
- Outlet switcher in POS terminal header (dropdown if business has >1 outlet)
- `src/app/api/pos/outlets/[id]/route.ts` — PATCH/DELETE individual outlet

Commit: `"feat(multi-outlet): outlet management dashboard + POS terminal switcher"`

---

### 5. Prompt 66 — Slack Integration: Team Briefings + Aria Notifications
**What it is:** Connect a Slack workspace, and Aria sends daily briefings, low stock alerts, and review notifications directly to a chosen Slack channel. No code found anywhere.

**Build:**
- `src/app/api/integrations/slack/route.ts` — OAuth connect flow
- `src/app/api/integrations/slack/callback/route.ts` — OAuth callback, save token
- `src/lib/integrations/slack.ts` — `sendSlackMessage(channel, text, blocks)` helper
- DB: `slack_connections` table (business_id, team_id, channel_id, access_token, connected_at)
- Add Slack to integrations page with connect button
- Hook into daily briefing: if slack_connections exists, also send briefing to Slack

Commit: `"feat(slack): Slack integration — daily briefings + alert notifications"`

---

### 6. Prompt 68 — Live POS Intelligence: 10 Real-Time AI Features
**What it is:** During a POS session, Aria watches the sale in real-time and surfaces intelligence: "This customer usually orders a flat white — suggest it", "You're 3 sales from hitting your daily target", "Upsell opportunity: suggest the croissant (pairs well with their latte)".

**Check first:** Read `src/app/pos/(fullscreen)/terminal/page.tsx` to see if any live intelligence panel exists.

**Build:**
- `src/app/api/aria/live-pos/route.ts` — POST with current cart + customer_id, returns suggestions
- Live panel in POS terminal (collapsible sidebar or bottom bar) showing Aria's real-time suggestions
- Features: upsell suggestions, customer history context, daily target progress, slow period alerts, combo suggestions

Commit: `"feat(live-pos): real-time AI intelligence panel in POS terminal"`

---

### 7. Prompt 75 — In-Store Ad Network: Sell Screen Space to Brands
**What it is:** When the in-store kiosk is idle, it shows branded ads from suppliers/brands. Business owner can sell screen time slots to local brands. Revenue share model.

**Check first:** Read `src/app/in-store/[business_id]/page.tsx` to see idle state.

**Build:**
- `src/app/api/public/instore/ads/route.ts` — GET active ads for a business
- `src/app/dashboard/ad-network/page.tsx` — manage ad slots, approve/reject ads, view revenue
- DB: `instore_ads` table (id, business_id, advertiser_name, image_url, cta_text, cta_url, active, starts_at, ends_at, cost_per_day)
- Idle screen in kiosk shows ads in rotation when no customer interaction for 30s

Commit: `"feat(ad-network): in-store kiosk ad network with brand slot management"`

---

### 8. Prompt 89 — Customer Hub + Share Toolkit + Loyalty Config
**What it is:** A public-facing customer hub page (`/hub/{slug}`) where customers can check their loyalty points, view their purchase history, and opt-in to marketing. API exists at `/api/hub` but no frontend.

**Check first:** Read `src/app/api/hub/route.ts` to understand what data it returns.

**Build:**
- `src/app/hub/[slug]/page.tsx` — public customer hub (no auth, customer enters phone/email to see their account)
- Loyalty points balance display
- Recent purchase history
- Opt-in/opt-out marketing preferences
- Share toolkit: business owner can send customers a link to their hub page

Commit: `"feat(customer-hub): public hub page with loyalty + purchase history"`

---

### 9. Prompt 92 — Hub Loyalty Fixes
**What it is:** Fixes to the customer hub that were specified after prompt 89 — missing loyalty cards, dead loyalty links, QR code generation for hub access.

**Run after Prompt 89 tasks above are complete.**

**Build:**
- QR code generator for the hub link (add to dashboard/loyalty settings)
- Fix any broken loyalty point display in the hub
- Add "Redeem points" CTA that generates a discount code

Commit: `"fix(customer-hub): QR code + loyalty redemption fixes"`

---

### 10. Prompt 104 — Customer Management: Full CRM to Category-Leading Standard
**What it is:** The basic customers page exists but needs upgrading to match Klaviyo/HubSpot: customer segments, RFM scoring, lifetime value display, purchase history timeline, notes, tags, email/SMS from profile.

**Check first:** Read `src/app/dashboard/customers/page.tsx` to see current state.

**Build:**
- Customer detail page (`/dashboard/customers/[id]`) — full profile with timeline, RFM score, CLV, notes, tags
- Segment builder — create segments by spend, visit frequency, last visit, tags
- Bulk actions — send campaign to segment, export to CSV
- Customer tags system
- Notes field per customer

Commit: `"feat(crm): customer management upgrade to category-leading standard"`

---

### 11. Prompt 108 — Xero Sync: Complete the Review-First Flow
**What it is:** The Xero integration works (connect, sync queue, xero_sync_previews) but there's no dedicated Xero dashboard page. Owners can't see sync history, approve pending syncs, or manage the connection from a single place.

**Check first:** Read `src/app/dashboard/integrations/page.tsx` to see if Xero is covered there.

**Build:**
- `src/app/dashboard/xero/page.tsx` — Xero dashboard with: connection status, pending syncs queue, sync history, error log, manual sync button
- Tabs: Overview / Pending Review / Sync History / Settings
- "Approve all" bulk action for pending syncs
- Clear error messages when sync fails

Commit: `"feat(xero-dashboard): dedicated Xero sync management page"`

---

### 12. Prompt 111 — Bookings: Complete to Deputy/HotDoc Standard
**What it is:** Bookings page exists but needs completion: online booking widget (embeddable), email/SMS reminders, Google Calendar sync, waiting list, repeat booking, and a public booking page.

**Check first:** Read `src/app/dashboard/bookings/page.tsx` and `src/app/api/bookings/route.ts`.

**Build:**
- Public booking page: `src/app/book/[slug]/page.tsx` — customer-facing booking form
- Google Calendar sync: add to `src/app/api/integrations/google/` 
- SMS/email reminders: hook into existing SendGrid/ClickSend from `src/app/api/bookings/remind/route.ts`
- Waiting list: add `is_waitlisted` column and waitlist management UI
- Repeat booking: recurring booking support
- Embeddable widget: `<iframe src="/book/{slug}">` snippet in settings

Commit: `"feat(bookings): public booking page + Google Calendar + SMS reminders + waitlist"`

---

### 13. Prompt 219 — Native Gift Card System
**What it is:** Gift card API exists (`/api/pos/gift-cards`) and a POS page exists (`/pos/gift-cards`) but no dashboard management page. Owners can't issue, track, or manage gift cards from the dashboard.

**Check first:** Read `src/app/api/pos/gift-cards/route.ts` to see the current API.

**Build:**
- `src/app/dashboard/gift-cards/page.tsx` — gift card management: issue new cards, view all cards, check balances, void cards, sales analytics
- Gift card sales report (total issued, total redeemed, outstanding liability)
- Digital gift card email delivery (send code via email)
- Sidebar nav entry under dashboard

Commit: `"feat(gift-cards): gift card management dashboard + email delivery"`

---

## ITEMS CONFIRMED DONE (live under different paths — DO NOT implement)

These showed ❌ initially but are confirmed built:
- **19/22 Council** → `src/app/api/agents/council` ✅
- **20/59 Gemini** → `src/lib/gemini.ts` ✅  
- **24 Avatar** → `src/app/api/aria/avatar` ✅
- **29 Privacy page** → `src/app/privacy` ✅ (check if export routes exist)
- **46 Quotes** → `src/app/dashboard/quote-builder` ✅
- **48 Competitors** → `src/app/dashboard/competitors` ✅
- **51 Parcels** → `src/app/dashboard/parcel-tracking` ✅
- **53 Reports** → `src/app/dashboard/weekly-reports` ✅
- **55 Variance** → `src/app/dashboard/variance` ✅
- **64 Google Ads** → `src/app/api/integrations/google` ✅
- **84 Website** → `src/app/dashboard/website-chat` ✅
- **108 Xero connection** → `src/app/dashboard/integrations` ✅ (but no dedicated Xero page)
- **219 Gift cards API** → `src/app/api/pos/gift-cards` ✅ (but no dashboard UI)

---

## RULES
- Each task = its own commit
- `npx tsc --noEmit` + `npm run build` before every commit
- `git push origin main` after every commit
- Vercel function limit stays at 22
- UPGRADE_ONLY: never remove existing features
- DB: amounts in dollars (numeric), never cents (except *_cents columns)

## PRIORITY ORDER if limit runs low
1. 108 — Xero dashboard (highest owner value, Xero already connected)
2. 104 — Customer CRM upgrade (pre-launch critical)
3. 111 — Bookings public page (customer-facing)
4. 219 — Gift card dashboard (API already done)
5. 62 — Multi-outlet UI (API already done)
6. 89 — Customer hub (API already done)
7. 04 — Setup guide (onboarding polish)
8. 68 — Live POS intelligence
9. 29 — Privacy export/deletion routes
10. 92 — Hub fixes (after 89)
11. 66 — Slack integration
12. 17-18 — POS layout customisation
13. 75 — Ad network
