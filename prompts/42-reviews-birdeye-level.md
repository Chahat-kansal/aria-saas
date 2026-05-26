# Prompt 42 — Reviews: Birdeye-Level Pro Upgrade

## Why this exists
Birdeye in 2026 ships: multi-platform aggregation (Google + Facebook + Yelp), real-time sentiment tracking, Competitors AI benchmarking, crisis alerts for negative review spikes, NPS surveys, automated review requests. Aria must match this.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/reviews/page.tsx` — full read (35KB)
2. `cat src/app/api/aria/reviews/route.ts` — full read
3. `cat src/app/api/reviews/analytics/route.ts` — full read
4. `cat src/app/api/aria/reviews/reputation/route.ts` — full read
5. Check DB: `pos_reviews` OR `business_reviews` table columns via Supabase MCP
6. Check: `businesses` table has `google_place_id`, `facebook_page_id`? Check via Supabase MCP
7. `cat src/app/api/settings/business/route.ts` — check what fields it saves

## Features to build — every single one, no stubs

### 1. Multi-platform review aggregation
Currently: Google only.
Add Facebook and Yelp import capability.
Since direct API access requires partnership approval, build smart import:
- **Google**: already working via `google_place_id`
- **Facebook**: owner pastes their Facebook Page URL in settings → Aria extracts Page ID → uses Facebook Graph API `/{page-id}/ratings` (public endpoint, no auth needed for public pages)
- **Yelp**: owner pastes Yelp business URL → store in `businesses.yelp_url` → use Yelp Fusion API (requires `YELP_API_KEY` env var — check if exists, add placeholder if not)
- **Fallback**: if API not available, show "Import reviews" — owner pastes CSV export from each platform

Add to settings page: "Review platforms" section with Google/Facebook/Yelp URL fields.
Add columns to businesses table:
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS facebook_page_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS yelp_business_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS yelp_url text;
```
Store reviews with `platform` column in `pos_reviews` (add if missing):
```sql
ALTER TABLE pos_reviews ADD COLUMN IF NOT EXISTS platform text DEFAULT 'google';
```

### 2. Real-time sentiment tracking with crisis alerts
Calculate sentiment score per review: 5★=positive, 4★=neutral, 1-2★=negative.
Track rolling 7-day average sentiment.
**Crisis alert**: if 3+ negative reviews (1-2★) arrive in any 24-hour window:
- Create `aria_actions` record with priority=critical
- Send SMS alert to `businesses.owner_phone` via Twilio: "⚠️ Aria alert: 3 negative reviews in 24hrs for [business]. Check your reviews dashboard."
- Show red banner at top of reviews page: "Crisis detected — 3 negative reviews in last 24hrs"
Store crisis events in `review_crises` table:
```sql
CREATE TABLE IF NOT EXISTS review_crises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  detected_at timestamptz DEFAULT now(),
  negative_count integer,
  avg_rating numeric,
  resolved_at timestamptz,
  is_resolved boolean DEFAULT false
);
```

### 3. Competitors AI (benchmark against local competitors)
Pull competitor names from `aria_competitor_watches` for this business.
For each competitor: search Google Places API for their place_id → fetch their rating + review count.
Show comparison table:
| Business | Rating | Reviews | Trend |
|----------|--------|---------|-------|
| Your Business | 4.6 ⭐ | 234 | ↑ |
| Dan Murphy's | 4.2 ⭐ | 1,203 | → |
| BWS | 3.9 ⭐ | 445 | ↓ |
Below table: "What competitors' customers complain about that yours don't" — AI analysis of competitor review text patterns.
Call `/api/aria/competitor-review-analysis` — build this route.
Uses Claude Haiku: given competitor ratings + your reviews, identify your competitive advantages.

### 4. NPS survey system
New "Surveys" tab.
NPS question: "How likely are you to recommend [business] to a friend? (0-10)"
Send via SMS after purchase: automatically triggered 2 hours after a `pos_sale` is recorded.
Store responses in `nps_responses` table:
```sql
CREATE TABLE IF NOT EXISTS nps_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  customer_id uuid REFERENCES pos_customers(id),
  sale_id uuid REFERENCES pos_sales(id),
  score integer CHECK (score >= 0 AND score <= 10),
  comment text,
  responded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
```
NPS score = % Promoters (9-10) - % Detractors (0-6)
Display: large NPS score gauge + breakdown: Promoters X% | Passives Y% | Detractors Z%
SMS survey delivery: use existing Twilio. Reply with number 0-10.
Build simple response webhook: `/api/webhooks/nps-response` — parses Twilio SMS reply, stores score.

### 5. Automated review requests (post-purchase)
Currently: manual send from page.
Make it automatic: 2 hours after `pos_sale`, if customer has phone AND hasn't been sent a review request in last 90 days:
- Send SMS: "Hi [name], thanks for visiting [business] today! We'd love your feedback — [google_review_link] Takes 30 seconds 🙏"
- Store `review_request_sent_at` on `pos_customers`
Toggle in reviews page: "Auto review requests: ON/OFF" (stored in `businesses.auto_review_requests`)
Show stats: "Sent 47 requests this month → 12 new reviews (25.5% conversion)"

### 6. Sentiment timeline + keyword analysis
Already partially in prompt 36 — ensure these are included:
- Line chart: average rating per week, 12 weeks
- Top positive words vs negative words (horizontal bar chart)
- Both charts update when platform filter changes (Google/Facebook/Yelp/All)

## DB migrations
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS facebook_page_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS yelp_url text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS auto_review_requests boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS google_review_link text;
ALTER TABLE pos_reviews ADD COLUMN IF NOT EXISTS platform text DEFAULT 'google';
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;
CREATE TABLE IF NOT EXISTS review_crises ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid REFERENCES businesses(id), detected_at timestamptz DEFAULT now(), negative_count integer, avg_rating numeric, resolved_at timestamptz, is_resolved boolean DEFAULT false );
CREATE TABLE IF NOT EXISTS nps_responses ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid REFERENCES businesses(id), customer_id uuid REFERENCES pos_customers(id), sale_id uuid REFERENCES pos_sales(id), score integer CHECK (score >= 0 AND score <= 10), comment text, responded_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now() );
```

## Routes to build
- `src/app/api/aria/competitor-review-analysis/route.ts` — NEW
- `src/app/api/webhooks/nps-response/route.ts` — NEW (Twilio webhook, no auth)

## Execution order
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build new API routes
4. Rewrite `src/app/dashboard/reviews/page.tsx` — full pro UI with tabs: Reviews | Competitors | Surveys | Settings
5. `npx tsc --noEmit` — fix ALL TS errors, zero tolerance
6. `npm run build` — must pass clean
7. `git add -A && git commit -m "feat: reviews — multi-platform, crisis alerts, Competitors AI, NPS surveys, auto review requests" && git push`
