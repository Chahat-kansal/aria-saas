# Prompt 223 — Autonomous Menu/Product Engineering Agent
# What Deliverect charges enterprise restaurants (Burger King, KFC) for. Now for Australian SMBs.
# NO NEW ENV VARS needed.

## SKILLS — READ BEFORE ANY CODE
Before writing any frontend code, read these IN FULL:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md
- /mnt/skills/public/frontend-design/SKILL.md
Apply silently. Aria Financial Trust palette (#2D5240 + #7FB897), Inter body, Fraunces italic for key numbers.

## EXISTING INFRASTRUCTURE — DO NOT RECREATE
- src/lib/agents/base-agent.ts — BaseAgent class
- src/lib/agents/types.ts — AgentType, AgentDecision, AgentRunResult
- src/lib/agents/orchestrator.ts — runAgent(), routeIntent()
- src/lib/agents/reorder-agent.ts, pricing-agent.ts, schedule-agent.ts — already built
- DB: agent_settings, agent_decisions, agent_runs, aria_autopilot_actions
- Extend AgentType union in types.ts for each new agent type
- All agents extend BaseAgent. Use this.supabase, this.anthropic, this.getSettings(), this.saveDecisions(), this.logRun()

## RULES
Read CLAUDE.md first. One commit per task. npx tsc --noEmit + npm run build before every commit.
UPGRADE-ONLY. Amounts in dollars. haiku for fast calls, sonnet for complex reasoning.
State "Build verified green, all commits pushed." when done.

## WHAT THIS AGENT DOES
Runs every 4 hours. Scores every product using velocity + margin + halo effect.
Classifies products using the BCG matrix (Star/Plowhouse/Puzzle/Dog).
Autonomously reorders the POS grid, wires upsells, creates bundles, hides underperformers,
and switches between Peak/Quiet/Margin-Max modes based on time of day.

## TASK 1 — DB migrations
Commit: "feat(menu-agent): DB migrations"

```sql
CREATE TABLE IF NOT EXISTS product_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES pos_products(id) ON DELETE CASCADE NOT NULL,
  scored_at timestamptz DEFAULT now(),
  period_hours integer DEFAULT 4,
  units_sold numeric DEFAULT 0,
  revenue_generated numeric DEFAULT 0,
  avg_daily_units numeric DEFAULT 0,
  velocity_vs_avg numeric DEFAULT 1.0,
  margin_pct numeric DEFAULT 0,
  margin_dollars_per_unit numeric DEFAULT 0,
  margin_score numeric DEFAULT 0.5,
  halo_score numeric DEFAULT 0,
  halo_products uuid[],
  composite_score numeric DEFAULT 0,
  recommended_grid_position integer,
  recommended_upsell_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  recommended_bundle_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  UNIQUE(business_id, product_id, date_trunc('hour', scored_at))
);
ALTER TABLE product_performance_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_product_scores" ON product_performance_scores
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON product_performance_scores (business_id, composite_score DESC, scored_at DESC);

CREATE TABLE IF NOT EXISTS menu_engineering_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'reorder_grid','hide_product','show_product','activate_bundle',
    'deactivate_bundle','set_upsell','activate_peak_mode',
    'activate_quiet_mode','activate_margin_mode'
  )),
  product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL,
  previous_state jsonb,
  new_state jsonb,
  reasoning text,
  revenue_impact_actual numeric,
  executed_at timestamptz DEFAULT now(),
  reverted_at timestamptz
);
ALTER TABLE menu_engineering_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_menu_actions" ON menu_engineering_actions
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));

ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS grid_position integer;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_hidden boolean DEFAULT false;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_upsell_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_product_id uuid REFERENCES pos_products(id) ON DELETE SET NULL;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS agent_bundle_price numeric;
ALTER TABLE pos_products ADD COLUMN IF NOT EXISTS performance_tier text DEFAULT 'normal'
  CHECK (performance_tier IN ('star','plowhouse','puzzle','dog','normal'));
```

## TASK 2 — MenuEngineeringAgent class
Commit: "feat(menu-agent): MenuEngineeringAgent — BCG scoring + grid optimiser + learning loop"

Create: src/lib/agents/menu-engineering-agent.ts (AgentType: 'menu_engineering')

run(business_id) steps:
1. VELOCITY: for each product, compute current_4h_units vs avg_4h_units (last 30d same window). velocity_vs_avg = ratio.
2. MARGIN: margin_score = product.margin_pct / MAX(margin_pct across business). Normalised 0-1.
3. HALO EFFECT: for each product, find co-purchased products in same sale_id. halo_score = avg margin of co-purchased / avg margin of all products. halo_products = top 3 by frequency.
4. COMPOSITE: score = (velocity * 0.40) + (margin * 0.35) + (halo * 0.25). Range 0-2.
5. BCG MATRIX:
   Star: velocity > 1.2 AND margin > 0.6 → promote, wire upsells from this
   Plowhouse: velocity > 1.2 AND margin < 0.4 → high volume low margin, consider price nudge
   Puzzle: velocity < 0.8 AND margin > 0.6 → high margin not selling, needs promotion
   Dog: velocity < 0.8 AND margin < 0.4 → hide or bundle to clear
6. GRID: sort all by composite_score DESC, assign grid_position 1..N. If changed: update pos_products, log action.
7. UPSELLS: for each Star, find highest-margin Puzzle in complementary category → set agent_upsell_product_id.
8. BUNDLES: where halo_products[0] is a Puzzle → create bundle at combined price -10% (verify still profitable).
9. HIDE DOGS: if velocity < 0.3 avg AND stock > 0 → agent_hidden = true → create clearance promotion.
10. TIME MODE:
    Peak (Fri/Sat 7-9pm, any day 12-2pm) → rank by speed (fastest-to-make items first)
    Quiet (Mon-Thurs after 3pm) → rank by margin
11. LEARNING: after each 4h cycle, compare revenue per product before vs after grid change. If improved: log positive. If decreased: adjust composite weights stored in agent_settings.config.
12. Save product_performance_scores, AgentDecisions, log run.

## TASK 3 — POS integration + cron + API
Commit: "feat(menu-agent): POS grid uses scores, upsell prompts in cart, cron every 4h"

Read POS terminal page IN FULL before editing. Changes:
- Sort products by grid_position ASC (NULL last)
- On add to cart: if agent_upsell_product_id set → show inline "Add {product}?" suggestion (not a modal)
- If agent_hidden = true → don't show product
- If agent_bundle_product_id + agent_bundle_price → show "Bundle deal" badge, clicking adds both at bundle price

Create: src/app/api/cron/menu-engineering/route.ts (schedule: "0 */4 * * *")
Create: src/app/api/agents/menu-engineering/scores/route.ts (GET: latest scores + current mode)
Create: src/app/api/agents/menu-engineering/actions/route.ts (GET: last 7d actions, POST: manual trigger)

## TASK 4 — Dashboard widget
Commit: "feat(menu-agent): menu engineering widget on agents dashboard"

Add "Menu Engineering" section to /dashboard/agents:
- Current mode badge (Peak/Quiet/Margin-Max/Normal)
- BCG matrix 2×2 visualisation with product counts per quadrant
- "Changes today" timeline: grid reorders, hidden products, new bundles
- Revenue change chart: last 7 days per-product revenue vs pre-agent baseline
- "Reset to manual" override button

## COMPLETION CHECKLIST
- [ ] 2 tables + 6 new columns on pos_products
- [ ] All 11 scoring steps + BCG classification
- [ ] Halo effect from co-purchase data
- [ ] POS grid sorted by scores, upsell prompts, bundles showing
- [ ] Cron every 4h, API routes, dashboard widget
- [ ] Learning loop measuring actual revenue impact
- [ ] npx tsc --noEmit + npm run build pass
State "Build verified green, all commits pushed." when done.
