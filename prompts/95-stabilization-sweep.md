# Prompt 95 - The stabilization sweep

## What this is
Not a feature prompt. A bug-fix and infrastructure pass that touches 10+ areas where prior prompts shipped UI without complete plumbing, or where shared assumptions were never enforced. After this lands, the product is genuinely ready to test end-to-end. Without this, every new feature compounds the same pattern.

Estimated scope: 2-3 days of Claude Code work split into many small commits. Do NOT try to finish in one session - run, push, take a break, run again.

## Task ordering (critical - do in this order)

### TASK 1 - Cache invalidation for Aria briefings (HIGH PRIORITY, simple fix)

**Bug**: After marking an invoice as paid, the Aria Says banner on /dashboard/invoices still says "$55 outstanding". The DB write succeeded (verified: invoice INV-0001 is `status='paid'`, paid_at set). The banner is reading a cached `aria_briefings` row that was generated before the status change.

**Fix**: 
- The briefing API at `/api/aria/dashboard-briefing/[page]` (or wherever the per-page banner pulls from) must accept a `?fresh=true` query param that forces regeneration.
- After every invoice status change (mark-as-paid, send, void), the frontend calls the briefing API with `?fresh=true` to refresh.
- Better: trigger-based - add a DB trigger on `invoices` that updates a `requires_briefing_refresh` flag on businesses, and the briefing API checks this flag before serving cached content.
- Apply same pattern to ALL feature briefings (parcels, customers, social, loyalty) - any data mutation invalidates the page's cached briefing.

**Commit**: "fix(aria-briefing): cache invalidation on invoice/parcel/customer mutations - banner now reflects current data"

### TASK 2 - CSP allowlist completeness (5-minute fix)

**Bug**: `api.open-meteo.com` is called for weather-based briefings but blocked by CSP. Find every `fetch()` in `src/lib/aria/*` and `src/app/api/aria/*` that hits an external domain. Add to CSP `connect-src`.

Also move ALL external API calls server-side. The weather fetch should happen in a route, not in a client component. Server-side fetches are not subject to CSP. This is the right architectural fix; just whitelisting open-meteo is a band-aid.

**Commit**: "fix(csp): move all external API calls server-side - resolve open-meteo + future CSP blocks"

### TASK 3 - Puppeteer / weekly-report PDF generation (real infra fix)

**Bug**: `/api/reports/weekly-generate` calls puppeteer.launch() with full Chromium - fails on Vercel because Chromium isn't installed.

**Fix**: Switch to `@sparticuz/chromium` + `puppeteer-core` (Vercel-supported variant). Standard pattern:
```typescript
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  args: chromium.args,
  defaultViewport: chromium.defaultViewport,
  executablePath: await chromium.executablePath(),
  headless: chromium.headless,
})
```
Install both packages: `npm i @sparticuz/chromium puppeteer-core`. Remove plain `puppeteer` if it's still a dependency.

Increase the Vercel function memory + timeout in `vercel.json` for the weekly-generate function - PDF gen typically needs 1024MB + 60s.

**Commit**: "fix(reports): use @sparticuz/chromium for serverless PDF generation"

### TASK 4 - Theme persistence (small but visible)

**Bug**: POS light theme resets to dark on refresh.

**Fix**: Wherever theme is stored (probably `useState` in a layout component), persist to `localStorage` on change and read on mount. If a per-business theme preference exists, also persist to `businesses.theme_preference`.

**Commit**: "fix(theme): persist light/dark choice across refreshes"

### TASK 5 - Basiq bank-connect email bug

**Bug**: Basiq returns 400 "email is in bad format" when starting bank connection. Code is passing wrong value into the email field.

**Fix**: Read `src/app/api/integrations/basiq/connect/route.ts`. Whatever field is being sent as `email`, replace with the actual authenticated user's email from `auth.getUser()`. If the user doesn't have an email on file (Google OAuth without email scope), surface a friendly "Please add an email to your profile first" error - don't send a malformed Basiq request.

**Commit**: "fix(basiq): pass authenticated user email to bank connect, not a placeholder"

### TASK 6 - Surface API errors instead of swallowing them

**Bug**: When `/api/recipes/training`, `/api/seo/crawl`, `/api/pos/timesheets`, etc. return 4xx/5xx, the UI shows blank state or "No data yet" instead of "Something went wrong, please retry / contact support".

**Fix**: Add a global API error boundary helper:
```typescript
// src/lib/api/client.ts
export async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts)
  if (!r.ok) {
    const body = await r.text()
    throw new ApiError(r.status, body, url)
  }
  return r.json()
}
```
Wrap every dashboard fetch in this helper. Show a toast or inline error state when ApiError is thrown. The owner needs to know something broke - silence is the worst UX.

**Commit**: "feat(api-client): unified fetch helper + error surfacing across dashboard"

### TASK 7 - resolveBusinessId everywhere

**Bug**: Prompt 92 introduced the slug-or-UUID resolver for loyalty routes only. Many other public-by-id routes still have the same bug (booking, parcel, kiosk, hub clicks, etc.).

**Fix**: Find every file matching `src/app/api/public/**/[business_id]/**/*.ts`. Confirm each uses `resolveBusinessId` from `src/lib/aria/resolve-business.ts`. Replace any direct `.eq('id', business_id)` calls.

Also: any internal API route that takes a business identifier from a URL slug. Search `params.business_id` and `params.slug` across the whole `src/app/api/` tree.

**Commit**: "fix(api): apply resolveBusinessId helper across all public-by-id routes"

### TASK 8 - Connection state consistency

**Bug**: Prompt 94 fixed `/dashboard/social` not loading connections. Same bug pattern likely exists for other integration-driven features (Xero state, Twilio state, SendGrid state, Stripe state).

**Fix**: For every page that consumes integration state, audit:
- Does it have a useEffect that loads the integration list on mount?
- Does it gracefully degrade when none is connected?
- Does it show a clear "connect X to use this" CTA?

This is a sweep, not one commit. Do one integration per commit.

**Commit pattern**: "fix(dashboard/<feature>): load integration state on mount + degrade gracefully"

### TASK 9 - Roster generator guard rails

**Bug**: AI is recommending closing 4 days/week based on low test revenue. Real businesses can't close 4 days; this would scare any owner away from using the feature.

**Fix**: In the roster-generation prompt (find it in `src/lib/aria/roster/*` or `/api/aria/roster-generate`):
- Hard rule in the prompt: "Never recommend closing more than 2 days per week. If revenue is genuinely too low to staff every open day, recommend reducing hours, not closing days."
- Add a post-validation step in code: if the AI's response includes more than 2 closed days, override to "reduced hours" mode automatically.
- Add a confidence threshold: if there's fewer than 4 weeks of historical revenue data, do NOT make closure recommendations at all. Default to "schedule everyone evenly across all 7 days."

**Commit**: "fix(roster): guard rails against recommending mass closures + min data threshold"

### TASK 10 - Text contrast audit

**Bug**: Multiple modals have invisible text (Override price modal, denomination panel, custom-feature submitted state).

**Fix**: This is a CSS sweep, not one prompt. Walk through every modal and every dark-themed panel checking:
- Body text contrast ratio >= 4.5:1
- Button text contrast ratio >= 4.5:1
- Borders visible

The Pipel light theme from prompt 83 is fine; the issue is the dark dashboard theme where some text was set to a dark gray that disappears against the dark background. Use the existing CSS vars - any text on `--bg-base` should use `--text-primary`, never hardcoded `#222`.

**Commit**: "fix(theme): contrast audit across modals + dark-theme text legibility"

### TASK 11 - Custom features actually write to DB

**Bug**: The "Submit custom feature" button on the custom-features page adds UI rows but may not be persisting to DB.

**Fix**: Read `src/app/dashboard/custom-features/page.tsx` and the `/api/custom-features/submit` route (if it exists). Verify:
1. The Submit button calls the API
2. The API writes to `aria_custom_features` (or wherever)
3. On page refresh, the submitted features appear from the DB read
If any of those steps is broken, fix it.

**Commit**: "fix(custom-features): persist submissions to DB + reload on mount"

### TASK 12 - Drink modifications coverage

**Bug**: Some drinks don't show modifier options.

**Fix**: Audit `pos_product_modifier_groups` to find which products are missing modifier-group associations. For café/coffee businesses, every drink product should be linked to at least the size and milk modifier groups.

For Sip specifically, run a backfill: every product in the Coffee/Tea categories gets the standard café modifier groups attached if not already.

For other industries: skip - they shouldn't have drink modifiers.

**Commit**: "fix(pos-modifiers): backfill modifier groups on all café drink products"



### TASK 14 - Competitor Intelligence: scan writes to one table, page reads from another (CONFIRMED BUG)

**Bug** (verified against live DB): When the owner clicks "Scan Area" on /dashboard/competitor-watch, the scan writes 4 rows to `aria_competitor_watches`. But the Competitor Intelligence overview page reads from `competitor_businesses` and `competitor_snapshots` - both empty. The "no competitor data yet" message is permanent because the page is reading the wrong tables.

The same scan writes nothing to `competitor_snapshots`, `competitor_alerts`, or `aria_competitor_alerts` either - so neither the overview, prices, alerts, nor "manage watches" tab gets populated even though the scan "succeeded."

**Fix**:
1. Audit `src/app/dashboard/competitor-watch/page.tsx` - identify every table it queries.
2. Audit the scan route at `/api/aria/competitor-scan` (or wherever the "Scan Area" button calls) - identify every table it writes to.
3. Reconcile: the scan should populate THE SAME tables that the page reads from. Either rename one set to match the other, or write a small adapter so the scan output mirrors into both.
4. Standardize on ONE set of tables going forward. The six competitor tables (aria_competitor_watches, aria_competitor_alerts, competitor_businesses, competitor_snapshots, competitor_alerts, competitor_price_cache) are obvious legacy debt - propose the cleanest consolidation in the commit message even if you don't refactor all six tables in this commit.
5. Add real error handling: when the scan completes successfully but returns 0 watches found, surface that to the owner ("No competitors found within 5km - try expanding the radius") instead of silently leaving the page empty.

**Commit**: "fix(competitor-watch): scan now writes to same tables the page reads from (was writing to aria_competitor_watches, page was reading competitor_businesses)"

### TASK 15 - Weekly report generation failing 3 times (PUPPETEER + something else)

**Bug**: User reports trying to generate the weekly report 3 times - each fails. The puppeteer Chrome issue from Task 3 is one cause. But likely there's a second failure mode behind it (data preparation, prompt parsing, or PDF buffer handling).

**Fix order**:
1. Complete Task 3 (puppeteer-core + @sparticuz/chromium) FIRST. That removes the Chrome-not-found error.
2. Then attempt to generate a report and trace any remaining failure. The `/api/reports/weekly-generate/route.ts` route should log every step (data fetch, AI summary call, PDF render) so the actual failure point is visible.
3. If the report depends on data that doesn't exist yet (e.g. expects pos_sales to have >= 7 days of data), short-circuit with a friendly "Not enough sales data yet - try again after 7 days of trading" rather than throwing.
4. Make report generation idempotent - calling it twice in a row should not double-bill Anthropic; cache the output for 1 hour.

**Commit**: "fix(reports): weekly-generate works after puppeteer fix + add data-prereq guards + 1h cache"

### TASK 16 - Aria's "no data yet" insight text needs honesty (verification step)

**Bug**: On screens like Cash Flow, Reports, and Intelligence Centre, when the underlying tables have data but the page-specific briefing has none, Aria shows "Not enough data yet - keep using Aria and an insight will appear here." This is partly a CSP-blocking issue (Task 2 covers the weather block), but for other pages it's just that the briefing generator hasn't been triggered.

**Fix**:
1. For every dashboard page that has an "Aria Says" banner, verify the briefing generator actually runs at least once when the page first loads (with empty-state fallback if data is genuinely missing).
2. The empty-state fallback shouldn't say "not enough data" if the data actually exists - it should say "give me a moment, I'm thinking about this." Then trigger a regeneration.
3. If after retry the briefing is still empty, surface the actual reason (insufficient sales history / API error / etc.) instead of the generic "not enough data" text.

This connects to Task 1 (cache invalidation) - both are about the briefing system being accurate.

**Commit**: "fix(aria-says): honest empty states + auto-regenerate on page load if briefing missing"


## Final pass

After all 12 tasks ship:

**TASK 13 - Sentry verification**

- Confirm Sentry is initialized in production
- Throw a test error from a button on a hidden /dashboard/debug page
- Verify it appears in your Sentry dashboard within 60 seconds
- If not: fix the Sentry init

**Commit**: "chore(sentry): verify error capture is reaching the Sentry dashboard"

## Rules

- Each task is its own commit (or several commits for sweeps)
- npx tsc --noEmit + npm run build pass before each commit
- Do NOT try to do all 13 tasks in one session - run, push, take a break, run again
- After every commit: git push origin main
- This prompt EXPLICITLY does not add new features. Resist the temptation.

## If limit runs low

Priority order (revised):
1. TASK 1 (briefing cache - the invoice-says-outstanding-after-paid bug)
2. TASK 14 (competitor scan/read table mismatch - confirmed bug, easy fix)
3. TASK 3 (Puppeteer + Task 15 weekly report - blocks PDF reports entirely)
4. TASK 2 (CSP - blocks weather + future external APIs)
5. TASK 6 (error surfacing - everything else depends on knowing what's broken)
6. TASK 9 (roster guard rails - blocks customer demos)
7. TASK 16 (Aria "no data" honesty - small but visible)
8. TASK 7 (resolveBusinessId sweep)
9. TASK 8 (integration state sweep)
10. TASK 10 (text contrast - visible polish)
11. TASK 4 (theme persistence - small polish)
12. TASK 5, 11, 12, 13 in any order

Finish current commit, push, STOP, report.
