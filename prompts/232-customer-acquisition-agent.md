# Prompt 232 — Customer Acquisition Agent (Answer Engine Optimisation)
# First-mover advantage — no SMB tool has AEO built in. Completely new category.
# NO NEW ENV VARS — uses GOOGLE_PLACES_API_KEY + ANTHROPIC_API_KEY (both set ✅).

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
Monitors whether the business appears when customers ask AI tools (ChatGPT, Perplexity,
Google AI Overview) for recommendations. Identifies exactly what data is missing.
Automatically fixes what it can. Tracks AI search market share vs competitors.
This is Answer Engine Optimisation (AEO) — the evolution beyond SEO.

NOTE: The AEO monitoring piece is also partially covered in Prompt 230 (Reputation).
This prompt builds the ACQUISITION side — not just monitoring, but active optimisation
and content generation specifically designed to be cited by AI engines.

## TASK 1 — DB migrations
Commit: "feat(aeo-agent): DB migrations — aeo_profiles + content_optimisation tables"

```sql
-- Business AEO profile — what AI engines know about this business
CREATE TABLE IF NOT EXISTS business_aeo_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  
  -- Completeness scores (0-100 per source)
  google_business_score integer DEFAULT 0, -- % of GBP fields filled
  structured_data_score integer DEFAULT 0, -- schema.org markup on website
  review_velocity_score integer DEFAULT 0, -- review count + recency
  content_freshness_score integer DEFAULT 0, -- recent posts, updates
  overall_aeo_score integer DEFAULT 0, -- weighted average
  
  -- What AI engines currently know
  known_name text,
  known_address text,
  known_hours jsonb, -- { monday: "7am-5pm", ... }
  known_phone text,
  known_website text,
  known_categories text[],
  known_menu_items text[], -- top items AI tools mention
  known_price_range text, -- "$", "$$", "$$$"
  known_parking boolean,
  known_wifi boolean,
  
  -- Gaps (what's missing that would help)
  missing_fields text[],
  improvement_recommendations jsonb, -- [{field, impact, action, priority}]
  
  -- AI search appearance tracking
  appearance_rate_7d numeric DEFAULT 0, -- % of test queries where we appear
  competitor_appearance_rate_7d numeric DEFAULT 0,
  
  last_updated timestamptz DEFAULT now(),
  UNIQUE(business_id)
);
ALTER TABLE business_aeo_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_profiles" ON business_aeo_profiles
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

-- AEO-optimised content pieces (designed to be cited by AI)
CREATE TABLE IF NOT EXISTS aeo_content_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  content_type text NOT NULL CHECK (content_type IN (
    'faq_entry',        -- Q&A specifically written to answer AI queries
    'google_post',      -- Google Business Profile post
    'community_post',   -- Aria Community post
    'menu_description', -- Rich product/menu descriptions
    'business_description' -- Updated business description
  )),
  title text NOT NULL,
  content text NOT NULL,
  target_queries text[], -- what search queries this content helps with
  published_at timestamptz,
  published_to text[], -- where it was posted: ['google','community','website']
  created_by text DEFAULT 'agent',
  performance_appearances integer DEFAULT 0, -- times business appeared after publishing
  created_at timestamptz DEFAULT now()
);
ALTER TABLE aeo_content_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_aeo_content" ON aeo_content_pieces
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — CustomerAcquisitionAgent class
Commit: "feat(aeo-agent): CustomerAcquisitionAgent — AEO scoring + gap analysis + content generation"

Create: src/lib/agents/customer-acquisition-agent.ts
Extends BaseAgent. AgentType: 'customer_acquisition'

```typescript
// run(business_id: string): Promise<AgentRunResult>

// STEP 1: BUILD/UPDATE AEO PROFILE
// Pull from businesses table: name, address, phone, website, industry, abn, description
// Pull from Google Places API (GOOGLE_PLACES_API_KEY):
//   GET details: name, opening_hours, formatted_phone, website, price_level, rating, user_ratings_total, photos
// 
// Score each dimension 0-100:
// google_business_score:
//   name: +10, address: +10, phone: +10, website: +10
//   hours: +15 (all 7 days filled), photos count: +1 per photo up to 15
//   description: +10, categories: +10, recent post (< 7 days): +10
//
// review_velocity_score:
//   rating > 4.0: +30, total_reviews > 50: +20, total > 100: +30, response rate > 80%: +20
//
// content_freshness_score:
//   google_post in last 7 days: +30, last 30 days: +20
//   community_post in last 7 days: +20
//   product descriptions updated in last 90 days: +30
//
// overall_aeo_score = (google_score * 0.4) + (review_score * 0.35) + (content_score * 0.25)

// STEP 2: GAP ANALYSIS via Sonnet
// Build context: current scores, missing fields, competitor data
// Prompt sonnet: "You are an AEO (Answer Engine Optimisation) expert. This Australian {industry}
//   has an AEO score of {score}/100. Missing: {missing_fields}.
//   What are the top 5 specific improvements, in priority order, that would most increase
//   their visibility in ChatGPT, Perplexity, and Google AI answers?
//   For each: what to fix, expected impact (high/medium/low), effort (minutes/hours/days).
//   Return JSON: { recommendations: [{field, action, impact, effort, priority}] }"
// Store in business_aeo_profiles.improvement_recommendations

// STEP 3: AUTO-FIX WHAT WE CAN
// Things the agent can fix automatically (if mode=auto):
// a) Business description: if missing or < 150 chars:
//    Generate via haiku: "Write a 200-word description for {business_name}, an {industry} in {suburb}.
//    Highlight: {top_products}, {unique_qualities}. Write in second person addressing the business.
//    Include natural mentions of suburb, opening hours, and what makes them special.
//    This description will be used by AI search engines — make it factual and specific."
//    → Post to Google Business Profile via Places API
//    → Update businesses.description column
// b) FAQ content: generate 5 Q&A pairs that answer common AI queries:
//    "What time does {name} open?" "Is {name} good for families?" "What does {name} serve?"
//    → Create aeo_content_pieces of type 'faq_entry'
// c) Menu descriptions: for top 10 products with descriptions < 50 chars:
//    Generate rich descriptions via haiku
//    → PATCH pos_products.description

// STEP 4: AEO CONTENT GENERATION (weekly)
// Generate 1 Google Post and 1 Community Post specifically designed for AI citation:
// Formula: answer a specific question in the first sentence, include location + hours + price
// Example: "Sip Cafe in Prahran is open Monday to Friday 7am-4pm. 
//   Known for their single-origin pour-overs ($6) and almond croissants baked fresh daily.
//   Located at 142 Chapel St with street parking available."
// → Create aeo_content_pieces + optionally auto-post to community (not Google without manual approval)

// STEP 5: COMPETITOR AEO COMPARISON
// For each competitor in competitor_snapshots:
//   Pull their Google Places data (name, rating, review_count, photo_count)
//   Compute their estimated AEO score using same formula
//   Compare: where are they stronger? Where are we stronger?
//   Generate: "Your main competitor has 2x more photos and posts weekly. 
//     Improving these two things would close most of the visibility gap."

// STEP 6: SAVE DECISIONS
// Submit top 3 recommendations as AgentDecisions for council
```

## TASK 3 — Weekly cron + API routes
Commit: "feat(aeo-agent): cron + API routes"

Schedule: "0 21 * * 1" (Monday 9am AEST — merge into existing Monday cron if possible)

Create: src/app/api/agents/acquisition/profile/route.ts
GET: business_aeo_profiles + aeo_content_pieces for business

Create: src/app/api/agents/acquisition/content/route.ts
GET: all aeo_content_pieces
POST: manually trigger content generation for a specific type
PATCH /{id}: { published_to: string[], published_at }

Create: src/app/api/agents/acquisition/run/route.ts
POST: trigger CustomerAcquisitionAgent immediately for business

## TASK 4 — Dashboard section
Commit: "feat(aeo-agent): AEO dashboard — score, recommendations, content queue"

"Customer Acquisition" section on agents page:

AEO Score gauge (0-100): large circular gauge, colour-coded
- 0-40: red "Low visibility"
- 40-70: amber "Moderate"
- 70-100: green "High visibility"

Score breakdown bars: Google profile {score}/40 | Reviews {score}/35 | Content {score}/25

Top recommendations: ordered list with priority badges and effort indicators
- "Add 5+ photos to Google Business (High impact, 10 minutes)"
- "Post weekly Google updates (High impact, ongoing)"
- Each with "Fix now" button that either auto-fixes or opens Google Business Profile

Content queue: aeo_content_pieces pending publishing
- Show content text + target queries
- "Post to Community" button → POST /api/community/posts
- "Copy for Google" → copies to clipboard with link to GBP

Competitor comparison: side-by-side score comparison with nearest competitor
- "You: 67/100. Nearest competitor: 74/100. Gap: reviews and posting frequency."

AI search test results: (from aeo_snapshots in Prompt 230 if that's built):
- Grid of test queries with ✅/❌ appearance indicators
- Last tested timestamp

## COMPLETION CHECKLIST
- [ ] 2 new tables with RLS + indexes
- [ ] CustomerAcquisitionAgent: AEO scoring working
- [ ] Gap analysis via Sonnet with actionable recommendations
- [ ] Auto-fix: description generation + FAQ content + product descriptions
- [ ] Weekly AEO content generation (Google Post + Community Post)
- [ ] Competitor AEO comparison
- [ ] Weekly cron running Monday morning AEST
- [ ] Dashboard: score gauge, recommendations, content queue
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.
