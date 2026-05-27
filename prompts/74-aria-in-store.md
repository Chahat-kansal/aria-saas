# Prompt 74 — Aria In-Store: Customer-Facing Shop Assistant

## What this is
A QR code in the shop → customer scans → opens "Ask [Business]" on their phone.
Customer asks anything in plain language. Aria answers with REAL products, stock, prices.
Every question becomes a demand signal for the owner — especially "what did customers
ask for that we don't stock". This is Aria's flagship differentiator.

## Decisions already made (build exactly this)
- Form factor: QR code → customer's phone web page (no hardware cost for merchant)
- v1: text input (voice is a later add — leave a mic button stub, disabled, labelled "coming soon")
- v1 scope: Q&A + missed-demand tracking + loyalty signup

## Pre-edit checklist (MANDATORY)
1. `cat src/app/api/public/widget/chat/route.ts` — full read (the website chat — REUSE its logic)
2. Check DB: widget_configs, pos_customers (loyalty fields), pos_products, businesses
3. `cat src/app/dashboard/website-chat/page.tsx` — see how widget config works

## What to build

### 1. DB migrations (Supabase MCP first)
```sql
CREATE TABLE IF NOT EXISTS instore_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  started_at timestamptz DEFAULT now(),
  message_count integer DEFAULT 0,
  email_captured text,
  loyalty_signup boolean DEFAULT false
);
CREATE TABLE IF NOT EXISTS instore_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  session_id uuid REFERENCES instore_sessions(id),
  question text,
  answer text,
  product_mentioned text,
  was_in_stock boolean,
  is_missed_demand boolean DEFAULT false,
  demand_category text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instore_enabled boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS instore_greeting text;
```

### 2. The customer page — src/app/store/[business_id]/page.tsx
Public page (no auth). Mobile-first — customers open this on their phone.
- Loads business name, greeting, branding
- Clean chat UI matching the approved mockup: dark theme, forest green #2D5240 customer
  bubbles, sage #7FB897 accents, Fraunces italic for the business name header
- Text input + disabled mic button ("voice coming soon")
- Calls a new in-store chat endpoint
- After 2-3 exchanges, shows a soft loyalty prompt: "Pop in your email, earn rewards"
- Product recommendations render as small tappable cards (name + price) like the mockup
- Friendly, fast, feels like texting — not a corporate chatbot

### 3. In-store chat endpoint — src/app/api/public/instore/route.ts
POST. Reuse the website widget chat logic as the base, but:
- Loads ALL products with real stock status (in stock / low / unavailable)
- Loads business hours, specials, top sellers
- System prompt: "You are the in-store assistant for [business]. A customer is
  physically in the shop right now. Be warm, concise, helpful. Recommend real
  products. If asked for something not in stock or not sold, say so honestly and
  suggest the closest alternative."
- After answering, a SECOND lightweight Haiku call classifies the question:
  - product_mentioned (which product, if any)
  - was_in_stock (true/false)
  - is_missed_demand (did the customer ask for something the shop does NOT sell or
    has zero stock of?)
  - demand_category (e.g. "gluten-free", "vegan", "decaf")
- Saves every question to instore_questions
- Logs AI calls to aria_ai_calls
- Loyalty: if customer gives email, look up / create in pos_customers, link session

### 4. Owner dashboard page — src/app/dashboard/in-store/page.tsx
This is where the owner sees the value:
- Metric cards: questions answered, emails captured, items recommended, missed demand $
- "Aria spotted" insight banner — the big one: "14 customers asked for gluten-free —
  you don't stock any. ~$90 of demand walking out." (Haiku generates this from
  instore_questions where is_missed_demand = true, grouped by demand_category)
- "Most-asked this week" bar list — top question topics
- Recent questions feed — what customers actually asked
- Missed-demand estimate: count of missed-demand questions x rough avg item price
- A toggle to enable/disable Aria In-Store
- The QR code: generate a QR (use a lib or a QR API) pointing to
  ariaos.site/store/[business_id] — owner prints it and puts it on the counter

### 5. QR code + setup
On the in-store dashboard page:
- Show the QR code big, with a "Download QR" and "Download printable table card" button
- Printable card: nice layout — "Scan to ask us anything" + QR + business name
- Editable greeting message field

### 6. Wire into daily briefing
Add in-store demand signals into the daily briefing context:
- "Yesterday 6 customers asked for X you don't stock"
- The council should surface missed demand as a real opportunity

## Design
- Customer page: dark, warm, mobile-first, feels like a premium messaging app
- Financial Trust palette: #2D5240 forest, #7FB897 sage, Fraunces italic headings
- Owner page: matches existing dashboard pages
- The "Aria spotted" missed-demand banner is the hero element — make it prominent

## Privacy
- Customer page collects only what the customer volunteers (email for loyalty)
- No tracking, no requiring personal info to use it
- Clear: emails used only for that shop's loyalty

## Execution order
1. DB migrations via Supabase MCP
2. Build in-store chat endpoint (reuse widget chat logic)
3. Build customer page /store/[business_id]
4. Build owner dashboard /dashboard/in-store with QR
5. Wire missed-demand into daily briefing
6. npx tsc --noEmit — zero errors
7. npm run build — must pass
8. Single commit: "feat: Aria In-Store — QR shop assistant, real-time customer Q&A, missed-demand intelligence for owners"

## If limit runs low
Build the customer page + endpoint first (that is the core), commit, STOP.
The owner dashboard can be a follow-up. Never leave build broken.
