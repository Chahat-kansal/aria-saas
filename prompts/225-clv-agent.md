# Prompt 225 — Customer Lifetime Value Prediction + Intervention Agent
# What Salesforce Agentforce charges $500+/seat/month for.
# ENV: TWILIO (set ✅), RESEND (set ✅), no new vars needed.

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

## EXISTING CUSTOMER DATA
pos_customers columns include: id, business_id, name, email, phone, total_spend,
visit_count, last_visited_at, loyalty_points, tier, birthday, marketing_opt_in,
rfm_score, rfm_segment, churn_risk_score

## WHAT THIS AGENT DOES
Runs weekly. Builds an individual CLV model per customer. Scores everyone.
Computes the MINIMUM EFFECTIVE offer per customer (not flat 20% off for everyone).
Generates personalised messages using actual purchase history.
Executes surgical interventions targeting the right person with the right offer.

## TASK 1 — DB migrations
Commit: "feat(clv-agent): DB migrations — customer_clv_scores + clv_portfolio_summary"

```sql
CREATE TABLE IF NOT EXISTS customer_clv_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE NOT NULL,
  customer_id uuid REFERENCES pos_customers(id) ON DELETE CASCADE NOT NULL,
  scored_at timestamptz DEFAULT now(),
  avg_basket_size numeric DEFAULT 0,
  visit_frequency_per_month numeric DEFAULT 0,
  months_as_customer numeric DEFAULT 0,
  product_diversity_score numeric DEFAULT 0,
  price_sensitivity_score numeric DEFAULT 0,
  seasonal_consistency_score numeric DEFAULT 0,
  predicted_monthly_revenue numeric DEFAULT 0,
  predicted_annual_revenue numeric DEFAULT 0,
  predicted_3yr_clv numeric DEFAULT 0,
  clv_tier text CHECK (clv_tier IN ('champion','loyal','potential','at_risk','dormant','lost')),
  visit_trend text CHECK (visit_trend IN ('accelerating','stable','decelerating','dormant')),
  spend_trend text CHECK (spend_trend IN ('growing','stable','declining')),
  days_since_last_visit integer DEFAULT 0,
  intervention_priority text CHECK (intervention_priority IN ('urgent','high','medium','low','none')),
  recommended_offer_type text CHECK (recommended_offer_type IN ('percentage_discount','free_item','points_bonus','exclusive_access','vip_upgrade','none')),
  recommended_offer_value numeric,
  recommended_message text,
  intervention_rationale text,
  intervention_sent_at timestamptz,
  intervention_responded boolean,
  revenue_in_30d_after numeric,
  visit_count_in_30d_after integer,
  UNIQUE(business_id, customer_id, date_trunc('week', scored_at))
);
ALTER TABLE customer_clv_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_clv" ON customer_clv_scores
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
CREATE INDEX ON customer_clv_scores (business_id, clv_tier, scored_at DESC);
CREATE INDEX ON customer_clv_scores (business_id, intervention_priority, scored_at DESC);

CREATE TABLE IF NOT EXISTS clv_portfolio_summary (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  scored_at timestamptz DEFAULT now(),
  total_customer_count integer DEFAULT 0,
  champion_count integer DEFAULT 0, loyal_count integer DEFAULT 0,
  potential_count integer DEFAULT 0, at_risk_count integer DEFAULT 0,
  dormant_count integer DEFAULT 0, lost_count integer DEFAULT 0,
  total_predicted_annual_revenue numeric DEFAULT 0,
  at_risk_annual_revenue numeric DEFAULT 0,
  top_20_pct_revenue_share numeric DEFAULT 0,
  if_rising_stars_add_1_visit numeric DEFAULT 0,
  avg_clv_champion numeric DEFAULT 0,
  avg_clv_loyal numeric DEFAULT 0,
  avg_clv_potential numeric DEFAULT 0
);
ALTER TABLE clv_portfolio_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_clv_portfolio" ON clv_portfolio_summary
  FOR ALL USING (business_id IN (SELECT id FROM businesses WHERE user_id = auth.uid()));
```

## TASK 2 — CLVAgent class
Commit: "feat(clv-agent): CLVAgent — full feature scoring + minimum effective offer"

Create: src/lib/agents/clv-agent.ts (AgentType: 'clv')

run(business_id):
1. FETCH all customers with >= 1 purchase in last 12 months. Build PurchaseHistory per customer.
2. COMPUTE FEATURES per customer:
   avg_basket = AVG(sale.total_amount)
   visit_frequency = COUNT(sales) / months_as_customer
   months_as_customer = (now - first_sale) / 30
   product_diversity = DISTINCT(products) / total_products (0-1)
   price_sensitivity = (discount_purchase_rate * 0.6) + (promo_response_rate * 0.4)
   seasonal_consistency = 1 - (STD_DEV(monthly_visits) / AVG(monthly_visits))
   visit_trend: last_4m_rate vs prior_4m_rate → accelerating if ratio > 1.2, decelerating < 0.8
   spend_trend: same logic on total_amount
3. PREDICT CLV:
   predicted_monthly = avg_basket * visit_frequency
   predicted_annual = predicted_monthly * 12 * trend_adj (growing=+0.1, declining=-0.1)
   churn_prob = days_since / 365 * (1 - seasonal_consistency) — clamp 0-0.9
   predicted_3yr = predicted_annual * 3 * (1 - churn_prob)
4. CLV TIER:
   champion: frequency > 4/month AND basket > business_avg * 1.2
   loyal: frequency > 2/month AND stable/growing
   potential: frequency < 2/month BUT accelerating OR high basket
   at_risk: was loyal/champion BUT decelerating AND days_since > 21
   dormant: days_since 60-180
   lost: days_since > 180
5. MINIMUM EFFECTIVE OFFER:
   price_insensitive (< 0.3): free_item or points_bonus (no discount)
   price_sensitive (> 0.6): percentage_discount 10-15%
   moderate (0.3-0.6): points_bonus or 10%
   at_risk champion: exclusive_access + 15%
   potential high basket: vip_upgrade (no discount, recognition)
6. PERSONALISED MESSAGE for urgent/high priority customers via haiku (batch 20 at a time):
   "Write a personalised SMS for {name}. They last visited {N} days ago. 
    Their favourite: {most_purchased_product}. Offer: {offer}. 
    2 sentences max. Warm, personal, not corporate. Use their first name."
7. PORTFOLIO SUMMARY: aggregate all scores into clv_portfolio_summary
   if_rising_stars_add_1_visit = SUM(potential_customers.avg_basket * 1 extra visit)
8. UPSERT customer_clv_scores + clv_portfolio_summary
9. Update pos_customers.rfm_segment + churn_risk_score from new CLV data
10. EXECUTE INTERVENTIONS (if mode=auto) for urgent/high via Twilio/Resend

Weekly cron: "0 19 * * 0" (Sunday 7am AEST)
Outcome cron: "0 19 * * 1" — fills revenue_in_30d_after for 30-day-old interventions

## TASK 3 — API routes + Dashboard widget
Commit: "feat(clv-agent): API routes + CLV dashboard widget"

GET /api/agents/clv → portfolio summary + tier breakdown + top intervention opportunities
GET /api/agents/clv/customers → paginated scores with tier/priority filters
POST /api/agents/clv/trigger → manual run
POST /api/agents/clv/send/[id] → manually send intervention for a specific customer

Dashboard "Customer Intelligence" section:
- Portfolio cards: Champions (${annual_rev}) | At risk (${at_risk_rev}) | "If rising stars visit once more: +${X}/month"
- Tier rings visualisation (recharts pie/donut): champion/loyal/potential/at-risk/dormant/lost
- Intervention queue: customer name + tier + days since visit + message preview + "Send now" button
- Learning: response rate, best-performing offer type, avg lift

## COMPLETION CHECKLIST
- [ ] 2 tables with RLS + indexes
- [ ] All CLV features computed correctly
- [ ] Minimum effective offer logic (not flat discount)
- [ ] Personalised messages via haiku (batched)
- [ ] Portfolio summary + if_rising_stars_add_1_visit computed
- [ ] Outcome tracking after 30 days
- [ ] Dashboard: portfolio cards, tier visualisation, intervention queue
- [ ] npx tsc --noEmit + npm run build pass
State "Build verified green, all commits pushed." when done.
