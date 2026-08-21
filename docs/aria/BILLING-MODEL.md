# BILLING-MODEL — which model wins, decided from the code (MS12 Phase 1, 2026-08-21)

## The verdict

**The two models are not rivals — they are layers, and the code already assigned their roles**
(SS-series, commit `0abd33a9` 2026-06-15; founder decisions locked 2026-07-28):

- **`businesses.plan` is canonical for ENTITLEMENT** — what a business may do right now.
  `getEntitlement()` → `getEffectivePlan()` reads `businesses` (`plan`, `subscription_status`,
  `trial_ends_at`, `stripe_subscription_id`, `plan_override_by`) exclusively for plan resolution.
  Admin override lives here; a lifecycle cannot override an entitlement decision path that
  doesn't read it.
- **`business_subscriptions` is canonical for LIFECYCLE** — the Stripe-facing record: `tier` as
  Stripe last said it, `status` (`trialing`/`active`/`past_due`), `current_period_*`,
  `cancel_at_period_end`, `cancelled_at`, `stripe_customer_id`/`stripe_subscription_id`, and the
  per-business AI budget (`sonnet_monthly_budget_cents`).
- **The webhook is the bridge**: it writes `business_subscriptions` first and mirrors
  `plan`/`stripe_*` onto `businesses` so the entitlement read never needs a join.

The sprint's fallback rule ("if they disagree, `business_subscriptions` wins") **does not
trigger**: the entitlement path and the webhook do not disagree — one reads the mirror the other
maintains. Overturning the founder-locked architecture on the fallback clause would have been a
misread of the decision table; RULE 20 ("the code wins") applies. The evidence is below so the
next session doesn't have to re-derive it.

**MCP-verified live state (2026-08-21):** `businesses.trial_ends_at` EXISTS (an MS12-brief
column list omitted it — the entitlement select is valid). `stripe_events` EXISTS (an in-session
check against the invented name `stripe_webhook_events` returned 0 and briefly suggested the
idempotency table was missing — measurement error, failure pattern #5, retracted).
`stripe_subscription_id` is null on all 5 rows of both tables; no Stripe subscription has ever
existed; `usage_logs` is empty.

## The census (phase 1's number)

**`businesses` billing fields — 20 readers · 3 writers.**
Readers: `lib/billing/entitlement.ts` (via `plans/resolve-plan.ts`), `components/providers/
BusinessProvider.tsx`, `app/owner/[slug]/layout.tsx`, `dashboard/settings/businesses/page.tsx`,
`api/admin/businesses/route.ts`, `api/billing/reels-usage`, `api/billing/[action]`,
`api/stripe/route.ts`, `api/stripe/webhook`, `lib/agents/flash-revenue-agent.ts`, and 10 crons
that filter on `subscription_status` (clv-weekly, customer-scoring, daily-briefing-submit,
flash-revenue, hypothesis-engine ×2, labour-optimisation, menu-engineering, outcome-check,
pattern-memory, signal-engine).
Writers: `api/stripe/webhook` (the mirror: `plan`, `stripe_customer_id`,
`stripe_subscription_id`), `api/stripe/create-checkout` (`stripe_customer_id` only), admin
plan-override path (`plan`, `plan_override_by/at`).

**`business_subscriptions` — 14 readers · 5 writers.**
Readers: `entitlement.ts` (AI budget), `api/billing/status`, `api/billing/[action]` GET,
`api/billing/portal`, `api/billing/checkout`, `api/billing/reels-usage`,
`api/cron/trial-warnings`, `api/cron/causal-analysis`, `api/cron/council-session`,
`api/dashboard/ai-usage`, `api/admin/ai-costs` (+page), `lib/aria/ask/business-context.ts`,
`api/stripe/route.ts`, `api/stripe/webhook`.
Writers: `api/stripe/webhook` (primary), `api/billing/[action]` webhook branch (duplicate
handler), `api/billing/checkout` (customer-id upsert), `api/stripe/route.ts`,
`scripts/backfill-stripe-fees.ts`.

## Hazards found during the census (addressed in phases 2–4)

1. **Three tier vocabularies, one live orphan**: live data holds `autonomous` (and a null tier);
   `resolve-plan.ts` already aliases `autonomous → pro` (founder-locked, $249 price-point
   evidence in admin/costs). The MS12 brief's "add it as a real tier" is superseded by that
   in-code decision — the requirement that matters is *every live tier string resolves*, which
   the alias satisfies and phase 2 now proves with tests. `src/lib/plans.ts` (the $0/$20
   chat-template file) was already tombstoned with an import guard.
2. **Raw-tier readers**: `dashboard/ai-usage` keys budget defaults off `sub.tier` as a raw
   string, `business-context` feeds raw `tier` into the Ask-Aria prompt — an `autonomous` or
   null tier silently falls through. Phase 3 routes these through `normalizePlan`.
3. **Two webhook handlers share `stripe_events` with different semantics**
   (`/api/stripe/webhook`: skip iff `processed=true`; `/api/billing/[action]?action=webhook`:
   skip iff any row). If BOTH were ever registered in Stripe, [action]'s marker rows (never
   marked processed) would not stop /api/stripe/webhook from re-processing. Phase 4 hardens
   both and the setup doc registers exactly ONE endpoint.
4. **Idempotency errors discarded** (RULE 7): both handlers ignore the error on the
   `stripe_events` select/insert — a transient store failure would process the event with no
   idempotency record. Phase 4 makes this fail closed (500 → Stripe retries).
5. **Unknown price IDs silently become `starter`** in both `priceToTier` copies — with unset
   env (true today), every subscription event would write tier `starter` regardless of what the
   customer pays. Phase 4 makes unknown price IDs refuse (null → no tier write + loud log),
   the same refuse-don't-guess rule as uom.ts.
