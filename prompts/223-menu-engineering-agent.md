# Prompt 223 — Autonomous Menu/Product Engineering Agent
# What Deliverect charges enterprise restaurants (Burger King, KFC) for.
# NO NEW ENV VARS needed. Uses existing Supabase + Anthropic.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria palette (#2D5240 + #7FB897).

## EXISTING INFRASTRUCTURE
Read src/lib/agents/base-agent.ts, types.ts, orchestrator.ts before starting.
Extend AgentType in types.ts to include 'menu_engineering'.

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. haiku for scoring, no AI needed for grid reorder.
State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Runs every 4 hours. Scores every active product using:
  (velocity_vs_avg × 0.40) + (margin_score × 0.35) + (halo_score × 0.25) = composite_score
Classifies into BCG matrix (Star/Plowhouse/Puzzle/Dog).
Autonomously: reorders POS grid, wires upsell suggestions, creates bundles,
hides underperformers, activates time-of-day modes (Peak/Quiet/Margin-Max).
Measures actual revenue impact of every change and refines its own scoring weights.

## TASK 1 — DB migrations
Commit: "feat(menu-agent): DB migrations — product_performance_scores + menu_engineering_actions"

```sql
-- Product scores rebuilt every 4 hours
CREATE TABLE IF NOT EXISTS product_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  scored_at timestamptz DEFAULT now(),
  period_hours integer DEFAULT 4,

  -- Velocity: how fast is it selling vs normal?
  units_sold_this_period numeric DEFAULT 0,
  units_sold_baseline_same_period numeric DEFAULT 0, -- 30d same time window average
  velocity_vs_avg numeric DEFAULT 1.0, -- 1.0=normal, 1.5=50% above, 0.5=50% below

  -- Margin metrics
  margin_pct numeric DEFAULT 0, -- gross margin as percentage
  margin_dollars_per_unit numeric DEFAULT 0,
  margin_score numeric DEFAULT 0.5, -- 0-1 normalised: this product's margin / max margin in business

  -- Halo effect: does buying this correlate with buying other high-margin items?
  halo_score numeric DEFAULT 0, -- 0-1: 0=no effect, 1=strongly pulls high-margin purchases
  halo_products uuid[], -- top 3 product IDs co-purchased with this product
  halo_avg_copur_margin numeric DEFAULT 0, -- avg margin of co-purchased products

  -- Composite score: the ranking key
  composite_score numeric DEFAULT 0, -- weighted combination, range 0-2

  -- BCG matrix classification
  performance_tier text DEFAULT 'normal' CHECK (performance_tier IN
    ('star','plowhouse','puzzle','dog','normal')),
  -- star: high velocity + high margin → promote + wire upsells
  -- plowhouse: high velocity + low margin → consider price nudge
  -- puzzle: low velocity + high margin → needs promotion to sell more
  -- dog: low velocity + low margin → hide or bundle to clear stock

  -- Recommendations generated from the score
  recommended_grid_position integer, -- 1=top-left, higher=further
  recommended_upsell_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  recommended_bundle_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  recommended_bundle_price numeric,

  -- Learning: was this recommendation good?
  revenue_4h_before_change numeric DEFAULT 0,
  revenue_4h_after_change numeric DEFAULT 0,
  recommendation_outcome text CHECK (recommendation_outcome IN ('positive','negative','neutral','unmeasured')),

  UNIQUE(business_id, product_id, date_trunc('hour', scored_at))
);
ALTER TABLE product_performance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_product_scores" ON product_performance_scores
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON product_performance_scores (business_id, scored_at DESC);
CREATE INDEX ON product_performance_scores (business_id, composite_score DESC);
CREATE INDEX ON product_performance_scores (business_id, performance_tier);

-- Every action the agent takes is logged here for the learning loop
CREATE TABLE IF NOT EXISTS menu_engineering_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'reorder_grid','hide_product','show_product',
    'activate_bundle','deactivate_bundle','set_upsell','remove_upsell',
    'activate_peak_mode','activate_quiet_mode','activate_margin_mode','restore_normal_mode'
  )),
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  previous_state jsonb, -- what the value was before
  new_state jsonb,      -- what it was changed to
  reasoning text,       -- why (e.g. "velocity 0.3x avg, BCG=dog, hiding to reduce confusion")
  revenue_impact_actual numeric, -- filled in by the learning loop 4h later
  executed_at timestamptz DEFAULT now(),
  reverted_at timestamptz, -- if the owner manually reverted it
  agent_run_id uuid
);
ALTER TABLE menu_engineering_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_menu_actions" ON menu_engineering_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON menu_engineering_actions (business_id, executed_at DESC);
CREATE INDEX ON menu_engineering_actions (business_id, action_type, executed_at DESC);

-- New columns on pos_products for agent control
-- Read the actual pos_products columns first to avoid duplicates
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS grid_position integer;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_hidden boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_upsell_product_id uuid
  REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_product_id uuid
  REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_price numeric;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS performance_tier text DEFAULT 'normal'
  CHECK (performance_tier IN ('star','plowhouse','puzzle','dog','normal'));
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS last_scored_at timestamptz;
```

## TASK 2 — MenuEngineeringAgent class
Commit: "feat(menu-agent): MenuEngineeringAgent — 11-step BCG scoring + grid optimiser + learning"

Create: src/lib/agents/menu-engineering-agent.ts
Add 'menu_engineering' to AgentType in types.ts
Extends BaseAgent.

```typescript
export class MenuEngineeringAgent extends BaseAgent {
  type: AgentType = 'menu_engineering'

  async run(business_id: string): Promise<AgentRunResult> {
    // STEP 1: FETCH PRODUCTS AND SALES DATA
    // Get all active pos_products for business with category info
    // Get pos_sale_items from last 4 hours (current period)
    // Get pos_sale_items from last 30 days for baseline
    // Get pos_sale_items for halo analysis (last 14 days, need sale_id + product_id pairs)

    // STEP 2: VELOCITY SCORING PER PRODUCT
    // For each product:
    //   units_sold_this_period = SUM(quantity) from pos_sale_items
    //     WHERE product_id=X AND created_at > now()-4h
    //   For baseline: find the same 4-hour window across last 30 days
    //     e.g. if current period is 2-6pm, look at all 2-6pm windows in last 30 days
    //     baseline = AVG of 28 such windows (4 per week × 7 weeks, excluding today)
    //   velocity_vs_avg = units_sold_this_period / NULLIF(baseline, 0)
    //   If baseline = 0 AND units > 0: velocity_vs_avg = 2.0 (new hot product)
    //   If no sales at all: velocity_vs_avg = 0

    // STEP 3: MARGIN SCORING
    // For each product: margin_pct = product.margin_pct OR
    //   (product.price - product.cost_price) / product.price * 100 if margin_pct is null
    // margin_dollars_per_unit = product.price * (margin_pct / 100)
    // max_margin_in_business = MAX(margin_pct) across all active products
    // margin_score = margin_pct / NULLIF(max_margin_in_business, 0)
    // Clamp to [0, 1]

    // STEP 4: HALO EFFECT SCORING
    // For each product X, find all sales where X was purchased:
    //   get_sale_ids = pos_sale_items WHERE product_id=X AND created_at > now()-14d → sale_ids[]
    // Then find all OTHER products in those same sale_ids:
    //   co_purchased = pos_sale_items WHERE sale_id IN get_sale_ids AND product_id != X
    // Group co_purchased by product_id, get frequency and avg margin of each
    // halo_products = top 3 co_purchased product_ids by frequency
    // halo_avg_copur_margin = WEIGHTED AVG(margin_pct of co_purchased products, weighted by frequency)
    // business_avg_margin = AVG(margin_pct) across all active products
    // halo_score = halo_avg_copur_margin / NULLIF(business_avg_margin, 0) - 1
    //   positive = buying this product pulls above-average margin purchases
    //   negative = buying this pulls low-margin purchases
    // Clamp halo_score to [0, 1] (we only care about positive halo)

    // STEP 5: COMPOSITE SCORE + BCG CLASSIFICATION
    // composite_score = (velocity_vs_avg * 0.40) + (margin_score * 0.35) + (halo_score * 0.25)
    // Note: composite range is roughly 0-2 (velocity can exceed 1 for above-average products)
    //
    // Check agent_settings.config for custom weights — owner can tune these:
    //   velocity_weight: default 0.40
    //   margin_weight: default 0.35
    //   halo_weight: default 0.25
    //   (these adapt via the learning loop in STEP 11)
    //
    // BCG MATRIX THRESHOLDS (configurable in agent_settings.config):
    //   star:      velocity_vs_avg > 1.2  AND margin_score > 0.6
    //   plowhouse: velocity_vs_avg > 1.2  AND margin_score <= 0.4
    //   puzzle:    velocity_vs_avg <= 0.8 AND margin_score > 0.6
    //   dog:       velocity_vs_avg <= 0.8 AND margin_score <= 0.4
    //   normal:    everything else (middle ground)

    // STEP 6: GRID POSITIONING
    // Sort all products by composite_score DESC (highest first = position 1)
    // Assign recommended_grid_position = rank (1 to N)
    // Compare to current pos_products.grid_position
    // For products where position changed:
    //   Capture previous_state = { grid_position: old_value }
    //   PATCH pos_products SET grid_position = new_value, last_scored_at = now()
    //   INSERT menu_engineering_actions type='reorder_grid'
    //   Track which products moved up vs down

    // STEP 7: UPSELL WIRING
    // For each STAR product:
    //   Find the highest-margin PUZZLE product in a different category
    //   (we want to cross-sell a high-margin item that needs visibility)
    //   Condition: puzzle_product.category_id != star_product.category_id
    //   Set recommended_upsell_product_id = puzzle_product.id
    //   If different from current agent_upsell_product_id:
    //     PATCH pos_products SET agent_upsell_product_id = puzzle_product.id
    //     INSERT menu_engineering_actions type='set_upsell', reasoning='Star product X upsells Puzzle product Y'

    // STEP 8: BUNDLE DETECTION
    // For products where halo_products[0] is classified as PUZZLE:
    //   The most co-purchased product is a puzzle → customers naturally want both together
    //   bundle_price = (product.price + puzzle.price) * 0.90 (10% discount)
    //   Verify bundle is still profitable: bundle_price > (product.cost_price + puzzle.cost_price) * 1.20
    //   If profitable and different from current bundle:
    //     PATCH pos_products SET agent_bundle_product_id, agent_bundle_price
    //     INSERT menu_engineering_actions type='activate_bundle'
    //     reasoning: 'X and Y co-purchased in 47% of sales containing X — bundle at $Z'

    // STEP 9: HIDE DOG PRODUCTS
    // For DOG products where:
    //   velocity_vs_avg < 0.3 (barely selling)
    //   AND pos_products.stock_quantity > 0 (stock exists)
    //   AND NOT already agent_hidden
    // Set agent_hidden = true, grid_position = 9999 (push to end)
    // INSERT menu_engineering_actions type='hide_product'
    // Also: create a clearance promotion (POST /api/pos/promotions)
    //   discount_pct = 20, product_id, valid_until = now()+48h
    //   name = 'Clearance — {product_name}'

    // STEP 10: TIME-OF-DAY MODE SWITCHING
    // Get current hour and day_of_week
    // PEAK CONDITIONS (reconfigure for speed, not margin):
    //   (day_of_week IN [4,5] AND hour IN [18,19,20]) → Friday/Saturday dinner rush
    //   OR (hour IN [11,12,13] AND day_of_week IN [0,1,2,3,4]) → Weekday lunch
    // In peak mode: re-sort by SPEED proxy
    //   Speed proxy: products with low modifier complexity (no modifiers) AND low prep_time_minutes
    //   Push speed products to top of grid regardless of composite_score
    //   INSERT menu_engineering_actions type='activate_peak_mode'
    //
    // QUIET CONDITIONS (reconfigure for maximum margin):
    //   (day_of_week IN [0,1,2,3] AND hour > 14) → Mon-Thu afternoon
    // In quiet mode: sort by margin_score DESC (not composite_score)
    //   INSERT menu_engineering_actions type='activate_quiet_mode'
    //
    // NORMAL CONDITIONS: restore composite_score ordering

    // STEP 11: LEARNING LOOP — measure revenue impact of previous changes
    // Find menu_engineering_actions from 4 hours ago where revenue_impact_actual IS NULL
    // For each:
    //   revenue_4h_after = SUM(pos_sale_items.line_total) WHERE product_id = action.product_id
    //     AND created_at BETWEEN action.executed_at AND action.executed_at + 4h
    //   revenue_4h_before (already stored in product_performance_scores)
    //   revenue_impact_actual = revenue_4h_after - revenue_4h_before
    //   UPDATE menu_engineering_actions SET revenue_impact_actual
    //
    // WEIGHT ADJUSTMENT:
    //   If reorder_grid actions consistently show: products moved to position 1-3 earn MORE
    //     → velocity weight is working, maintain
    //   If puzzle products (high margin, low velocity) consistently underperform after promotion
    //     → reduce halo_weight, increase margin_weight in agent_settings.config
    //   Store as agent_settings.config.learned_weights = { velocity: X, margin: Y, halo: Z }
    //   Adjustment magnitude: 0.02 per cycle (slow adaptation to avoid overfitting)

    // FINAL: Upsert product_performance_scores, save AgentDecisions, log run
  }
}
```

## TASK 3 — POS terminal integration
Commit: "feat(menu-agent): POS grid uses agent scores — upsell prompts, bundles, hidden products"

Read the POS terminal page (src/app/pos/page.tsx or similar) IN FULL before editing.
Read its data fetching to understand how products are loaded.

Changes to make:
1. Product loading query: add ORDER BY grid_position ASC NULLS LAST
   (null grid_position products go after scored ones)
   Also filter: WHERE agent_hidden = false OR agent_hidden IS NULL

2. When a product is added to cart (onClick/addToCart handler):
   Check if product.agent_upsell_product_id is set
   If yes: show a subtle inline suggestion row BELOW the cart items (not a blocking modal):
     "Add {upsell_product.name} for ${upsell_product.price}?" with a small + button
   Clicking + adds the upsell product at its regular price
   Clicking elsewhere or adding another item dismisses it

3. Bundle badge on product card:
   If product.agent_bundle_product_id AND product.agent_bundle_price:
     Show a small "Bundle deal" badge in corner of the product tile
     Clicking the product shows a choice: "Add single ($X)" or "Bundle with {other} ($Y)"
     Bundle option adds both products as separate line items, the second at the bundle price difference

4. Performance tier badge (subtle, owner-facing only):
   Small coloured dot on product tile visible only in "manage" mode
   Star=gold, Puzzle=purple, Dog=grey, Plowhouse=blue (for owner awareness)

## TASK 4 — Cron + API routes
Commit: "feat(menu-agent): cron every 4h + scores API + manual trigger"

Create: src/app/api/cron/menu-engineering/route.ts
Add to vercel.json: { "path": "/api/cron/menu-engineering", "schedule": "0 */4 * * *" }
Check total cron count ≤22 before adding.

Cron handler:
- Fetch all active businesses
- For each: await menuEngineeringAgent.run(business_id)
- Return: { processed, decisions_total, errors }

Create: src/app/api/agents/menu-engineering/scores/route.ts
GET: latest product_performance_scores for business joined with pos_products
Response: {
  scored_at: string,
  current_mode: 'peak'|'quiet'|'margin_max'|'normal',
  star_count, dog_count, puzzle_count, plowhouse_count,
  products: [{...score_row, product: {...product_row}}],
  changes_today: number, // count of menu_engineering_actions today
  revenue_attribution_today: number // sum of revenue_impact_actual today
}

Create: src/app/api/agents/menu-engineering/actions/route.ts
GET: menu_engineering_actions last 7 days, with revenue_impact_actual
Response: { actions, total_positive_impact, total_negative_impact, net_impact }
POST: { business_id } → manually trigger a full scoring run

Create: src/app/api/agents/menu-engineering/reset/route.ts
POST: sets all pos_products.grid_position = NULL, agent_hidden = false, agent_upsell = NULL
For owners who want to go back to manual ordering temporarily

## TASK 5 — Dashboard widget on agents page
Commit: "feat(menu-agent): menu engineering widget on agents dashboard"

Add "Menu Engineering" section to /dashboard/agents page (from prompt 222).
Section must be part of the All Agents tab, plus a dedicated widget on Today's Plan.

BCG Matrix 2×2 visualisation:
  Four quadrants in a 2×2 grid: Stars / Plowhouse / Puzzle / Dog
  Each quadrant shows: count of products + total revenue from that tier
  Stars quadrant: sage/green tint
  Puzzle quadrant: amber/yellow tint (high potential, underperforming)
  Dog quadrant: red tint (needs action)
  Clicking any quadrant → filters the product list below

Current mode badge: large pill showing Peak / Quiet / Margin-Max / Normal
  Next mode change: "Quiet mode activates in 2h 15m"

Today's changes timeline:
  List of menu_engineering_actions from today with:
  icon + action description + product name + revenue impact (if measured)
  "Moved Flat White to position 1 (was 4) → +$23 revenue in next 4h"

Revenue attribution chart:
  7-day bar chart: daily revenue from agent-moved products vs baseline
  Shows whether the agent's grid changes are actually increasing revenue

Override button: "Reset to manual ordering"
  → POST /api/agents/menu-engineering/reset
  → Confirm modal: "This removes Aria's product ordering. You'll need to set positions manually."

## COMPLETION CHECKLIST
- [ ] 2 tables + 6 new columns on pos_products
- [ ] All 11 scoring steps implemented correctly
- [ ] BCG matrix classification with correct thresholds
- [ ] Halo effect computed from actual co-purchase data
- [ ] Composite score = velocity*0.40 + margin*0.35 + halo*0.25
- [ ] Grid reorder applied to pos_products + logged
- [ ] Upsell wiring: Star upsells highest-margin Puzzle in different category
- [ ] Bundle creation: verified profitable before creating
- [ ] Dog product hiding + clearance promotion
- [ ] Peak / Quiet / Margin-Max mode switching by time of day
- [ ] Learning loop: measures revenue impact 4h after each change
- [ ] Weight adaptation: slow 0.02 per cycle adjustments stored in config
- [ ] POS grid sorted by grid_position ASC NULLS LAST
- [ ] Upsell inline suggestion in POS cart
- [ ] Bundle choice on product tile
- [ ] Cron every 4h within vercel.json ≤22 limit
- [ ] API: scores, actions, reset routes
- [ ] Dashboard: BCG matrix viz, mode badge, timeline, revenue chart, override
- [ ] npx tsc --noEmit passes, npm run build passes
State "Build verified green, all commits pushed." when done.
