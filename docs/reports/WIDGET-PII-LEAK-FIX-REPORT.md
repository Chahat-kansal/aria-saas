# WIDGET-PII-LEAK-FIX — closing the unverified-identity-lookup leak class (AG-W0)

## PRE-FLIGHT — every public route checked before any fix

Per the task's own framing ("the leak class matters more than the one instance"), every file
under `src/app/api/public/**/route.ts` (30 files) plus every other file matching a
`pos_customers` email/phone lookup pattern repo-wide was read in full — not grepped for a
snippet — before any code changed.

### Leaking (fixed this sprint)

| Route | Handler | Query | Gate before this fix | Data returned |
|---|---|---|---|---|
| `src/app/api/public/widget/chat/route.ts` | POST | `pos_customers` `.or('email.eq.X,phone.eq.X')` on visitor-typed text, then `loyalty_tiers` if a tier existed | **none** — fully public widget, no session concept at all | name, points, tier, perks — plus a distinct "no membership found" message (found/not-found oracle) |
| `src/app/api/public/instore/loyalty/route.ts` | POST | `pos_customers` `.eq('email', typed)` | `hasValidKioskSession(business_id)` — proves physical presence at *a* kiosk for this business, not ownership of the typed email | name, points, stamps, personalized welcome message, `is_new` boolean (found/not-found oracle) |
| `src/app/api/public/instore/chat/route.ts` | POST | `pos_customers` `.eq('email', typed)` | `ariakiosk_${business_id}` cookie only — same weak gate as above | name, points, stamps |

All three share the identical shape: a public/semi-public caller supplies a raw contact string,
the server resolves it against `pos_customers` with no proof the caller owns that identifier, and
returns identity-bearing data (or, at minimum, a found-vs-not-found signal, which the task's own
definition treats as leak-worthy on its own).

Neither of the two kiosk routes' gate (`hasValidKioskSession` / the raw cookie check) verifies
anything about the *email being typed* — they only prove the device is on a legitimate in-store
session for that business. A customer standing at a kiosk could type someone else's email and get
their loyalty data back.

### Checked, not vulnerable — same class, already correctly gated

- `src/app/api/public/loyalty/[business_id]/balance/route.ts` — already fixed under
  **SECURITY-P1 (C-02)**: requires `getCxSession(req, businessId)` and checks the session's own
  phone matches the one being queried. This is the precedent this sprint's `instore/loyalty` fix
  cites directly.

### Checked, different vulnerability class — noted, not in this sprint's scope

- `src/app/api/public/order-track/[orderNumber]/route.ts` — keyed by order number, not a contact
  string; returns order status/total, not personal identity data. Sequential order-number
  enumeration is a related-but-distinct concern, not fixed here.
- `src/app/api/public/loyalty/[business_id]/enrol/route.ts` — on a duplicate phone, returns a
  generic `409 "A customer with this phone number already exists"`. This is a materially weaker
  instance of the same oracle class (existence-only, zero identity fields: no name/points/tier)
  and is a genuine write/enrol action, not a read lookup — recommending a follow-up sprint to
  flatten this to a non-committal response too, but left untouched here to keep this commit
  focused on the three full-identity leaks.
- `src/app/api/public/kiosk/loyalty-scan/route.ts` → `resolveCustomerCode()`
  (`src/lib/loyalty/resolve-code.ts`) — resolves a **possessed** 10-digit `short_code` or UUID
  from `loyalty_identity`, not a typed contact string. A different, bearer-token-style
  authentication shape (the code must be shown/scanned, not guessed) — not the same leak class.

### Checked, out of scope — owner/internal/cron-authed, not public

- `src/app/api/pos/customers/route.ts`, `src/app/api/customers/route.ts`,
  `src/app/api/customers/import/square/route.ts` — all gated by `createServerSupabaseClient()` +
  an owner session (`withErrorCapture` + local business-id resolver keyed to `userId`).
- `src/app/api/cron/loyalty-winback/route.ts` — its only email/phone match is a null-filter
  (`.or('phone.not.is.null,email.not.is.null')`), not a lookup by a caller-supplied string; also
  cron-only, not reachable publicly.

## FIX

Three fixes, one per leaking route, matching the task's stated preference order:

**1. `public/widget/chat/route.ts` — option (a), removed entirely.** A public widget has no
session/ownership concept to check a typed email/phone against at all, so there's no safe way to
resolve identity here. The `pos_customers`/`loyalty_tiers` queries are gone; if the visitor's
message contains a contact string, the model is instructed to redirect them to the verified
loyalty sign-in flow or a staff member instead of attempting a lookup.

**2. `public/instore/chat/route.ts` — option (a), removed entirely.** Same reasoning: this was a
redundant, weaker-gated duplicate of the dedicated enrol endpoint below. The `pos_customers` query
is gone; the model gets a generic instruction instead of `memberContext` built from a live lookup.

**3. `public/instore/loyalty/route.ts` — option (c), response flattened.** This route's job is
genuinely find-or-create (it must dedupe against an existing email before inserting), so the
lookup itself stays, but the **response** no longer depends on the outcome: `is_new`,
`customer_id`, `name`, `points`, `stamps`, `stamps_left`, and the personalized welcome message are
all removed. Both branches (new customer / existing match) now return the exact same
`{ success: true, welcome_message: "Thanks! You're all set — ask a team member if you'd like to
check your rewards balance." }` — closing the found-vs-not-found oracle as well as the data leak.
The now-unused `pos_loyalty_config` fetch and its derived `stampsToReward`/`programType` were
removed as dead code.

**Also, on `instore/loyalty` (the one route that kept a live lookup):**
- Added a lookup-scoped rate limit — `rateLimit('instore-loyalty:' + clientIp + ':' + business_id, 15, 60)`
  (15/min per IP+business) — on top of the endpoint already being gated by `hasValidKioskSession`.
- Added an `activity_log` insert (`action_type: 'instore_loyalty_lookup'`, non-blocking) recording
  every lookup/enrol attempt, per the task's audit-trail requirement.

`widget/chat` and `instore/chat` no longer perform any lookup at all, so there is nothing left to
rate-limit or log for those two — removing the query is itself the strongest form of closing the
leak (per the task's own preference ordering, (a) beats (b)/(c)).

## Widget context stays public-safe (WIDGET-PERSONA-1)

Confirmed as part of this fix, not just assumed: `widget/chat/route.ts`'s context still only loads
`businesses` (name/industry/city), `pos_products` (public catalogue), and a 30-day best-sellers
aggregate — no margins/costs, no other-customer data, no owner-only tables. Removing the member
lookup makes this boundary *stronger*, not weaker.

## VERIFY

No live browser/session available in this environment, so verification is by direct code-path
reading of the diff (not a live HTTP call):

- **`widget/chat`**: the `pos_customers`/`loyalty_tiers` calls no longer exist in the file at all
  — grepped the file post-edit, zero references to either table remain. A known-good email in the
  visitor's message can no longer produce any identity-bearing text; the response is identical
  regardless of whether the email matches a real customer (both cases hit the same generic
  redirect instruction, gated only by whether the message *looks like* a contact string was
  mentioned — never by whether one resolves to a real row).
- **`instore/chat`**: same check — the `pos_customers` query is gone, confirmed via grep of the
  post-edit file. Identical outcome for known vs unknown emails.
- **`instore/loyalty`**: read the full post-edit handler top to bottom — every code path that
  returns `200` now returns the exact same JSON literal
  (`{success:true, welcome_message:"Thanks! You're all set…"}`), independent of the `existing`
  lookup's result. The underlying `pos_customers` upsert and `instore_conversations` linking are
  unchanged (enrolment still works correctly for legitimate new/returning kiosk customers) — only
  the caller-visible response was flattened.

## Build gate

- `npx tsc --noEmit` — 0 errors.
- `NODE_OPTIONS="--max-old-space-size=6144" npx next build` — see commit for result.

## Routes fixed (summary)

1. `src/app/api/public/widget/chat/route.ts`
2. `src/app/api/public/instore/chat/route.ts`
3. `src/app/api/public/instore/loyalty/route.ts`

Follow-up recommended, not done here: flatten `public/loyalty/[business_id]/enrol/route.ts`'s
409-on-duplicate-phone response to a non-committal shape for full consistency with this sprint's
"no found/not-found distinction" standard.
