# S43 — Google Ads Integration
STATUS: BLOCKED | MODE: SOLO
Covers: prompts/64

## BLOCKED — Cannot execute until:
1. Founder creates a Google Ads Manager account (ads.google.com/home/tools/manager-accounts/)
2. Links the business's Google Ads account to the Manager account
3. Enables Google Ads API access; creates OAuth2 credentials with ads scope
4. Provides: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_DEVELOPER_TOKEN

---

## Sprint scope (once unblocked)

### Features
- Connect flow: OAuth → store Google Ads tokens in businesses table
- Campaign performance pull: impressions, clicks, spend, conversions (daily cron)
- Sync slow-day predictions to Google Ads budget pacing (pause ads on slow days, boost on busy)
- AI: "What's my Google Ads ROI this month?" question in Ask Aria
- Dashboard: /dashboard/marketing → Google Ads tab with campaign metrics

## Push
SOLO mode — stop before push.
