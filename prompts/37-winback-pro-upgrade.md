# Prompt 37 — Winback Page Pro Upgrade

## Context
`src/app/dashboard/winback/page.tsx` is 14KB. Shows lapsed customers, AI message, send SMS.
Must beat Klaviyo for small business winback.

## Pre-edit checklist (MANDATORY)
1. Read full: `src/app/dashboard/winback/page.tsx`
2. Read: `src/app/api/aria/winback-message/route.ts`
3. Read: `src/app/api/aria/winback-send/route.ts`
4. Check DB: `campaigns` table columns, `pos_customers` table

## Features to add

### 1. Campaign performance dashboard
Top section showing 3 metrics across all winback campaigns:
- Messages sent this month
- Customers won back (returned and made a purchase after campaign)
- Revenue recovered ($)
Pull from `campaigns` table where `type = winback`.
"Won back" = customer in campaign who has a `pos_sale` after `campaign.sent_at`.

### 2. Campaign ROI card
For each sent campaign, show:
- Sent: X customers
- Returned: Y customers (Y/X %)  
- Revenue recovered: $Z
- Cost (SMS): ~$0.08 × X sent
- ROI: (Revenue - Cost) / Cost × 100%

### 3. Automated sequence builder
New tab: "Sequences"
Simple builder: 3 steps
- Step 1: Day 30 — message template + "AI generate" button
- Step 2: Day 60 — different message
- Step 3: Day 90 — final attempt
Toggle: Enable/disable sequence
When enabled: cron checks daily for customers hitting day 30/60/90 and sends automatically.
Store in `winback_sequences` table:
```sql
CREATE TABLE IF NOT EXISTS winback_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  is_active boolean DEFAULT false,
  day30_message text,
  day60_message text, 
  day90_message text,
  created_at timestamptz DEFAULT now()
);
```

### 4. Best time to send indicator
Below the "Send" button, show:
"Best time to reach these customers: Tuesday 6pm"
Calculate: look at `pos_sales` timestamps for these specific customers — what time/day did they historically shop?
Simple mode calculation on hour and day of week.

### 5. A/B message testing
When generating AI message: generate 2 variants automatically.
Show side by side: "Version A" | "Version B"
Split selected customers 50/50 between versions.
After 7 days, show which version had better return rate.

## DB migration
```sql
CREATE TABLE IF NOT EXISTS winback_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid REFERENCES businesses(id),
  is_active boolean DEFAULT false,
  day30_message text,
  day60_message text,
  day90_message text,
  created_at timestamptz DEFAULT now()
);
```
Run via Supabase MCP before writing code.

## Execution
1. Run DB migration
2. Read all pre-edit files
3. Build all features — no stubs
4. `npx tsc --noEmit` — fix ALL errors
5. `npm run build` — must pass
6. `git add src/app/dashboard/winback/page.tsx && git commit -m "feat: winback — campaign ROI, automated sequences, best time, A/B testing" && git push`
