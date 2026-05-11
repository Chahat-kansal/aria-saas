# External Cron Setup (Hobby Plan Workaround)

Vercel Hobby plan limits crons to once daily. To enable hourly
briefing checks (morning + evening) and time-sensitive reorder
triggers, use cron-job.org as a free external trigger.

## Why this works

cron-job.org sends an HTTP GET to your Vercel route every hour.
Vercel sees a regular HTTP request (not a Vercel cron). The
`/api/cron/generate-briefings` handler checks each business's
local timezone and only fires briefings for the ones whose local
time matches a trigger hour. Same code as a real cron — just
triggered externally.

## Setup steps

1. **Sign up at <https://cron-job.org>** (free, no credit card)

2. **Create Job 1 — Briefings (hourly)**
   - Title: `Aria — Generate Briefings`
   - URL: `https://www.ariaos.site/api/cron/generate-briefings`
   - Schedule: Every hour (`0 * * * *`)
   - Request method: GET
   - Add HTTP header:
     - Name: `Authorization`
     - Value: `Bearer YOUR_CRON_SECRET_VALUE_HERE`
   - Save

3. **Create Job 2 — Scheduled Reorders (hourly)**
   - Title: `Aria — Run Scheduled Reorders`
   - URL: `https://www.ariaos.site/api/cron/run-scheduled-reorders`
   - Schedule: Every hour (`0 * * * *`)
   - Request method: GET
   - Add HTTP header:
     - Name: `Authorization`
     - Value: `Bearer YOUR_CRON_SECRET_VALUE_HERE`
   - Save

4. **Verify**
   - cron-job.org dashboard shows successful (200) hits hourly
   - Check Vercel logs: `GET /api/cron/generate-briefings 200`
   - Check Supabase: rows appear in `pos_daily_briefings` during
     the hour matching any business's morning/evening trigger

## How to find CRON_SECRET

Vercel dashboard → Project → Settings → Environment Variables → `CRON_SECRET`

Copy the value and paste it into cron-job.org's Authorization header.

## Failure modes

- **cron-job.org downtime** (~1 hour/month)
  → The daily Vercel cron at `0 16 * * *` fires `/api/cron/generate-briefings`
    as a safety net (catches the 2am AEST morning briefing most days)
- **CRON_SECRET rotated in Vercel**
  → Update the Authorization header in both cron-job.org jobs immediately
- **Vercel function timeout**
  → The handler processes businesses serially with early exit per business;
    errors are counted not fatal; re-runs on next hour are safe (upsert)

## When to swap to native Vercel cron

Upgrade to **Vercel Pro** (~$20/month) when you have 5+ paying customers. Then:

1. Add to `vercel.json` crons array:
   ```json
   { "path": "/api/cron/generate-briefings",     "schedule": "0 * * * *" },
   { "path": "/api/cron/run-scheduled-reorders",  "schedule": "0 * * * *" }
   ```
2. Disable both cron-job.org triggers
3. Same route code keeps working — just a different scheduler

## Route reference

| Route | Trigger | Purpose |
|-------|---------|---------|
| `/api/cron/generate-briefings` | Hourly (cron-job.org) + Daily backup (Vercel) | Morning + evening briefings per business timezone |
| `/api/cron/run-scheduled-reorders` | Hourly (cron-job.org) | Auto-PO for businesses whose reorder day+hour matches now |
| `/api/cron/briefing-daily` | Daily 4am AEST (Vercel) | Legacy single briefing — kept for backwards compatibility |
