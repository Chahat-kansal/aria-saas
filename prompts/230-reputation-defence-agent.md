# Prompt 230 — Online Reputation Defence Agent
# What Birdeye charges $600+/month per location for. Includes AEO (Answer Engine Optimisation).
# ENV VARS NEEDED: GOOGLE_PLACES_API_KEY (already set ✅). No new env vars.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE
- src/lib/agents/base-agent.ts, types.ts, orchestrator.ts — DO NOT recreate
- DB: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()
- CONFIRMED AVAILABLE env vars: ANTHROPIC_API_KEY, RESEND_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, GOOGLE_PLACES_API_KEY, GOOGLE_CLIENT_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
- Open-Meteo weather API: FREE, no API key needed
- Basiq: check if BASIQ_API_KEY exists before using — it may not be set yet

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. Models: haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Monitors reviews 24/7. Auto-responds or queues for 1-click approval.
Detects review crises. Proactively requests reviews from recent customers.
Monitors whether the business appears in AI search engines (ChatGPT, Perplexity, Google AI Overview).
The AEO component (Answer Engine Optimisation) is a first-mover advantage — no SMB tool has it.

## TASK 1 — DB migrations  
Commit: "feat(reputation-agent): DB migrations — reputation tables"

```sql
-- Reviews unified across all platforms
CREATE TABLE IF NOT EXISTS business_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('google','facebook','yelp','tripadvisor','aria_community','productreview')),
  external_id text, -- platform-specific review ID
  reviewer_name text,
  reviewer_photo_url text,
  rating numeric NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  review_date timestamptz,
  
  -- Response tracking
  response_text text,
  response_drafted_by text DEFAULT 'agent', -- 'agent'|'owner'
  response_posted_at timestamptz,
  response_status text DEFAULT 'pending' CHECK (response_status IN ('pending','approved','posted','skipped')),
  
  -- Sentiment analysis
  sentiment text CHECK (sentiment IN ('positive','neutral','negative')),
  sentiment_score numeric, -- -1 to 1
  key_themes text[], -- extracted themes: ['wait_time','food_quality','staff','value']
  is_crisis boolean DEFAULT false, -- true if this review triggers crisis protocol
  
  -- Review request tracking
  customer_id uuid REFERENCES pos_customers(id) ON DELETE SET NULL,
  request_sent_at timestamptz,
  request_channel text CHECK (request_channel IN ('sms','email','none')),
  
  created_at timestamptz DEFAULT now(),
  UNIQUE(business_id, platform, external_id)
);
ALTER TABLE business_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_reviews" ON business_reviews
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON business_reviews (business_id, platform, review_date DESC);
CREATE INDEX ON business_reviews (business_id, rating, review_date DESC);
CREATE INDEX ON business_reviews (business_id, response_status);

-- AEO monitoring — tracks AI search engine appearances
CREATE TABLE IF NOT EXISTS aeo_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  checked_at timestamptz DEFAULT now(),
  query text NOT NULL, -- the search query tested
  engine text NOT NULL CHECK (engine IN ('perplexity','chatgpt_web','google_aio')),
  appeared boolean DEFAULT false,
  position integer, -- 1=first mentioned, NULL=not mentioned
  snippet text, -- what the AI said about the business
  competitor_names text[], -- competitors mentioned in the same response
  recommendations jsonb, -- what data is missing that would help AI cite us
  UNIQUE(business_id, engine, query, date_trunc('week', checked_at))
);
ALTER TABLE aeo_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_snapshots" ON aeo_snapshots
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON aeo_snapshots (business_id, checked_at DESC);

-- Review request campaigns
CREATE TABLE IF NOT EXISTS review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE SET NULL,
  sale_id uuid REFERENCES pos_sales(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('sms','email')),
  message_text text NOT NULL,
  google_review_link text,
  sent_at timestamptz DEFAULT now(),
  opened_at timestamptz,
  clicked_at timestamptz,
  review_received boolean DEFAULT false,
  review_id uuid REFERENCES business_reviews(id) ON DELETE SET NULL
);
ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_review_requests" ON review_requests
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — ReputationDefenceAgent class
Commit: "feat(reputation-agent): ReputationDefenceAgent — review monitoring + response drafting"

Create: src/lib/agents/reputation-defence-agent.ts
Extends BaseAgent. AgentType: 'reputation_defence'

```typescript
// run(business_id: string): Promise<AgentRunResult>

// STEP 1: SYNC NEW REVIEWS
// Google Places API (GOOGLE_PLACES_API_KEY already set):
//   GET https://maps.googleapis.com/maps/api/place/details/json?place_id={google_place_id}&fields=reviews&key={key}
//   google_place_id: fetch from businesses.google_place_id column (add if missing)
//   Sync any reviews not already in business_reviews
//
// Aria Community reviews: query community_posts WHERE type='review' AND target_business_id=business_id
//   (if community has review functionality)
//
// Facebook/Yelp: not yet integrated — mark as "connect your account" in settings

// STEP 2: SENTIMENT ANALYSIS + THEME EXTRACTION
// For each new review without sentiment:
//   Call haiku: "Analyse this review. Return JSON: { sentiment: positive|neutral|negative, score: -1to1, key_themes: string[], is_crisis: boolean }"
//   is_crisis = rating <= 2 AND contains specific crisis keywords (food safety, illness, discrimination, legal threat)

// STEP 3: DRAFT RESPONSES
// For each review with response_status='pending' AND rating <= 4 (not auto-skipping 5-star unless configured):
//   
//   Context for haiku:
//   - Business name, industry, owner's past response style (analyse last 10 posted responses)
//   - Reviewer name, rating, review text, key_themes
//   - For negative reviews: include recent improvements made to address the theme
//   
//   Haiku prompt: "You are drafting a review response for {business_name}, an Australian {industry}.
//     Reviewer {name} gave {rating} stars: "{review_text}"
//     Key themes: {themes}.
//     Write a response in 2-4 sentences that: uses the reviewer's first name, acknowledges their specific feedback,
//     doesn't make excuses, offers a path to resolution if negative, feels warm and personal not corporate.
//     Do not say 'valued customer' or 'we strive to'. Match this tone: {past_response_examples}"
//   
//   If rating <= 2 AND is_crisis = false: set response_status='pending' (owner must approve)
//   If rating >= 4: if mode=auto → post immediately, if mode=suggest → queue for approval
//   If is_crisis=true: NEVER auto-post. Alert owner. Suspend all auto-replies temporarily.
//   
//   Post response via Google Places API (requires OAuth — check if GOOGLE_CLIENT_ID is connected)
//   Or: show in dashboard for manual copy-paste with direct link to the review

// STEP 4: REVIEW VELOCITY MONITORING
// Count reviews in last 7 days vs prior 7 days (per platform)
// If negative reviews in last 24h >= 3: CRISIS ALERT
//   - Create intelligence_events row severity='critical'
//   - Suspend auto-reply mode
//   - Notify owner immediately via SMS (Twilio)
//   - Suggest: "Consider reaching out to these reviewers directly"
//
// If competitor_review_velocity (from competitor_snapshots) > own velocity:
//   Create AgentDecision: "You've received {N} reviews this week. Competitor {name} got {M}.
//     Send review requests to your last {X} customers to close the gap."

// STEP 5: PROACTIVE REVIEW REQUESTS
// For each pos_sale in the last 24h where:
//   customer has phone or email AND marketing_opt_in=true
//   AND no review_request sent in last 90 days for this customer
//   AND sale.total_amount > $15 (not a tiny transaction)
// 
// Send review request 2 hours after sale (configurable in agent_settings.config.request_delay_hours):
//   SMS via Twilio: "Hi {first_name}! Hope you enjoyed your visit to {business_name}.
//     Mind leaving us a quick Google review? It means a lot: {google_review_link} 🙏"
//   Or email via Resend if no phone
//   
//   google_review_link: f"https://g.page/{place_id}/review"
//   Insert review_request row
//   Log to aria_autopilot_actions

// STEP 6: LOG + SAVE DECISIONS
```

## TASK 3 — AEO Monitoring (Answer Engine Optimisation)
Commit: "feat(reputation-agent): AEO monitoring — tracks business in AI search engines"

Create: src/lib/agents/aeo-monitor.ts

```typescript
// Weekly AEO check via web search (Aria already has web search capability in API routes)
// For each business, test 5 queries:
// 1. "best {industry} in {suburb} {city}"
// 2. "{industry} near {suburb} open now"
// 3. "{business_name} {city} reviews"
// 4. "{industry} {city} recommendation"
// 5. "{industry} {suburb}"

// Use Claude's web search tool to check Perplexity and general AI search results
// Parse: did the business appear? What position? What did it say? Who else appeared?

// Generate recommendations via haiku:
// "This business did not appear in AI search for '{query}'. 
//  Based on their Google profile and reviews, what specific data is missing 
//  that would make AI tools recommend them? Return 3 specific action items."

// Store in aeo_snapshots

// Create a structured data checker:
// Check businesses table for: name, address, phone, hours, website, description, photos_count, review_count, avg_rating
// For each missing/incomplete field: add to recommendations
// E.g. "Your Google Business Profile has no photos. Adding 5+ photos increases AI citation probability by ~40%."
```

## TASK 4 — Review request cron
Commit: "feat(reputation-agent): review request cron every 2h + weekly AEO check"

Create: src/app/api/cron/reputation-requests/route.ts
Schedule: "0 */2 * * *" (every 2 hours — check if within vercel.json 22-cron limit)
- Runs STEPS 1-6 of ReputationDefenceAgent for all businesses
- Also: posts any 'approved' review responses (owner approved in dashboard)

Create: src/app/api/cron/aeo-weekly/route.ts  
Schedule: "0 21 * * 0" (Sunday 9am AEST)
- Runs aeo-monitor for all businesses

Note: if at 22-cron limit, merge reputation-requests into an existing 2h cron.

## TASK 5 — API routes + Dashboard
Commit: "feat(reputation-agent): dashboard — review feed, response queue, AEO score"

Create: src/app/api/agents/reputation/route.ts
GET: { reviews: [], stats: { avg_rating, total_reviews, pending_responses, this_week_count, competitor_velocity }, aeo_score }

Create: src/app/api/agents/reputation/respond/[id]/route.ts
POST: { action: 'approve'|'skip'|'edit', edited_text? } → posts response or marks skipped

Create: src/app/api/agents/reputation/request/route.ts  
POST: manually trigger review request for a specific customer_id

Dashboard section on agents page — "Reputation":

Rating overview: large average rating number + star display + total reviews + "This week: +{N}"
Platform breakdown: Google {rating} ({count}) | Facebook | Yelp (with connect buttons for unconnected)

Response queue (most urgent first):
- Review card: star rating + reviewer name + review text excerpt + sentiment badge
- AI drafted response preview (expandable)
- "Post this" button (auto-posts) | "Edit & post" | "Skip"
- For crises: red border, "⚠ Crisis detected — manual review required"

Review velocity chart: 30-day bar chart of reviews received per week
Competitor comparison: "You: {N} reviews this month. Nearest competitor: {M} reviews."

AEO Score section:
- Score 0-100: "Your AI search visibility: {score}/100"
- Queries where you appear: green checkmarks
- Queries where you don't appear: red X with specific recommendation
- "What to fix": ordered list of recommendations by impact

Review requests: sent / opened / clicked / reviews received rates (funnel)

## COMPLETION CHECKLIST
- [ ] 3 new tables with RLS + indexes
- [ ] Google Places review sync working
- [ ] Sentiment analysis + theme extraction via haiku
- [ ] Response drafting using owner's past response style
- [ ] Crisis detection (3+ negatives in 24h → SMS alert)
- [ ] Proactive review requests via Twilio SMS
- [ ] Never auto-posts on negative or crisis reviews
- [ ] AEO monitoring with 5 test queries weekly
- [ ] AEO recommendations generated by haiku
- [ ] Cron running every 2h for review checks
- [ ] Dashboard: rating overview, response queue, AEO score
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.
