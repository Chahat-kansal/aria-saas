# CANON-MIGRATE-1 — Migrating Inline Business-ID Resolvers Onto the Rail (Batch 1)

Follow-up to CANON-RAIL-1, which built `withBusinessContext()` (composing `withErrorCapture`,
resolving+verifying `business_id` via `resolveOwnerBusinessId()`) and the CI guard that blocks new
inline resolvers, then proved the pattern on 7 files. This sprint migrates the first real batch off
the backlog — **34 files, 47 handlers** — and inventories the rest so the next batch is a
pick-up-and-go. **This is batch 1 of N. The migration is not finished.**

No divergence from CANON-RAIL-1-REPORT.md was found; this sprint followed its exact wrapper shape
and the "match the response contract exactly or leave it alone" rule from its own 3-file partial
migrations (`pos/production-plan`, `aria/roster`).

---

## Part 1 — the honest backlog inventory

Found via `grep -rlE` across `src/app/api` for a local `getBid`/`getBusinessId`/`getBiz` function
definition: **333 files**. All 333 were read in full (8 parallel batches) and every exported
HTTP handler classified individually — a single file can have handlers in different buckets.

**604 handlers classified, across 333 files:**

| Bucket | Handlers | Definition |
|---|---|---|
| **A — clean swap** | **254** | Auth/no-business responses are the exact `{error:'Unauthorized'},401` / `{error:'No business'},400` shape, resolves only the caller's own business, no pre-check dependency on `supabase`/`user`/`bid`. |
| **B — behavior-divergent** | **344** | Migrating as-is would change an observable response (status/shape/message) or add/remove a gate. Needs a per-route decision, not a blind swap. |
| **C — not a fit** | **6** | No "resolve caller's own business" primitive applies at all — see list below. |

### Bucket B — the recurring shapes (so the next sprint doesn't have to re-derive these)

Aggregated across all 8 classification passes, most-common first:

1. **"No business" returns 200 with an empty/default payload** (`{items:[]}`, `{connected:false}`,
   `{config:null}`, etc.) instead of `{error:'No business'},400` — the single largest pattern by far,
   well over half of all Bucket B handlers. A GET that degrades gracefully for a business-less caller
   rather than erroring.
2. **"No business" uses status 404 instead of 400** (message text otherwise matches) — a large
   secondary cluster (`gift-cards`, `hardware-devices`, `classifications`, `customer-groups`,
   `receipt-templates`, `menu-config`, and others).
3. **Message-text near-misses** — `'No business found'` or `'No active business'` instead of the
   exact `'No business'` string (`products`, `sales`, `sessions`, `tables`, `timesheets`,
   `conversation-summaries`, `council-runs`, `memory`). One string-edit away from Bucket A, but a
   real (if trivial) response-body change today.
4. **Client-supplied `business_id` + separate ownership verification** — a genuinely different
   primitive from "resolve my own business" (`activity-narrative`, `badge-counts`,
   `business-health-quick`, `command`, `explain-metric`, `grn-assist`, `nps`, `page-insight`,
   `memory/seed-onboarding`, `pos/customers`, `pos/mobile-session`, `pos/outlet-transfers`,
   `recipes`, `warehouse/lots`, and others) — occurs often enough (9+ instances in `aria/*` alone)
   that it looks like a second, smaller canonical wrapper (`withVerifiedBusinessContext`, accepting
   a client id and checking ownership) might be worth its own rail in a future sprint, rather than
   folding each into `withBusinessContext`.
5. **OAuth `connect`/`callback` GETs redirect on no-user instead of returning JSON 401**
   (`integrations/kounta/connect`, `lightspeed-x/connect`, `shopify/connect`) — a UI-navigation
   route, not an API consumer; the wrapper's JSON 401 would break the redirect flow.
6. **Missing business-scoping entirely on some PATCH/DELETE handlers** — `loyalty/reward-rules`,
   `loyalty/tiers` (PATCH/DELETE update/delete by `id` alone, no `.eq('business_id', bid)` at all).
   These are pre-existing cross-business gaps predating this sprint, not response-shape mismatches —
   flagged here for a security follow-up, not folded into this migration.
7. **Pre-auth/pre-business gates that run first** — Stripe/Kounta webhook signature checks, cron
   `verifyCronAuth`, `isKountaConfigured()` 503s, a `source`-param validity check — the gate's own
   early-return would be reordered behind auth if wrapped naively.
8. **Dual-purpose owner+public handlers in one function** — `loyalty/preload`, `loyalty/tier-perks`,
   `loyalty/whatsapp`, `loyalty/challenges`, `stripe` POST (webhook + billing actions in one
   handler) — the non-owner branch must stay reachable without session auth.

### Bucket C — the full list (6 handlers, so future sprints stop re-flagging them)

| Handler | Why it's not a fit |
|---|---|
| `aria/compliance` PATCH | No business scoping used at all — updates `compliance_items` by `id` alone. Pre-existing gap, not a shape mismatch; a security item, not a migration candidate. |
| `pos/expiry-alerts` PATCH | No business resolution logic exists in the handler at all. |
| `pos/expiry-alerts` POST | Same — relies on RLS per its own inline comment, never calls `getBid`. |
| `social/inbox` PATCH | No business scoping on the update (`id` alone). Pre-existing gap. |
| `social/library` DELETE | No business scoping on the delete (`id` alone). Pre-existing gap. |
| `social/media` DELETE | Verifies ownership via the **target row's own** `business_id`, not the caller's — a resource-ownership check, a different primitive than "resolve my own business." |

Four of these six (`compliance` PATCH, both `expiry-alerts` handlers, `social/inbox` PATCH,
`social/library` DELETE) are genuine pre-existing missing-business-scope gaps, not just
migration-shape mismatches — worth a dedicated security follow-up, explicitly out of scope for a
migration sprint per CANON-RAIL-1's own precedent (note, don't fix).

---

## Part 2 — this batch: 34 files, 47 handlers migrated

Selected as a representative, reviewable cross-section of Bucket A spanning `aria/*`, `dashboard/*`,
`instore/*`, `integrations/*`, `inventory/*`, `loyalty/*`, and `pos/*` — not all of Bucket A (207
handlers remain), not a token handful.

| File | Handlers migrated |
|---|---|
| `aria-os/status` | GET |
| `aria/ask/action` | POST |
| `aria/ask/rollback` | POST |
| `aria/ask/upload` | POST |
| `aria/daily-narrative` | POST |
| `aria/delivery-prediction` | POST |
| `aria/dynamic-pricing` | GET, POST, PATCH |
| `aria/insights/[id]/approve` | POST |
| `aria/insights/[id]/dismiss` | POST |
| `aria/inventory-insight` | POST |
| `aria/quote-followup` | POST |
| `aria/reorder-settings` | GET, POST |
| `aria/shift-analysis` | POST |
| `aria/skills` | GET, POST, PUT, DELETE |
| `aria/spend` | GET *(see note below)* |
| `aria/stocktake-intelligence` | POST |
| `aria/studio/upload` | POST |
| `aria/supplier-margin-intelligence` | POST |
| `aria/supplier-reorder` | POST |
| `aria/supplier-savings` | POST |
| `dashboard/ai-usage` | GET |
| `dashboard/hub-analytics` | GET |
| `dashboard/hub-status` | GET |
| `dashboard/inbox` | GET |
| `dashboard/inbox/summary` | GET |
| `dashboard/kiosk-share` | GET, POST |
| `instore/config` | GET, POST |
| `instore/insights` | GET |
| `integrations/shopfront/import` | POST |
| `integrations/shopify/sync` | POST |
| `integrations/status` | GET |
| `inventory/reports` | GET, POST, DELETE |
| `loyalty/earn` | POST |
| `pos/ad-campaigns` | GET, POST, PATCH, DELETE |

**Note on `aria/spend`**: this route had **no `withErrorCapture` wrapping at all** before this
sprint (a bare `export async function GET()`). Moving it onto `withBusinessContext` additionally
gains error-capture/Sentry reporting on an unhandled exception — a pure addition per RULE 0 (extend,
never remove); the happy-path response is byte-identical.

For every file, the same discipline as CANON-RAIL-1: only handlers whose auth/no-business response
already matched the standard shape were touched; nothing else in the handler body was edited beyond
removing the boilerplate the wrapper now supplies.

---

## Part 3 — proof, not assertion

**Business-id resolution, verified against real data.** Simulated both the deleted local `getBid()`
logic and the new `resolveOwnerBusinessId()` logic directly via SQL against Sip Café's real owner:

```
old_getBid_logic                 → ff5055a0-c351-4ada-817a-1804961035f3
new_resolveOwnerBusinessId_logic  → ff5055a0-c351-4ada-817a-1804961035f3   (identical)
```

**Auth/no-business responses unchanged** — confirmed by direct code inspection of all 34 diffs: every
migrated handler's business-logic body is untouched except for the removed
auth-check/`getBid()`-call/no-business-check preamble, which the wrapper now performs before the
handler is ever invoked. Representative sample (5, including one dynamic-route param handler, one
previously-unwrapped route, and one 4-handler file):

- `aria-os/status` GET — single handler, full local `getBid()` deleted, body untouched.
- `aria/insights/[id]/approve` POST — dynamic-route `{ params }` handling preserved unchanged as the
  2nd positional arg; `businessId`/`supabase` now arrive as the 3rd arg.
- `aria/spend` GET — the one route with no prior `withErrorCapture` at all (see Part 2 note).
- `aria/skills` — 4 handlers (GET/POST/PUT/DELETE), all migrated, local `getBid()` deleted once.
- `pos/ad-campaigns` — 4 handlers (GET/POST/PATCH/DELETE), all migrated, local `getBid()` deleted once.

**Guard still passes on the real diff** — `npx tsx scripts/canon-rail-guard.ts --working-tree`
reports `no new canonical-path violations introduced. Pass.` against this sprint's actual changes
(removing inline resolvers doesn't trip a guard that only blocks *additions*).

**`withErrorCapture`'s own callers are unaffected** — `with-error-capture.ts`'s diff for this sprint
is empty (it was only touched in CANON-RAIL-1); no route still using plain `withErrorCapture` had
its import or behavior changed.

**Build gate**: `npx tsc --noEmit` — 0 errors. `npm run build` — succeeded (exit 0), full production
build. Vercel function count unaffected (no new route files created, only existing ones edited) —
still within the ≤22-function constraint.

---

## Honest count — what changed, what's left

| | Count |
|---|---|
| Files on `withBusinessContext` before this sprint (CANON-RAIL-1) | 7 |
| Files migrated this sprint | **34** |
| **Files on the rail now** | **41** |
| Bucket A handlers remaining (ready for the next batch, no further triage needed) | **207** |
| Bucket B handlers remaining (need a per-route decision — response-shape reconciliation or an explicit "leave it" call) | **344** |
| Bucket C handlers (stay off the rail by design — 4 of 6 are pre-existing security gaps worth a dedicated follow-up) | **6** |
| Distinct files still containing at least one inline resolver | **299** |

**This is batch 1 of N, not the finish.** 207 more Bucket-A handlers are inventoried and
ready to migrate with the identical, now-proven-twice pattern — the next sprint can start directly
from this report's classification tables rather than re-reading all 333 files. The 344 Bucket-B
handlers are a separate, harder follow-up requiring an explicit choice per route (change the
response shape to match the standard, or formally accept the divergence and leave it on its own
local resolver) — not a blind swap. Bucket C's 4 real security gaps (missing business-scope on
`compliance` PATCH, both `expiry-alerts` handlers, `social/inbox` PATCH, `social/library` DELETE)
are noted, not fixed, per this sprint's read-only-for-that-part scope.
