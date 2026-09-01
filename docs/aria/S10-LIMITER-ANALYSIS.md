# THE LIMITER — FAIL-OPEN, FAIL-CLOSED, AND WHAT EACH KEY VARIES BY

**S10 phase 3 · 1 Sep 2026. Report only — no auth behaviour was changed.** Authorisation is on the
NEVER-unattended list; this establishes the facts and proposes the change. The decision is Chahat's.

---

## THE HEADLINE

> **An Upstash outage locks every owner out of their own business.**
>
> `/api/auth/guard` is called by the login page *before* it calls Supabase. If the guard returns
> 429, `AuthScene.tsx:120-121` sets the error and returns — `signInWithPassword` is never reached.
> When Redis is unreachable the guard returns 429 on the **first** call, for **every** caller. No
> owner, no staff member, and no admin can log in until Upstash comes back.
>
> This is not hypothetical: it is exactly what CI has been doing for the last four runs, and the
> only reason it read as a test problem is that it happened to a test.

---

## CORRECTION 1 — "a product decision per route" describes what SHOULD be, not what IS

The sprint's decision table says fail-open vs fail-closed *"is a product decision per route, not one
global default"*. **Today it is one global default**, decided in `src/lib/rate-limit.ts` and not
overridable anywhere:

| condition | behaviour | where |
|---|---|---|
| Redis env vars absent **and** `NODE_ENV==='production'` | **fail CLOSED** — 429 | `rate-limit.ts:57-61`, `:96-100` |
| Redis env vars absent **and** not production | fail OPEN — allow | `rate-limit.ts:62`, `:102` |
| Redis configured but **unreachable at call time** | **THROWS → route 500s** | `rate-limit.ts:64` (unwrapped `await rl.limit(key)`) |

**No route overrides this.** All 13 `limit()` callers and all 8 `checkRateLimit()` callers take
whatever the module decides. So "per route" is the proposal, not the present tense.

**The third row is the one nobody has named before.** There are three behaviours, not two. A
transient Upstash outage *after* successful init does not fail closed — it throws, unhandled, and
the route 500s. And on the login path that still presents to the owner as *"Too many attempts"*,
because `checkAuthGuard` treats any non-`ok` response as a rate-limit refusal
(`AuthScene.tsx:19-21`). **Two different infrastructure failures, one misleading message.**

The fail-closed choice itself is deliberate and well-reasoned — SECURITY-P1 (M-01) made it so
precisely because the legacy path failed *open* and silently stripped rate limiting from
production. That reasoning is right for money and PII. The gap is that it was applied uniformly.

---

## CORRECTION 2 — the key DOES vary per caller, and `::1` is not what it looks like

The sprint reads `auth-guard:login:::1` as *"an empty identifier plus a localhost IP"*. **It is not.**
The key is built as `` `auth-guard:${action}:${ip}` `` (`guard/route.ts:33`), so it reads:

```
auth-guard : login : ::1
                     ^^^ IPv6 loopback, in full
```

`::1` is the whole IP — the IPv6 form of `127.0.0.1`. The double colon is the address's own
zero-compression, not an empty field. **I have checked this and the key varies correctly per
caller.** One person tripping the limit does not affect anyone else on that route.

**But there is a real shared-bucket problem, in two other places:**

| where | key | consequence |
|---|---|---|
| `public/instore/chat/route.ts:63` | `instore-chat:` + **business_id only** | 60/hour **for the whole venue**. One customer in the café can exhaust in-store chat for every other customer for an hour. |
| `lib/api/with-rate-limit.ts:9` | `x-user-id` header → `x-forwarded-for` → **`'anon'`** | `x-user-id` is **client-supplied and spoofable** (evades your own limit); when both headers are absent every caller shares one `'anon'` bucket. |

There is also a milder version of the same shape: every IP-keyed route falls back to the literal
`'unknown'` when neither `x-forwarded-for` nor `x-real-ip` is present. On Vercel those headers are
always set, so this is latent rather than live — but it is one bucket for the world if it ever fires.

---

## THE TABLE — route → fail behaviour → key composition

Fail behaviour is identical for every row (there is only the global default), so the column that
actually differentiates them is **what an outage costs**.

| route | key varies by | window | cost of a fail-closed outage |
|---|---|---|---|
| `api/auth/guard` (login) | action + IP | 10 / 15 m | 🔴 **every owner locked out of login** |
| `api/auth/guard` (signup) | action + IP | 5 / 1 h | 🔴 no new customers can register |
| `api/auth/guard` (reset) | action + IP | 5 / 1 h | 🔴 no password recovery — compounds the above |
| `api/staff-portal/verify` | email + IP | 5 / 15 m | 🔴 staff cannot verify |
| `api/inventory/app/[slug]/login` | staff_id | 5 / 15 m | 🔴 stocktake app login blocked |
| `api/cx/[slug]/auth` (verify) | phone + business | 5 / 15 m | 🟠 customers cannot verify |
| `api/public/cx/[slug]/checkin` | identity_id | 3 / 15 m | 🟠 check-in blocked |
| `api/public/kiosk/loyalty-scan` | IP + business | 30 / 1 m | 🟠 kiosk dead |
| `api/public/receipt/[sale_id]` | IP | 20 / 1 m | 🟠 customers cannot open a receipt |
| `api/public/instore/chat` | **business only** | 60 / 1 h | 🟠 venue-wide, see above |
| `api/public/instore/help` | business + IP | 1 / 5 m | 🟠 in-store help blocked |
| `api/community/session` | IP | 20 / 1 h | 🟡 community session creation |
| `api/webhooks/nps-response` | sender phone | 5 / 1 h | 🟡 inbound NPS replies dropped |
| `api/geoapify/autocomplete` | user id | 30 / 1 m | 🟡 address autocomplete |
| `api/geoapify/staticmap` | IP | 60 / 1 m | 🟡 map tiles |
| `aria/ask` (`checkRateLimit 'ai'`) | user id | 20 / 1 h | 🔴 **Ask Aria returns 429 for every owner** |
| `aria/autopilot`, `aria/business-brain` | user id | 20 / 1 h | 🟠 AI surfaces dead |
| `aria/winback`, `customers/bulk-winback`, `invoices/send`, `pos/customers/sms` | user id | 10 / 1 h | 🟢 **correctly fail-closed — sending money/messages** |
| `aria/artifact-parse-failure` | user id | 100 / 1 m | 🟢 telemetry only |

**🟢 four routes where failing closed is exactly right.** Refusing to send an SMS or an invoice when
you cannot count them is the safe answer. That is the behaviour to keep.

---

## THE RECOMMENDATION

**Do not flip the global default.** Failing open everywhere would undo SECURITY-P1 (M-01) and
silently strip rate limiting from the money and PII routes the moment an env var goes missing —
the exact bug that fix existed to close.

**Make the choice explicit per call, defaulting to today's behaviour.** Something like:

```ts
limit(key, { requests, window, onUnavailable: 'deny' })   // default — unchanged
limit(key, { requests, window, onUnavailable: 'allow' })  // opt-in, for lockout-critical routes
```

Then set `'allow'` on the four rows marked 🔴 — the three `auth-guard` actions and `aria/ask` — and
leave every other route exactly as it is. The security argument for failing closed on login is
weak in a way it is not elsewhere: **the guard is a convenience gate, not the real control.** Its
own header says so — a scripted attacker calls Supabase's REST endpoint directly and never touches
it, and Supabase's own platform limits are the backstop for that path. So failing closed on login
stops no determined attacker while locking out every legitimate owner.

**Three smaller changes, independent of that decision:**

1. **Wrap `await rl.limit(key)`** so a runtime Upstash outage produces the module's chosen
   behaviour instead of a 500. Whichever way the flag above lands, an unhandled throw is not it.
2. **`instore-chat` should key on the customer**, not the business — session or identity, as its
   sibling `cx-checkin` already does. A venue-wide bucket is a customer-visible denial of service
   by one customer.
3. **`with-rate-limit.ts` should not trust `x-user-id` from the client**, and `'anon'` should be at
   least IP-scoped. Both are latent today; neither is hard.

**None of this is done in this sprint.** Every item above touches authorisation or the shape of a
security control, and that is Chahat's call, not an autonomous one.
