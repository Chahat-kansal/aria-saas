# Prompt 41 — Winback: Klaviyo-Level Pro Upgrade

## Why this exists
Klaviyo in 2026 ships: AI campaign composer from plain language, personalised send time per individual, multi-channel (email + SMS), revenue attribution per campaign, behavioural triggers. Aria must match or beat this for Australian small business.

## Pre-edit checklist (MANDATORY — read ALL before writing one line)
1. `cat src/app/dashboard/winback/page.tsx` — full read
2. `cat src/app/api/aria/winback-message/route.ts` — full read
3. `cat src/app/api/aria/winback-send/route.ts` — this is 0 bytes, needs building
4. `cat src/app/api/campaigns/route.ts` — check if exists
5. `cat src/lib/resend.ts` OR check how email is sent in `src/app/api/invoices/send/route.ts`
6. Check DB: `campaigns`, `pos_customers`, `pos_sales` table columns via Supabase MCP
7. Check Vercel env vars: `RESEND_API_KEY`, `TWILIO_ACCOUNT_SID` must exist

## Features to build — every single one, no stubs

### 1. Plain-language campaign composer (Aria-powered)
Text input at top: "Write a winback campaign for customers who haven't visited in 60 days with a 10% discount"
Aria parses this and:
- Identifies the audience (customers lapsed 60 days)
- Generates SMS + Email versions of the message
- Suggests optimal send time based on those customers' historical purchase hours
- Shows preview of both versions side by side before sending
Call `/api/aria/winback-compose` — build this route.
Route calls Claude Haiku with: business context + customer segments + the plain-language request.
Returns: `{ audience_filter, sms_message, email_subject, email_body, suggested_send_time, estimated_reach }`

### 2. Dual channel — SMS + Email
Every campaign sends BOTH SMS and email (if customer has both).
SMS: existing Twilio infrastructure
Email: Resend — use same pattern as `src/app/api/invoices/send/route.ts`
Customer record must have `email` and/or `phone` — send whichever exists, both if available.
Build `/api/aria/winback-send/route.ts` (currently 0 bytes):
```ts
POST body: { campaign_id, customer_ids, sms_message, email_subject, email_body, channel: 'sms'|'email'|'both' }
- For each customer: send SMS via Twilio if phone exists
- Send email via Resend if email exists
- Record in `campaign_sends` table: customer_id, campaign_id, channel, sent_at, status
- Return: { sent_sms, sent_email, failed, total }
```

### 3. Personalised send time (per customer)
For each customer in the campaign, calculate their personal best send time:
Query `pos_sales` for that customer → extract hour of day and day of week from `created_at`
Find the mode (most common hour) → that's their personal best time
If no data: default to Tuesday 6pm AEST
Show in UI: "Personalised send times: Aria will send to each customer at their highest-engagement moment"
Store `scheduled_send_at` per customer in `campaign_sends`.
Cron `/api/cron/send-scheduled-campaigns` checks every hour and sends due messages.

### 4. Revenue attribution
After campaign is sent, track which customers made a purchase within 30 days.
Daily cron checks: `campaign_sends` joined with `pos_sales` where sale `created_at` > `sent_at` and < `sent_at + 30 days`
Update `campaigns` table: `attributed_revenue`, `returned_customers`, `roi_percent`
Show in campaign list:
- Sent to: X customers
- Returned: Y customers (Z%)
- Revenue attributed: $A
- Cost: $B (SMS + email costs)
- ROI: C%

### 5. Behavioural triggers (automated sequences)
New "Automations" tab next to "Campaigns"
Pre-built triggers:
- **Lapsed 30 days**: auto-send day 30 message
- **Lapsed 60 days**: auto-send day 60 message  
- **Lapsed 90 days**: final attempt
- **Big spender gone quiet**: customer who spent >$500 total, not seen in 45 days
Toggle each trigger ON/OFF.
Store in `winback_automations` table:
```sql
CREATE TABLE IF NOT EXISTS winback_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  trigger_type text, -- lapsed_30, lapsed_60, lapsed_90, big_spender
  is_active boolean DEFAULT false,
  sms_message text,
  email_subject text,
  email_body text,
  created_at timestamptz DEFAULT now()
);
```
Daily cron checks automations and fires messages to qualifying customers not already messaged.

### 6. Campaign performance dashboard (top of page)
4 metrics strip:
- Total campaigns sent (all time)
- Customers won back (all time)  
- Revenue attributed (all time)
- Average ROI %
Below: campaign history table with per-campaign ROI.

## Design
- Dark theme matching dashboard
- Two main tabs: "Campaigns" | "Automations"
- Campaign composer at top of Campaigns tab
- Performance dashboard below composer
- Customer list with checkboxes below that
- Channel toggle: SMS only | Email only | Both
- All animations use CSS transitions not libraries

## DB migrations (run via Supabase MCP before writing code)
```sql
CREATE TABLE IF NOT EXISTS campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES pos_customers(id),
  channel text CHECK (channel IN ('sms','email','both')),
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS attributed_revenue numeric DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS returned_customers integer DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS roi_percent numeric DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_body text;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel text DEFAULT 'sms';
CREATE TABLE IF NOT EXISTS winback_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  trigger_type text,
  is_active boolean DEFAULT false,
  sms_message text,
  email_subject text,
  email_body text,
  created_at timestamptz DEFAULT now()
);
```

## Routes to build/fix
- `src/app/api/aria/winback-compose/route.ts` — NEW
- `src/app/api/aria/winback-send/route.ts` — currently 0 bytes, build fully
- `src/app/api/cron/send-scheduled-campaigns/route.ts` — NEW (add to vercel.json crons: `0 * * * *`)

## Execution order
1. Run DB migrations via Supabase MCP
2. Read ALL pre-edit files
3. Build `winback-compose` route
4. Build `winback-send` route  
5. Rewrite `src/app/dashboard/winback/page.tsx` — full pro UI
6. `npx tsc --noEmit` — fix ALL TS errors, zero tolerance
7. `npm run build` — must pass clean
8. Single commit: `git add -A && git commit -m "feat: winback — Klaviyo-level AI composer, dual channel email+SMS, personalised send time, revenue attribution, behavioural triggers" && git push`
