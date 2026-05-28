# Prompt 83 — Aria Community Visual Redesign + Business Website Link

## What this is
A complete visual redesign of every page in `src/app/community/` to match an
attached design reference (the Pipel-direction mockup attached to this prompt).
Plus a small additive feature: businesses can attach a website URL to their
community profile, customers can tap through to it.

Read the attached design reference image FIRST. The visual direction is locked.
Do not deviate from it — do not "improve" or "soften" anything. Match it.

## DESIGN SYSTEM — locked, from the attached reference

### Palette
- `--bg`            `#fafafa`  (off-white page background)
- `--surface`       `#ffffff`  (cards, nav, modals)
- `--surface-alt`   `#f3f3f3`  (chips, search input, secondary buttons)
- `--ink`           `#0a0a0a`  (all primary text AND all card borders)
- `--ink-soft`      `#888888`  (secondary text)
- `--accent`        `#d9f54e`  (lime — used ONLY for active state, save buttons, the $price highlight, story rings, primary CTA pills, story LIVE pill indicator background)
- `--live`          `#ff3b5e`  (LIVE pill, urgent badges only)

These are the ONLY colours. Do not introduce greys, pastels, or extra accent
shades. If you need something to look subtler, use lower opacity of --ink.

### Typography
- Font family: `Inter` (load from Google Fonts: weights 400, 500, 600, 700, 800)
- Display headings (page titles, business names): `font-weight: 700; letter-spacing: -0.03em;`
- Section headings: `font-weight: 700; letter-spacing: -0.02em;`
- Body: `font-weight: 500;`
- Labels and meta (timestamps, distance): `font-weight: 600; font-size: 9-10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-soft);`
- Numbers (prices, stat values): `font-weight: 700; letter-spacing: -0.03em;`

### Borders, radii, shadows
- All cards: `border: 1.5px solid var(--ink); border-radius: 18-22px;`
- **CRITICAL**: borders are hard ink black, NOT soft grey. Do not change `1.5px solid var(--ink)` to `1px solid #e5e5e5` or anything similar. The hard borders are load-bearing for the look.
- Pills, chips: `border-radius: 11-13px;`
- No soft drop shadows on cards.
- The floating bottom nav DOES use a hard offset shadow: `box-shadow: 4px 4px 0 var(--ink);` — flat, no blur.

### Stories row
- 54px circle, 2-2.5px lime ring with 2px white inner border separating ring from avatar.
- If the business is live-posting (story posted in last 1h), add a small `LIVE` pill on the bottom-right of the avatar — `background: var(--live); color: white; font-size: 7px; font-weight: 700; padding: 2px 5px; border-radius: 5px;`

### Feed post card
- Header row: 30px squircle avatar (radius 10), business name (12px/700) with verified tick icon, timestamp + suburb in 9px/500 meta caps, dots menu right.
- Hero image: full-bleed inside the card, 148px tall.
- "TODAY ONLY" or category badge: ink-black bg, lime text, top-right corner of the hero.
- Body: 15px/700, tight tracking, single line if possible. Prices wrapped in `<span style="background: var(--accent); padding: 0 5px; border-radius: 5px;">$9</span>` — the inline highlight is the signature move.
- Actions row: heart icon + count, message icon + count, then a lime "save" pill pushed right.

### Business profile (read attached image: middle screen carefully)
- Top bar: arrow-back + dots-menu, NO title.
- Hero banner: 96px tall, gradient (brand-color based), 18px radius, soft radial accent glow inside.
- Avatar: 64px squircle (radius 18), 3px white border, overlapping the hero by -32px.
- Right of avatar (also overlapping the hero -32px): `[+ follow]` (lime pill) and `[message]` (white pill with 1.5px ink border) side by side.
- Below: business name (18px/700, tight tracking) + verified tick. One-line tagline in 10px/500 ink-soft. Then a 1-2 line bio in 10px/500 ink.
- **Website chip (NEW — see feature spec below)**.
- Stats strip: 3-column equal grid. Followers and Posts on `--surface-alt` cards. **The rating sits on a lime card** because it's the most important number for trust. All cards `border-radius: 12px; padding: 9px 7px; text-align: center;`. Big stat number 17px/700 tight, then a 8px/600 uppercase caps label.
- Tabs: `posts | menu | reviews`. Active tab gets a 2px ink underline, others ink-soft.
- Content grid: 3-column square images, 9px radius, 4px gap.

### Marketplace
- Page title: 24px/700 tight tracking, lowercase ("shop local."). Below it: a count "42 products near you" in 11px/500 ink-soft.
- Search input: `--surface-alt` background, 14px radius, padded, with a search icon and "search products" placeholder.
- Category chips strip: active is ink-black bg + lime text, others `--surface-alt` bg + ink text. 11px radius, 10px font.
- Product grid: 2 columns, 7px gap, hard ink border cards.
- Product card: 90px hero image (gradient or photo), product name 10px/600, price 15px/700 ink-black with tight tracking, then a 8px/600 uppercase caps meta line "BUSINESS · 400m".

### Bottom navigation — OPTION C from the chosen mockup
A floating pill with sliding lime indicator. Specifically:
- Container: positioned absolute, bottom: 14px, left: 14px, right: 14px (i.e. floats above the page with margin on three sides).
- Background: white, 1.5px solid `--ink`, border-radius: 22px, padding: 5px.
- Drop shadow: `box-shadow: 4px 4px 0 var(--ink);` (hard offset ink shadow — see attached reference).
- 5 tabs: feed, reels, market, search, profile (in that order).
- Inactive tab: just the icon at 18px, ink-black, evenly flex'd, no label.
- Active tab: a pill `background: var(--accent); border-radius: 17px; padding: 9px 13px;`. Inside: 16px icon + 11px/700 label in ink-black. The active tab takes `flex: 1.5;`, others `flex: 1;` — so the active one is visibly wider.
- The indicator MUST animate when switching tabs. Use Framer Motion's `layoutId` on the lime indicator div so it slides between tabs. If Framer Motion isn't installed, install it: `npm i framer-motion`. Fallback: a 240ms ease-out CSS transform if you really can't pull in the library, but Framer Motion is preferred.

## FILES TO REWRITE

### Primary token file (single source of truth)
`src/app/community/theme.ts` — rewrite to export ALL the design tokens above
as a const object. Every Community page imports from this. NO inline hex codes
in any page; everything reads from theme.ts.

### Pages to redesign (apply tokens, restructure layout)
- `src/app/community/page.tsx` — the feed root (yes, the feed is at /community, not /community/feed)
- `src/app/community/market/page.tsx`
- `src/app/community/market/[id]/page.tsx`
- `src/app/community/market/chats/page.tsx`
- `src/app/community/search/page.tsx`
- `src/app/community/discover/page.tsx`
- `src/app/community/me/page.tsx`
- `src/app/community/businesses/[id]/page.tsx` (or wherever the business profile lives — find it)
- `src/app/community/reels/page.tsx`
- `src/app/community/saved/page.tsx`

### Components
- `src/app/community/BottomNav.tsx` — full rewrite to OPTION C floating pill with Framer Motion sliding indicator.
- `src/app/community/PostCard.tsx` — restyle to spec above.
- `src/app/community/StoriesRow.tsx` — lime ring, optional LIVE pill.

## NEW FEATURE — Business Website Link

### DB migration (via Supabase MCP)
Check if `businesses.website` already exists (it does — used by SEO). Reuse it.
Do NOT create a new column.

If a business has a non-null `website`, the community profile page renders a
"website chip" right under the bio:

```html
<a href={website} target="_blank" rel="noopener noreferrer"
   style="display:inline-flex; align-items:center; gap:6px;
          background:var(--accent); color:var(--ink);
          font-size:11px; font-weight:700;
          padding:6px 12px; border-radius:11px;
          text-decoration:none;">
  <i className="ti ti-external-link" style="font-size:13px;" />
  {hostname}
</a>
```

Where `hostname` is `new URL(website).hostname.replace(/^www\./, '')`.

### Dashboard side — let owners attach their website
On `/dashboard/community/profile` (find it — should exist from Phase 1 or 3):
- Add an "Attach your website" section if `business.website` is empty
- Simple text input, validates as a URL on save
- If already set, show the current URL with an Edit and Remove button
- Save via existing businesses update endpoint

### Outbound-link safety
- Always `target="_blank" rel="noopener noreferrer"`
- Always strip whitespace and require https:// (auto-prepend if user enters bare domain)
- Reject obvious junk: javascript: URLs, malformed hosts, anything under 4 chars
- No iframe embed for launch — open in a new tab (in-app browser is a future enhancement)



## NEW SECTION — Anonymous Memory Across Sessions (verify, don't break)

The whole community is anonymous-first. A visitor's identity is a UUID stored in
their browser's localStorage as session_token, mapped to community_members.session_token.

This MUST continue to work after this redesign — verify it does:
1. Open /community in browser A → a session_token is created, member row inserted
2. Like a post, follow a business, save an offer
3. Close the tab, reopen /community next day
4. Same like, same follow, same saved offer must still be there
5. Test in a second browser → must look like a brand-new user (because localStorage is per-browser)

If any redesigned page accidentally bypasses session_token (e.g. by calling a route
that expects auth.uid()), fix it. Anonymous browsing is the core promise of the platform.

## NEW SECTION — Abuse and Spam Protection

The privacy guard only catches PII. Add an ABUSE guard alongside it, in the same
src/lib/community/privacy-guard.ts file (or a new src/lib/community/abuse-guard.ts).

### Layer 1 — profanity regex (cheap, fast, server-side)
Block messages containing:
- Profanity (common F-word, C-word, etc — use a published list like noswearing.com seed)
- Slurs (racial, sexual, ableist)
- Direct threats (variations of "kill", "find you", "burn down", "ruin", "destroy your business")
- Harassment patterns ("scam", "thief", "fraud", "fake", repeated with anger)

Be conservative on threats — match the verb + object pattern, not just the verb. "Kill the music" should pass; "kill you" should not.

### Layer 2 — Haiku second-pass (for coded abuse the regex misses)
If a message survives the regex but the customer's chat history with this business has 3+ previous flagged messages within 24h, run a Haiku check:
"Is this message harassing or threatening? Reply only YES or NO."
Block if YES.

### Layer 3 — rate limits per session_token
- Max 5 messages per minute per session_token per business
- Max 20 messages per hour per session_token across ALL businesses
- Exceeded → 429 with "Slow down — try again in N seconds"

### Layer 4 — report button + block list
- Every message gets a small dots-menu with "Report message"
- Owner inbox gets a "Block this customer" option that adds session_token to a
  `community_blocked_visitors` table (business_id, session_token, reason, blocked_at)
- Blocked visitors cannot send any new messages to that business (other businesses fine)

### DB migrations
```sql
CREATE TABLE IF NOT EXISTS community_message_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  business_id uuid REFERENCES businesses(id),
  reported_by_session_token text,
  reason text,
  status text DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed')),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_blocked_visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  session_token text NOT NULL,
  reason text,
  blocked_at timestamptz DEFAULT now(),
  UNIQUE(business_id, session_token)
);

ALTER TABLE community_message_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_blocked_visitors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports_anon_insert" ON community_message_reports
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "reports_owner_read" ON community_message_reports
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

CREATE POLICY "blocked_owner_all" ON community_blocked_visitors
  FOR ALL TO authenticated
  USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()))
  WITH CHECK (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

### Wire-in
- src/app/api/community/chats POST → run checkAbuseFull() alongside checkPrivacyFull()
- On block: return 403 with "This message was flagged as abusive. If this is a mistake, contact support."
- The owner-reply route ALSO runs both guards (owners can be abusive too)

## NEW SECTION — Surface every built feature in the dashboard sidebar

This is the most important section. We have shipped many features that are NOT
discoverable from the main dashboard. Fix this.

### Audit step (do this first)
Read src/components/dashboard/Sidebar.tsx (or wherever the sidebar component lives — find it).
List every link in the current sidebar.
Then list every page that exists in src/app/dashboard/* and src/app/community/* and src/app/in-store/*.
Identify the GAP — pages that exist but aren't linked.

### Sidebar restructure
Reorganise into clear sections (these section labels go above the link groups):

OPERATIONS (existing, keep)
- Sales / POS / Orders / Reorder / etc — whatever's there now

INTELLIGENCE (existing, keep + add)
- Reviews, SEO, Competitor watch (existing)
- Profit leaks, Cash flow, Missed demand, Intelligence centre (existing)
- Churn prevention, Smart reorder, Variance & shrinkage (existing)
- Add: Parcel tracking (link to /dashboard/parcel-tracking)
- Add: Ask Aria (link to wherever the Ask Aria chat panel opens — could be a toggle)

CUSTOMER SURFACES (NEW section)
- In-Store Kiosk owner config → /dashboard/in-store
- Aria Community profile → /dashboard/community/profile (or whatever the path is — find it)
- Aria Marketer → /dashboard/community/marketer
- Marketplace listings → /dashboard/marketplace
- Marketplace enquiries → /dashboard/marketplace?tab=enquiries

GROWTH (existing, keep + add)
- Social media (cross-posting)
- Loyalty, Reviews automation, Marketing
- Add: Bundle builder (if /dashboard/bundles exists)
- Add: Dynamic pricing (if /dashboard/pricing exists)
- Add: Ad network (if /dashboard/ads exists)

SETTINGS (existing, keep)
- Business, Team, Billing, Integrations

### Rules for the sidebar restructure
- Group with the section headers above (small caps labels, 10px/600 ink-soft)
- Active route gets accent treatment (lime bar on the left edge OR lime background — whichever matches the existing dashboard design language, don't break it)
- Add a small "NEW" pill on links to features built in the last 30 days — helps the owner notice what's new
- DO NOT redesign the whole dashboard sidebar — match existing styles
- Mobile: the sidebar collapses into a hamburger, the new sections should also collapse

### Dashboard homepage updates
The dashboard root (/dashboard) probably has tiles or cards for features. Add:
- A "Customer-facing" section with tiles for: Kiosk config, Community profile, Marketer, Marketplace
- A "What's new" strip pinned at the top showing the 3 most recently shipped features (with screenshots/icons)
- This is how owners discover what they have

### One single commit
"feat(dashboard): surface every feature in the sidebar, new Customer Surfaces section, What's New strip"

## RULES
- Read the attached image reference FIRST, before writing any code.
- Hard 1.5px ink borders stay hard. Don't soften to grey.
- Only the 7 colours above. No greys, no pastels.
- Every page reads from theme.ts. No inline hex codes anywhere.
- Mobile-first. 520px max-width container.
- Test on a real phone-width browser viewport before committing.
- npx tsc --noEmit + npm run build must pass.
- Commit per area so we can roll back surgically:
  - "feat(community): redesign theme.ts to Pipel-direction system"
  - "feat(community): redesign BottomNav to floating pill with sliding indicator"
  - "feat(community): redesign feed + stories + post card"
  - "feat(community): redesign business profile + website chip"
  - "feat(community): redesign marketplace + product cards"
  - "feat(community): redesign remaining pages (search, discover, me, reels, saved, chats)"
  - "feat(community): owner can attach website URL on dashboard profile page"
- After all commits: `git push origin main`

## IF LIMIT RUNS LOW
Stop after the current commit, push, and tell me where you stopped. The
attached reference + this prompt are enough to resume from any phase.
