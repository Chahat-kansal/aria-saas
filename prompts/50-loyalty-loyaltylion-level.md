# Prompt 50 — Loyalty: LoyaltyLion + Smile.io Level Pro Upgrade

## Category leader bar (checked live May 2026)
Smile.io: points for purchases + referrals + social, VIP tiers, referral program, points expiry, custom branding.
LoyaltyLion: AI-driven campaign suggestions, predictive analytics/revenue forecasting, behavior-based rewards (not just purchases), referral program, Klaviyo integration, customer segmentation by loyalty behavior, fraud detection.
Yotpo: points + referrals + VIP + reviews integration, SMS/email automation tied to loyalty events.
Aria must beat ALL of these + add POS-native AI differentiation.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/loyalty/page.tsx` — full read (16KB)
2. `cat src/app/api/loyalty/config/route.ts` — full read
3. `cat src/app/api/loyalty/stats/route.ts` — full read
4. `cat src/app/api/loyalty/earn/route.ts` — full read
5. Check DB via Supabase MCP: `pos_customers` loyalty columns, `loyalty_transactions` if exists
6. Check `businesses` loyalty config columns (loyalty_points_per_dollar, loyalty_redeem_rate etc)

## What currently exists (DO NOT remove)
- Config: points per dollar, redeem rate, minimum redeem
- Stats: total members, total points, redemptions
- Top customers list
- Transaction history
- Aria insight

## Gaps vs LoyaltyLion/Smile.io/Yotpo (add all)

### 1. VIP Tiers
3 configurable tiers: Bronze / Silver / Gold (names customisable).
Each tier has: spend threshold, multiplier (2x points), perks (free item, priority service).
Auto-promote customers when spend threshold hit.
Show tier badge on customer record.
Send SMS/email on tier upgrade: "Congratulations! You've reached Gold tier at [business]!"
Store in `loyalty_tiers` table:
```sql
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  tier_name text, tier_order integer, min_spend numeric,
  points_multiplier numeric DEFAULT 1, perks text,
  color text DEFAULT '#7FB897', created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS loyalty_tier text;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS total_lifetime_spend numeric DEFAULT 0;
```

### 2. Referral program
Customer gets a unique referral code (generated from their name + random suffix).
Share via SMS: "Share your code [CODE] with friends — they get 50 points on first purchase, you get 100 points!"
When new customer uses referral code at POS → both get points.
Track: referrer, referred customer, referral date, points awarded.
Store in `loyalty_referrals` table.
Show referral leaderboard: top referrers with count.

### 3. Behavior-based rewards (not just purchases)
Award points for: review left, birthday visit, referral made, 5th visit milestone, spending milestone.
Configurable in loyalty config: toggle each on/off, set point values.
Store reward rules in `loyalty_reward_rules` table.
Check triggers: after review API, after sale (nth visit check), on birthday (daily cron).

### 4. Points expiry
Config option: points expire after X months of inactivity (default: 12 months).
Daily cron checks for expiring points → sends warning SMS 30 days before expiry: "Your [X] points expire in 30 days — visit us to keep them!"
On expiry: zero out points, log in transaction history.

### 5. Revenue forecasting from loyalty (AI)
New "Insights" section.
AI analysis: "Your loyalty members spend 2.3x more than non-members."
"If your program grows by 20 members this month, predicted additional revenue: $3,400"
"Top at-risk tier: 12 Silver members haven't visited in 45 days — risk of losing $8,200 annual revenue"
Call Claude Haiku with loyalty stats + customer spend data.
Log to `aria_ai_calls`.
Recharts bar chart: loyalty vs non-loyalty spend comparison.

### 6. Fraud detection
Flag suspicious redemptions: same customer redeeming >3x per week, points balance spike.
Show in admin: "⚠️ Suspicious activity: Customer #234 redeemed 500 points across 3 transactions today"
Simple rules-based detection, no AI needed.
Store flags in `loyalty_fraud_flags` table.

### 7. Customisable program branding
Program name: default "Aria Rewards" → owner can customise.
Points name: default "points" → customise to "sips", "bottles", "coins" etc.
Tier names: Bronze/Silver/Gold → customise.
Show on customer-facing receipt and SMS: "You have 340 Sips!"
Store in loyalty config on businesses table.

### 8. Loyalty dashboard metrics upgrade
4 large metric cards at top:
- Total loyalty members + % of all customers
- Points in circulation (unredeemed) = liability
- Redemption rate this month %
- Revenue from loyalty members vs non-members ratio
Program health score: 0-100 (members / customers × redemption rate × retention rate).

## DB migrations
```sql
CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  tier_name text, tier_order integer, min_spend numeric,
  points_multiplier numeric DEFAULT 1, perks text, color text DEFAULT '#7FB897',
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS loyalty_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  referrer_customer_id uuid REFERENCES pos_customers(id),
  referred_customer_id uuid REFERENCES pos_customers(id),
  referral_code text, referral_date timestamptz DEFAULT now(),
  referrer_points_awarded integer DEFAULT 0, referred_points_awarded integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS loyalty_reward_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  rule_type text, points_value integer, is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS loyalty_tier text;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS total_lifetime_spend numeric DEFAULT 0;
ALTER TABLE pos_customers ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS loyalty_program_name text DEFAULT 'Aria Rewards';
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS loyalty_points_name text DEFAULT 'points';
```

## Page structure (tabs)
**Overview** | **Members** | **Tiers** | **Referrals** | **Rewards** | **Config** (existing)

## Execution
1. Run ALL DB migrations via Supabase MCP
2. Read ALL pre-edit files fully
3. Build all features — zero stubs
4. All AI calls log to `aria_ai_calls`
5. `npx tsc --noEmit` — zero errors
6. `npm run build` — must pass
7. `git add -A && git commit -m "feat: loyalty — LoyaltyLion-level VIP tiers, referral program, behavior rewards, points expiry, AI revenue forecast, fraud detection" && git push`
