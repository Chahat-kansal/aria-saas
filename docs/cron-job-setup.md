# cron-job.org Setup

Aria is on Vercel Hobby which limits crons to once-daily.
Briefings + auto-reorder routes need hourly external triggers.

## Setup

1. Sign up at https://cron-job.org (free tier is sufficient)

2. Create **Cronjob 1 — Aria Briefings**
   - URL: `https://www.ariaos.site/api/cron/generate-briefings`
   - Schedule: every hour
   - Request method: GET
   - Header: `Authorization: Bearer <CRON_SECRET from Vercel>`

3. Create **Cronjob 2 — Auto-Reorder**
   - URL: `https://www.ariaos.site/api/cron/reorder`
   - Schedule: every hour
   - Request method: GET
   - Header: `Authorization: Bearer <CRON_SECRET from Vercel>`

## Getting CRON_SECRET

In Vercel dashboard → Project → Settings → Environment Variables,
find `CRON_SECRET`. Copy the value and paste it as the Bearer token
in cron-job.org for each job.

## Verify

- cron-job.org dashboard: **Last execution: success (200)** after 1 hour
- Vercel runtime logs: `GET /api/cron/* 200` appearing hourly
- `pos_daily_briefings` table gets new rows on the configured
  schedule per business
