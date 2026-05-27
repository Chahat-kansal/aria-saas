# Prompt 66 — Slack Integration: Team Briefings + Aria Notifications

## What this unlocks
Owner asks: "Send today's briefing to my team"
Or: Aria automatically sends daily briefing to the business Slack channel.
No partnership needed — Slack API is free OAuth.

## Pre-edit checklist (MANDATORY)
1. `cat src/app/dashboard/integrations/page.tsx` — full read
2. `cat src/app/api/cron/daily-briefing-submit/route.ts` — understand briefing flow
3. Check DB: `businesses` table — any slack columns?

## What to build

### 1. DB migration
```sql
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_access_token text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_team_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_team_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_channel_id text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_channel_name text;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_connected boolean DEFAULT false;
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS slack_briefing_enabled boolean DEFAULT false;
```

### 2. OAuth connect
Slack OAuth 2.0:
Redirect: `https://slack.com/oauth/v2/authorize?client_id={CLIENT_ID}&scope=chat:write,channels:read,channels:join&redirect_uri={CALLBACK}`

`src/app/api/integrations/slack/connect/route.ts`
`src/app/api/integrations/slack/callback/route.ts`
- Exchange code for bot access_token
- Get team info and available channels
- Store in businesses table

`src/app/api/integrations/slack/disconnect/route.ts`

### 3. Channel selector
After connecting, show dropdown of available channels in integrations page.
Owner selects which channel to send briefings to.
`PUT /api/integrations/slack/channel` — saves channel_id + channel_name.

### 4. Send message route
`src/app/api/integrations/slack/send/route.ts` — POST
Takes: `{ business_id, message, blocks? }`
Calls Slack API: `POST https://slack.com/api/chat.postMessage`
With Slack Block Kit formatting for rich briefing display.

### 5. Daily briefing integration
In `src/app/api/cron/daily-briefing-submit/route.ts`:
After briefing is generated and saved, check if `slack_connected && slack_briefing_enabled`.
If yes: format briefing as Slack Block Kit message and send to channel.

Slack Block Kit format for briefing:
```json
{
  "blocks": [
    {"type": "header", "text": {"type": "plain_text", "text": "☀️ Aria Morning Briefing — [Business Name]"}},
    {"type": "section", "text": {"type": "mrkdwn", "text": "*[Revenue this week]* · [Top product] · [Low stock count] items low"}},
    {"type": "section", "text": {"type": "mrkdwn", "text": "[final_briefing text]"}},
    {"type": "actions", "elements": [{"type": "button", "text": {"type": "plain_text", "text": "Open Aria"}, "url": "https://ariaos.site/dashboard"}]}
  ]
}
```

### 6. Manual send from Ask Aria
Add `send_slack_message` tool to aria-tools.ts:
When owner says "send this to my team" or "post today's briefing to Slack":
- Formats the current response as Slack message
- Sends to configured channel
- Confirms: "Sent to #general ✓"

### 7. Integrations page card
- Slack logo + workspace name + channel name
- Toggle: "Send daily briefing to Slack" (on/off)
- "Send test message" button
- Channel selector dropdown
- Connect/disconnect

### 8. Env vars needed
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`

## Execution order
1. DB migrations via Supabase MCP
2. OAuth connect/callback/disconnect routes
3. Channel selector route
4. Send message route
5. Wire into daily briefing cron
6. Add send_slack_message tool to aria-tools.ts
7. Add Slack card to integrations page with toggle
8. `npx tsc --noEmit` + `npm run build` → must pass
9. Single commit: "feat: Slack integration — OAuth, daily briefing to channel, Ask Aria can send messages"
