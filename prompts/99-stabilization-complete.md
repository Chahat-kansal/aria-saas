# Prompt 99 — Stabilization Complete (Unfinished Prompt 95 Tasks)

Prompt 95 was written but only partially executed. This prompt finishes ALL remaining tasks.
Read prompt 95 first for full context. Execute only tasks NOT yet committed.

## Pre-flight
```
git pull origin main
npx tsc --noEmit   # must be zero errors
npm run build      # must pass
```

## Tasks (execute in order, one commit each)

### TASK 1 — Briefing cache invalidation
After any mutation (invoice paid/sent/voided, parcel updated, customer updated, social posted, loyalty redeemed):
- Call briefing API with `?fresh=true` to bust cache
- Add DB trigger on `invoices` updating `businesses.requires_briefing_refresh = true`
- Briefing API checks flag before serving cache
Commit: "fix(aria-briefing): cache invalidation on all data mutations"

### TASK 2 — CSP + move external fetches server-side
- Find every client-side fetch() to external domains in src/app/ and src/components/
- Move each to a server route
- Remove those domains from CSP connect-src (no longer needed client-side)
Commit: "fix(csp): all external API calls moved server-side"

### TASK 3 — Puppeteer → @sparticuz/chromium
```
npm i @sparticuz/chromium puppeteer-core
npm uninstall puppeteer
```
Replace puppeteer.launch() in /api/reports/weekly-generate with sparticuz pattern.
In vercel.json set that function to 1024mb + 60s timeout.
Commit: "fix(reports): @sparticuz/chromium for serverless PDF"

### TASK 4 — Theme persistence
Persist POS light/dark choice to localStorage on change, read on mount.
Commit: "fix(theme): persist light/dark across refreshes"

### TASK 5 — resolveBusinessId sweep
Every file under src/app/api/public/**/[business_id]/ must use resolveBusinessId from src/lib/aria/resolve-business.ts.
Replace any raw .eq('id', business_id) with the resolver.
Commit: "fix(api): resolveBusinessId across all public routes"

### TASK 6 — Error surfacing
Create src/lib/api/client.ts with apiFetch helper that throws ApiError on 4xx/5xx.
Replace raw fetch() calls in ALL dashboard pages with apiFetch.
Show toast on ApiError instead of blank/silent failure.
Commit: "feat(api-client): unified error surfacing across dashboard"

### TASK 7 — Competitor scan/read table mismatch
Scan writes to aria_competitor_watches. Page reads competitor_businesses + competitor_snapshots.
Fix: make scan write to the tables the page reads, OR update page to read aria_competitor_watches.
Pick whichever requires fewer changes. Document the decision in the commit.
Commit: "fix(competitor-watch): scan and page now use same tables"

### TASK 8 — Roster guard rails
In roster generation prompt: never recommend closing more than 2 days/week.
If <4 weeks data: default to even staffing, no closure recommendations.
Post-validate AI output: if >2 closed days → override to reduced hours.
Commit: "fix(roster): guard rails against mass closure recommendations"

### TASK 9 — Integration state consistency
For Xero, Twilio, SendGrid, Stripe — every dashboard page consuming these:
- useEffect loads integration state on mount
- Graceful degrade when not connected
- Clear "Connect X to use this" CTA
One commit per integration.

### TASK 10 — Text contrast sweep
Walk every modal + dark panel. Any text on --bg-base must use --text-primary.
Never hardcode #222 or similar dark text on dark bg.
Commit: "fix(theme): contrast audit across all modals"

### TASK 11 — Custom features DB persist
Verify Submit button on /dashboard/custom-features calls the API and persists to DB.
On refresh, submitted features must reappear.
Commit: "fix(custom-features): persist to DB + reload on mount"

### TASK 12 — Weekly report data guards
After Task 3 (puppeteer), add:
- Log every step in weekly-generate (data fetch, AI call, PDF render)
- If <7 days of pos_sales: return friendly "Not enough data yet"
- Cache report output 1 hour (don't double-bill Anthropic on retry)
Commit: "fix(reports): data prereq guards + 1h cache"

### TASK 13 — Aria Says honest empty states
Every dashboard page with Aria Says banner:
- Auto-trigger briefing on first load if missing
- If data exists but briefing empty: "Give me a moment..." then regenerate
- Never say "not enough data" if data actually exists
Commit: "fix(aria-says): honest empty states + auto-regenerate"

### TASK 14 — Sentry verification
Confirm Sentry initialized in production. Add /dashboard/debug page with "Throw test error" button.
Verify error appears in Sentry within 60s. Fix init if not.
Commit: "chore(sentry): verify error capture working in production"

## Rules
- npx tsc --noEmit + npm run build before EVERY commit
- One commit per task
- Do NOT add new features
- vercel.json: keep function count at 22, crons daily max (0 9 * * *)
