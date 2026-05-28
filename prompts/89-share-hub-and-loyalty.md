# Prompt 89 — Customer hub page + share toolkit + loyalty config + Customer Inbox

## Three real gaps this fixes
1. **Multiple customer URLs** — bookings, loyalty, community, reviews, ordering
   currently each have their own URL. Owners have to remember 5 URLs and pick
   the right one to share. Customers get confused.
2. **Loyalty platform is plumbed but unconfigured** — pos_loyalty_config is
   empty for every business. Customers can technically sign up but nothing
   happens because no program is configured.
3. **Customer data is being collected but not surfaced** — kiosk conversations,
   demand signals, marketplace chats, search queries, talk-to-staff messages,
   thumbs-up/down feedback. ALL of it lands in DB tables but the owner has
   NOWHERE to read it. This is the single biggest miss — these conversations
   ARE the product value.

## TASK 1 — Single Customer Hub Page at /{slug}

### URL design
- `ariaos.site/{slug}` — the unified customer hub for a business (e.g. ariaos.site/Sip)
- `ariaos.site/in-store/{slug}` — kiosk (kept separate, different intent)

The hub is one page the customer lands on. From there they pick what they want:
loyalty, booking, community, reviews, ordering. One URL replaces five.

### Build steps

1. **New route**: `src/app/[slug]/page.tsx`
   - This is a CATCH-ALL route. Must be carefully placed so it doesn't collide
     with existing top-level routes (dashboard, pos, community, in-store, login,
     etc.). Use a Next.js `(public)` route group if needed.
   - Lookup logic: find `businesses` where lowercase(name) = slug OR a new
     `businesses.slug` column matches.
   - Add `businesses.slug text UNIQUE` column if missing, backfill from name
     (lowercase, alphanumeric, hyphens).

2. **Page layout** (light theme, Pipel design system from prompt 83):
   - Top: business hero — logo, name (Fraunces italic for personality), city,
     small bio, verified tick if applicable
   - 3-6 large tappable cards (which ones depend on what the business has
     enabled — only show cards for features they offer):
     - "Join loyalty" → /loyalty/{slug}
     - "Book a table/appointment" → /book/{slug}
     - "Follow on Aria Community" → /community/businesses/{slug}
     - "Leave a review" → opens Google review link if configured
     - "Order online" → /order/{slug} (only if business has online ordering)
     - "Visit our website" → external link (uses businesses.website)
   - Footer: powered by Aria + small "report this page" link

3. **DB**:
   ```sql
   ALTER TABLE businesses
     ADD COLUMN IF NOT EXISTS slug text UNIQUE,
     ADD COLUMN IF NOT EXISTS hub_visible_features jsonb DEFAULT '["loyalty","booking","community","review","website"]';
   
   UPDATE businesses
     SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
     WHERE slug IS NULL;
   ```

4. **Tracking**: when a customer lands on /{slug}, log to a new table for the
   owner to see what's being clicked:
   ```sql
   CREATE TABLE IF NOT EXISTS customer_hub_clicks (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
     visitor_id text,
     target text,  -- 'loyalty' / 'booking' / 'community' / 'review' / 'website' / 'order' / 'hub_view'
     referrer text,
     user_agent text,
     created_at timestamptz DEFAULT now()
   );
   ALTER TABLE customer_hub_clicks ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "hub_clicks_owner_read" ON customer_hub_clicks
     FOR SELECT TO authenticated
     USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
   CREATE POLICY "hub_clicks_anon_insert" ON customer_hub_clicks
     FOR INSERT TO anon WITH CHECK (true);
   ```

### Commit
"feat(hub): unified customer hub at /{slug} — single URL replaces five customer-facing links"

## TASK 2 — Owner Share Hub at /dashboard/share

### Purpose
ONE central page where the owner generates:
- **The unified customer hub URL + QR code** (just ariaos.site/{slug} — the BIG one)
- **The in-store kiosk QR code** (separate because different intent)

That's it. Two URLs, two QR codes. Stop trying to surface 6 different things.

### Layout
- Top card: "Your customer hub" — big URL, copy button, download QR PNG button,
  download A5 poster PDF button, "Where to put this:" hint listing concrete
  ideas (receipt footer, Instagram bio, Google Business profile, email signature)
- Second card: "Your in-store kiosk" — separate URL, QR, A5 poster
- Bottom strip: hub-click analytics — "X visits last 7 days, top-clicked card:
  loyalty" — pulled from customer_hub_clicks table

### Sidebar
Add "Share" under the "Customer Surfaces" section from prompt 83. Lucide
icon: `qr-code`.

### QR generation
Reuse the existing kiosk QR generator. 1200x1200 PNG, embed business logo if
business.logo_url is present, A5 PDF poster with QR + business name + clear
call-to-action.

### Commit
"feat(share): owner dashboard share page with hub QR + kiosk QR + click analytics"

## TASK 3 — Customer Inbox: where the owner reads everything

**This is the most important task in this prompt.** Without this, the kiosk
and community generate nothing but data exhaust.

### New page: /dashboard/inbox

ONE central inbox showing every customer interaction:

**Streams to merge into the inbox** (single timeline view, sorted by most recent):
- `instore_conversations` — every kiosk chat session (customer's questions +
  Aria's replies)
- `instore_demand_signals` — "14 customers asked for gluten-free this week"
- `instore_recommendation_feedback` — thumbs up/down on Aria's recommendations
  with the product and the question that led to it
- `marketplace_chats` — every customer-to-owner conversation, ordered by unread first
- `community_message_reports` — flagged messages (from prompt 83's abuse guard)
- `customer_hub_clicks` — what cards customers are tapping on the hub
- `community_blocked_visitors` — when a visitor was blocked
- Talk-to-staff requests from the kiosk (aria_autopilot_actions with
  category='kiosk_help_request' from prompt 81)

### Page design (light theme, Pipel system)
- Left: list of items, newest first, with type icon + 1-line summary
  - "💬 Kiosk chat · Customer asked about oat milk · 2h ago"
  - "🛍️ Marketplace · 'Is the Shiraz still available?' · 5h ago · 2 unread"
  - "📈 Demand signal · 14 customers asked for gluten-free this week"
  - "👍 Feedback · 6 customers ❤️ the Ethiopian beans"
  - "⚠️ Reported message · flagged by abuse guard · review needed"
- Right: detail panel for the selected item — full conversation, with a
  "Reply" box if it's a chat the owner can respond to (marketplace + talk-to-staff)
- Top filter chips: All / Unread / Messages / Demand / Feedback / Flagged
- Each item is marked read when opened

### Aria intelligence layer on top
- A summary card at the top: "Aria's weekly read" — Haiku summarises:
  - Top 3 things customers asked for that you don't sell
  - Most-loved product (by thumbs-up)
  - Most-disliked product (by thumbs-down) — needs attention?
  - Repeated unanswered questions — should add to FAQ
  - Sentiment trend (improving / stable / declining)
- This becomes the strongest selling point of the product: "Aria reads every
  customer interaction and tells you the 3 things to act on this week."

### DB
- Need a unified `customer_interactions_v` view OR a dispatcher API route that
  fetches each source and merges. View is cheaper. Create:
  ```sql
  CREATE OR REPLACE VIEW customer_interactions_v AS
  SELECT
    'kiosk_chat' as source,
    id, business_id, NULL::text as customer_identifier,
    LEFT(messages::text, 100) as preview,
    created_at, false as has_unread
  FROM instore_conversations
  UNION ALL
  SELECT
    'marketplace_chat' as source,
    id, business_id, member_id::text as customer_identifier,
    LEFT(last_message::text, 100) as preview,
    last_message_at as created_at, unread_for_owner as has_unread
  FROM marketplace_chats
  UNION ALL
  SELECT
    'demand_signal' as source,
    id, business_id, NULL,
    signal_text as preview,
    created_at, false
  FROM instore_demand_signals
  UNION ALL
  SELECT
    'feedback' as source,
    id, business_id, visitor_id,
    reaction || ' on ' || COALESCE(context_query, 'product'),
    created_at, false
  FROM instore_recommendation_feedback;
  ```
  
  (Field names approximate — match real schema, do not invent columns.)

### Sidebar
Add "Customer inbox" near the TOP of the dashboard sidebar — this is the
owner's most important daily check-in. Lucide icon: `inbox`. Show a small
unread count badge.

### Daily briefing
Include the inbox summary in the daily briefing — "you have N unread customer
messages, 3 new demand signals worth flagging."

### Commits
- "feat(inbox): customer_interactions_v unified view + inbox API"
- "feat(inbox): /dashboard/inbox page with unified timeline + detail panel"
- "feat(inbox): Aria weekly summary card + briefing integration"

## TASK 4 — Owner-facing loyalty program configuration

Same as the original Task 2 of the earlier draft (configure points per dollar,
signup bonus, tiers, auto-enrol, SMS preferences). Keep the original spec —
not duplicating here. Run AFTER the inbox so customers have somewhere to land
once the program is configured.

### Commit
"feat(loyalty): owner configuration page + auto-enrol + auto-award points + tier rewards"

## TASK 5 — Customer-facing /loyalty/{slug} polish

Same as before — match Pipel design, simple signup form, points balance check,
tier visualisation.

### Commit
"feat(loyalty-public): polished customer-facing signup + points-check experience"

## TASK 6 — Aria intelligence for loyalty (briefing + dashboard banner)

Same as before. After the Customer Inbox lands, this is just adding loyalty
counters into the briefing.

### Commit
"feat(loyalty-intel): briefing + weekly report + dashboard banner include loyalty stats"

## RULES
- Each task is its own commit
- npx tsc --noEmit + npm run build pass before each commit  
- After all commits: git push origin main
- Customer-facing pages match the locked Pipel design from prompt 83
- Reuse the existing kiosk QR generator
- The Customer Inbox is the most important deliverable in this prompt — do not
  skip or down-scope it

## PRIORITY ORDER (if limit runs low)
1. **Task 3 — Customer Inbox** — single biggest product value, the conversation
   data is wasted without it
2. Task 1 — Customer hub at /{slug}
3. Task 2 — Owner share page
4. Task 4 — Loyalty config
5. Task 5 — Loyalty public page polish
6. Task 6 — Loyalty intelligence

Finish current commit, push, STOP, report.
