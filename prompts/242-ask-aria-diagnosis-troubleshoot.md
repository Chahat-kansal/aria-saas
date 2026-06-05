# CLAUDE CODE PROMPT — Ask Aria: Dashboard Problem Diagnosis (Health Check + Sentry)

Paste this whole file to Claude Code. One commit per phase. Build gate before every commit. RULE 0: never remove or weaken anything existing. `pwd` = `C:\Users\kansa\aria-saas-audit`.

---

## THE PROBLEM BEING SOLVED

Right now if a user says "my dashboard is broken" or "the POS screen won't load," Aria can only guess based on its knowledge of the codebase. It cannot:
- Know which routes are actually returning errors RIGHT NOW
- Pull live Sentry issues affecting the user
- Tell the user specifically what is broken and why

After this build, when a user reports a problem, Aria will:
1. Ping the 8 most critical dashboard routes and report which ones are failing
2. Pull the last 5 unresolved Sentry errors from production
3. Give the user a plain-English diagnosis: "Your POS tab is broken — the pricing route is returning a 500 error. This is a known issue [Sentry link]. Here's what's happening and what you can do."

---

## CONTEXT — verified from live code before writing this prompt

Read these files fully before writing anything:
- `src/app/api/aria/ask/route.ts` — the main Ask Aria route (1089 lines)
- `src/lib/aria/ask/troubleshoot.ts` — existing troubleshoot context (49 lines, checks hardware/sync/last-sale only)
- `src/app/api/health/deep/route.ts` — existing deep health check (checks Supabase, Redis, Anthropic key)
- `src/app/api/aria/business-health-quick/route.ts` — business data health (161 lines)
- `sentry.server.config.ts` — Sentry configured with `process.env.SENTRY_DSN`

### What already exists (DO NOT REBUILD):
- `buildTroubleshootContext()` + `buildTroubleshootAddendum()` in `troubleshoot.ts` — checks hardware devices, sync errors, last sale. EXTEND, don't replace.
- `/api/health/deep` — checks Supabase/Redis/Anthropic. NOT dashboard-route-aware.
- Intent routing: `troubleshoot` intent already routes to Sonnet + extended thinking + calls `buildTroubleshootContext`. The new data goes into that same addendum.

### Key architectural fact:
Aria runs server-side. It CANNOT directly ping dashboard routes from inside the Next.js server (circular calls). The health check must ping the PRODUCTION URL (`https://www.ariaos.site/api/...`), not localhost.

---

## PHASE 1 — New route: `/api/aria/troubleshoot-context/route.ts`

This is the single source of truth for "what is broken right now." It is called by the troubleshoot addendum builder (Phase 2), NOT directly by users.

**Auth:** supabase.auth.getUser() → if no user, return empty (non-fatal — the ask route already has auth).

**What it does — TWO parallel checks:**

### Check A: Route health pings

Ping these 8 routes in parallel with a 4-second timeout each. Use `fetch()` with `AbortSignal.timeout(4000)`. The base URL = `process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.ariaos.site'`. For routes requiring auth, just check the HTTP status (a 401 is "reachable", a 500/503/timeout is "broken").

```ts
const CRITICAL_ROUTES = [
  { name: 'POS terminal',        path: '/api/pos/products',           method: 'GET' },
  { name: 'Sales data',          path: '/api/pos/sales',              method: 'GET' },
  { name: 'Ask Aria',            path: '/api/aria/ask',               method: 'GET' }, // just HEAD check
  { name: 'Agent council',       path: '/api/agents/council/status',  method: 'GET' },
  { name: 'Dashboard overview',  path: '/api/aria/business-health-quick', method: 'GET' },
  { name: 'Staff',               path: '/api/staff',                  method: 'GET' },
  { name: 'Inventory',           path: '/api/inventory',              method: 'GET' },
  { name: 'Deep health',         path: '/api/health/deep',            method: 'GET' },
]

interface RouteHealth {
  name: string
  path: string
  status: 'ok' | 'error' | 'timeout' | 'unknown'
  httpStatus?: number
  ms: number
  note?: string
}
```

For each route:
- `ok` = HTTP 200 or 401 (reachable, auth just blocks anonymous)
- `error` = HTTP 500, 502, 503, 504
- `timeout` = fetch threw or AbortError
- `unknown` = any other status

**IMPORTANT:** wrap each ping in try/catch independently — one failing route must never crash the others. Use `Promise.allSettled` not `Promise.all`.

### Check B: Sentry recent errors

Pull the last 5 unresolved production errors from Sentry using the Sentry API directly.

**Step 1 — find the org slug.** Before writing this code:
1. Check `process.env.SENTRY_ORG` — if set, use it.
2. Check `process.env.SENTRY_DSN` — the org slug is embedded in the DSN URL: `https://[key]@o[org_id].ingest.sentry.io/[project_id]`. Parse the org_id from here.
3. Alternatively, call `https://sentry.io/api/0/` with `Authorization: Bearer ${SENTRY_AUTH_TOKEN}` to discover the org.
4. Check Vercel env vars for `SENTRY_ORG` — if it's not there, add it (ask the user to add it from their Sentry org settings).

**The Sentry API call:**
```ts
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN // must exist in Vercel env
const SENTRY_ORG = process.env.SENTRY_ORG // must exist in Vercel env

// If either is missing, skip Sentry check gracefully
if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG) {
  return { sentry_issues: [], sentry_note: 'SENTRY_AUTH_TOKEN or SENTRY_ORG not configured' }
}

const sentryRes = await fetch(
  `https://sentry.io/api/0/organizations/${SENTRY_ORG}/issues/?query=is:unresolved&environment=production&limit=5&sort=date`,
  {
    headers: { Authorization: `Bearer ${SENTRY_AUTH_TOKEN}` },
    signal: AbortSignal.timeout(5000),
  }
)
```

Parse the response into:
```ts
interface SentryIssue {
  id: string
  title: string
  culprit: string     // e.g. "src/app/api/pos/sales/route.ts"
  level: string       // 'error' | 'warning' | 'fatal'
  count: string       // occurrence count
  lastSeen: string    // ISO timestamp
  permalink: string   // link to the issue in Sentry
}
```

Wrap in try/catch — Sentry being unavailable must never break the response.

### Response shape:
```ts
{
  route_health: RouteHealth[]
  broken_routes: RouteHealth[]        // filtered: status === 'error' | 'timeout'
  all_routes_ok: boolean
  sentry_issues: SentryIssue[]
  sentry_note?: string                // if Sentry unavailable
  checked_at: string                  // ISO timestamp
}
```

**Commit:** `feat(troubleshoot): /api/aria/troubleshoot-context — route health pings + Sentry issues`

**Acceptance:** call the route manually (after auth), confirm it returns route health statuses and Sentry issues within 6 seconds. Confirm one route being down shows `status: 'error'`. Confirm Sentry auth failure returns gracefully.

---

## PHASE 2 — Extend `buildTroubleshootContext` and `buildTroubleshootAddendum`

**File:** `src/lib/aria/ask/troubleshoot.ts`

### Extend `TroubleshootContext` interface:
```ts
// ADD to existing interface (do not remove hardware_devices, recent_sync_errors, last_sale_at):
route_health?: RouteHealth[]
broken_routes?: RouteHealth[]
all_routes_ok?: boolean
sentry_issues?: SentryIssue[]
sentry_note?: string
```

### Extend `buildTroubleshootContext`:
Add a call to the new troubleshoot-context route at the END of the existing function (after hardware/sync/last-sale queries). Use `supabaseAdmin` service role to get a valid session token to pass to the route, OR call the Sentry API and route pings directly in this function (avoid the HTTP round-trip if possible — just inline the logic from Phase 1 or import it as a shared util).

**Better approach — extract Phase 1 logic into a shared util:**
Create `src/lib/aria/ask/app-health.ts` that exports:
```ts
export async function checkAppHealth(): Promise<AppHealthResult>
```
Both `/api/aria/troubleshoot-context/route.ts` (Phase 1) and `buildTroubleshootContext` import from here.

### Extend `buildTroubleshootAddendum`:
Add after the existing device status / sync error / last sale block:

```ts
// Route health section
if (ctx.broken_routes && ctx.broken_routes.length > 0) {
  addendum += `\n\n## BROKEN ROUTES (confirmed failing right now)\n`
  addendum += ctx.broken_routes.map(r =>
    `- ${r.name} (${r.path}): ${r.status.toUpperCase()}${r.httpStatus ? ` HTTP ${r.httpStatus}` : ''}${r.note ? ` — ${r.note}` : ''} (${r.ms}ms)`
  ).join('\n')
  addendum += `\n\nThese routes are confirmed failing. Lead with this in your diagnosis. Give specific likely causes based on the route path and your knowledge of the codebase.`
} else if (ctx.all_routes_ok === true) {
  addendum += `\n\n## Route health: ALL 8 CRITICAL ROUTES RESPONDING NORMALLY`
}

// Sentry section
if (ctx.sentry_issues && ctx.sentry_issues.length > 0) {
  addendum += `\n\n## LIVE SENTRY ERRORS (production, unresolved)\n`
  addendum += ctx.sentry_issues.map(i =>
    `- [${i.level.toUpperCase()}] ${i.title}\n  File: ${i.culprit}\n  Seen: ${i.count} times, last ${new Date(i.lastSeen).toLocaleString('en-AU')}\n  Link: ${i.permalink}`
  ).join('\n')
  addendum += `\n\nCross-reference these errors with the user's reported problem. If a Sentry error matches the broken route, explain the connection specifically. Include the permalink so the user can check it.`
}
```

**In the ask route** (`src/app/api/aria/ask/route.ts`), the existing troubleshoot block at line ~727 already calls `buildTroubleshootContext` — no change needed there. The extended function returns richer data automatically.

**Commit:** `feat(troubleshoot): extend troubleshoot context with route health + Sentry errors`

---

## PHASE 3 — System prompt additions for troubleshoot intent

**File:** `src/app/api/aria/ask/route.ts`

Find the VERCEL LOG READING section (~line 687). Add BEFORE it:

```
DASHBOARD PROBLEM DIAGNOSIS — HOW TO RESPOND:
When intent is 'troubleshoot' and the addendum contains BROKEN ROUTES or SENTRY ERRORS:
1. Lead immediately with what is confirmed broken: "Your [route name] is confirmed failing right now."
2. Explain what that route does in plain English (not tech jargon): "This is the route that loads your POS product list."
3. Give the most likely cause based on the error + your knowledge of the codebase. Be specific — mention the actual file path, table name, or common failure mode.
4. Tell them what to do: either "this usually fixes itself in a few minutes" OR "this needs a code fix — here's what's wrong."
5. Include the Sentry link if available so they can share it with their developer.
6. If ALL routes are ok but the user says something is broken: explain that the backend is healthy, so this is likely a browser/cache issue — ask them to try hard-refresh (Ctrl+Shift+R) or incognito mode.

NEVER say "I can't see your dashboard" when you have live route health data.
NEVER say "contact support" when you can give a specific diagnosis.
ALWAYS distinguish: backend broken (route returning 500) vs frontend broken (route ok but UI bug) vs user error (route ok, correct usage).
```

**Commit:** `feat(troubleshoot): system prompt — specific diagnosis instructions for broken routes`

---

## PHASE 4 — Env vars needed (flag to owner, don't skip)

Check Vercel env vars for the project (`prj_ttjBzoTEUmYGnhhim8mX23GiJth7`, team `team_oaGssQvAGB4fZAcZPhncT3bf`) and confirm:

1. **`SENTRY_AUTH_TOKEN`** — a Sentry internal integration token with scope `event:read` + `issue:read`. If missing: owner must create one at sentry.io → Settings → Auth Tokens → Create Internal Integration. Flag clearly in the commit body.
2. **`SENTRY_ORG`** — the org slug from sentry.io URL (e.g. `aria-saas` or `chahat-kansal`). Check if already in Vercel env. If missing: owner finds it in sentry.io → Settings → General → Organization Slug. Flag in commit body.
3. **`NEXT_PUBLIC_APP_URL`** — should already be `https://www.ariaos.site`. Confirm it's set (the route pings use this as the base URL).

If any are missing, write the code with graceful fallbacks (Sentry section skips cleanly, route pings use `https://www.ariaos.site` as the hardcoded fallback) but FLAG clearly in the commit body: "ACTION REQUIRED: add SENTRY_AUTH_TOKEN and SENTRY_ORG to Vercel env vars."

**Commit:** `feat(troubleshoot): verify/document required env vars (SENTRY_AUTH_TOKEN, SENTRY_ORG)`

---

## PHASE 5 — VERIFICATION

1. `npx tsc --noEmit` + `npm run build` pass.
2. Ask Aria "why is my POS not loading?" — the response should lead with specific route health results, not generic advice.
3. With all routes healthy, ask "something seems broken" — response should confirm backend is healthy and suggest browser/cache fix.
4. Confirm `buildTroubleshootAddendum` still includes the original hardware/sync/last-sale content (upgrade-only).
5. Confirm the route health check completes within 6 seconds total (4s timeout × parallel = ~4s max).
6. Confirm Sentry being unavailable (wrong token) returns a graceful degraded response, not a crash.
7. Confirm no console.log with user data or PII in the route health logs.

---

## WHAT THIS DOES NOT DO (do not attempt)

- Does not give Aria write access to Sentry (read-only: `event:read`, `issue:read`)
- Does not auto-fix the broken route — Aria explains and points to the Sentry link
- Does not replace the existing hardware/sync troubleshoot context — it adds to it
- Does not expose the troubleshoot-context route publicly — it requires auth

## ORDER
Phase 1 (shared util + route) → Phase 2 (extend troubleshoot context) → Phase 3 (system prompt) → Phase 4 (env vars) → Phase 5 (verify). Stop and flag if live code contradicts this prompt.
