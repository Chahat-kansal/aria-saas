# LOYALTY-FULL-AUDIT — full report

Supersedes/absorbs LOYALTY-REGRESSION-1. Business under audit: Sip Café
(`ff5055a0-c351-4ada-817a-1804961035f3`). All findings verified against live
Supabase data, not inferred from code alone.

---

## Step 1 — Inventory

### `src/lib/loyalty/*.ts` (14 files)

| File | Purpose | Live-called? |
|---|---|---|
| `earnOnSale.ts` | Base points earn on a completed sale (idempotent, config-aware) | ✅ 9 call sites: `pos/sale`, `pos/kds/[id]`, `pos/online-orders/[id]`, `pos/sales/[id]`, `pos/sales/[id]/void`, `pos/sales-history/[id]`, `pos/scan-and-go/complete`, `pos/sales/route.ts`, `webhooks/stripe-orders` |
| `reverseEarnOnSale.ts` | Exact inverse of `earnOnSale` on void — reverses the original ledger row, not a recomputation | ✅ same 9 call sites (void/reversal branches) |
| `challenges.ts` | AI-personalised "buy N more X" missions from real purchase history; lazy-generate + evaluate progress | ✅ called from `api/loyalty/challenges` GET (lazy-gen) and `pos/sale`'s waitUntil (`evaluateChallenges`, progress only) |
| `referrals.ts` | Referral code issuance, pending-capture at signup, reward on referee's first real purchase | ✅ `getOrCreateReferralCode` from `api/loyalty/referral-link`; `captureReferral`/`evaluateReferrals` from enrol + `pos/sale` waitUntil |
| `reward-rules.ts` | Behaviour-triggered bonus rules (`spend_threshold`/`visit_count`/`category_purchase`) evaluated on each real sale, idempotent per (rule,sale) via `loyalty_rule_awards` | ✅ called from `pos/sale`'s waitUntil (`evaluateRewardRules`) — see Step 3 |
| `tiers.ts` | Tier computed from real `points_balance` vs `pos_loyalty_config` thresholds; tier-multiplier bonus earn | ✅ `applyTierEarnPerks` from `pos/sale` waitUntil; `getTierConfig`/`tierForBalance` used across dashboard + CX pages |
| `fraud.ts` | Rules-based abuse detection (velocity, point spikes, frequent redeem, referral rings, shared identity) — flags only, never blocks | ✅ `api/loyalty/fraud` (owner-triggered scan + list) |
| `preload.ts` | Stored-value (Starbucks-style) config/read helpers; mutations go through money-safe RPCs | ✅ `api/loyalty/preload/*` — blocked on live Stripe key per founder console, not code |
| `lifecycle.ts` | Shared helpers for birthday/winback daily crons — idempotent claim, ledger credit, WhatsApp→SMS→email delivery | ✅ `cron/loyalty-birthday`, `cron/loyalty-winback` (both live-scheduled, see Step 4) |
| `wallet-pass.ts` | Apple/Google Wallet pass data assembly | ✅ `api/loyalty/wallet-pass` — blocked on wallet certs per founder console |
| `resolve-code.ts` | Canonical short-code/UUID → membership resolver, single source of truth for POS/kiosk/CX lookups | ✅ used by `pos/loyalty/scan-lookup` and others |
| `earnOnSale.ts` / `card-link.ts` | Card-fingerprint → loyalty identity auto-link (no PAN ever stored) | ✅ referenced from card-link migration + Stripe webhook path |
| `membership.ts` | Membership lookup/create per business, member-pricing group assignment | ✅ `api/loyalty/membership`, `api/loyalty/account`, enrol flow |
| `auth.ts` | Global identity auth (email/phone + PIN/OTP), redeem-token helpers | ✅ `api/loyalty/auth`, `redeem-code`, `redeem-scan` |

All 14 files are live-wired. **Zero dead files** in `src/lib/loyalty`.

### `src/app/api/loyalty/*` (33 routes)
All 33 routes are reachable from either the owner dashboard (`/dashboard/loyalty`,
`LoyaltyExtensions.tsx`) or a customer-facing CX surface (`/{slug}/rewards`,
`/{slug}/loyalty/*`, the loyalty wallet). None are orphaned. Full one-line
purposes captured; the ones most relevant to this audit are detailed in Steps
2–4 below (`reward-rules`, `challenges`, `referrals`, `referral-link`, `tiers`,
`tier-perks`).

### pos-adjacent routes
`pos/sale/route.ts` is the terminal checkout endpoint and the single hub that
fires all five per-sale loyalty hooks (`earnOnSale`, `evaluateChallenges`,
`evaluateReferrals`, `evaluateRewardRules`, `applyTierEarnPerks`) plus KDS
ticket creation. `pos/kds/[id]/route.ts`, `pos/online-orders/[id]/route.ts`,
`pos/sales/[id]/route.ts` (+ `/void`), `pos/scan-and-go/complete/route.ts`,
`pos/sales-history/[id]/route.ts` and `pos/sales/route.ts` each independently
call `earnOnSale`/`reverseEarnOnSale` for their own completion/void path — all
9 call sites confirmed present.

---

## Step 2 — Main accrual path (the regression)

**Already root-caused and fixed in this repo's prior sprint, commit `96d631b2`
(LOYALTY-REGRESSION-1).** Root cause: the KDS "delivered" status bump
(`pos/kds/[id]/route.ts`) could flip an online order to `completed` without
ever calling `earnOnSale` — only the manual "Mark picked up" PATCH handler
(`pos/online-orders/[id]/route.ts`) did. Fixed by adding the same `earnOnSale`
call to the KDS delivered-sync block.

**Live re-verification for this sprint** (not re-derived — confirmed against
current production data):

- `pos_loyalty_transactions` for Sip: **18 rows** (was 16 at the time the
  regression evidence was captured), earliest 2026-06-30, latest 2026-07-14 —
  no longer dead.
- Sale `9e5f0299` (7 pts) and sale `916644c1` (20 pts), customer `dc69d5e2`:
  both have exactly 1 `earn` transaction each, matching the promised amounts.
  This backfill (migration `20260714000003_loyalty_regression_1_backfill.sql`)
  was already applied and is confirmed still live.
- Customer `dc69d5e2`'s 5 most recent completed sales (07-02 → 07-14) **all**
  have `earn_txn_count = 1`, including sale `916644c1` which earned through
  the **live fixed code path**, not the backfill — confirms the fix is
  holding for genuinely new sales, not just the two backfilled ones.
- **Platform-wide gap scan** (every business, every completed sale with a
  `customer_id`, created after that business's own first-ever loyalty
  transaction, checked for a missing `earn` row): **0 rows**. No other
  customer or business is silently missing a loyalty transaction.

**Verdict: no new fix needed for Step 2.** The regression is fixed, the
backfill is correct and still in place, and there is no further gap anywhere
on the platform. No commit required for this step.

---

## Step 3 — Reward-rule engine (new finding)

`evaluateRewardRules` (`src/lib/loyalty/reward-rules.ts`) **is genuinely wired**
into `pos/sale/route.ts`'s per-sale `waitUntil` block (confirmed at
`pos/sale/route.ts:361-367` region, alongside the other four hooks). It
correctly evaluates active rules of type `spend_threshold`, `visit_count`, and
`category_purchase` against the real just-completed sale, and idempotently
claims via `loyalty_rule_awards`'s `UNIQUE(rule_id, sale_id)`.

**Why 0 awards ever, despite 3 configured rules:** Sip's 3 `loyalty_reward_rules`
rows are **all `rule_type = 'redemption'`** — a completely different mechanic
(a points-cost catalog: "Free Flat White" 200pts, "Any Pastry" 150pts, "Free
Lunch" 500pts), not a sale-trigger. `evaluateRewardRules` explicitly only
processes `['spend_threshold','visit_count','category_purchase']` and skips
everything else by design — this is correct behaviour, not a bug. Confirming
evidence: all 3 rows share the exact same `created_at` timestamp
(`2026-07-06 13:05:54.379687+00`), and the owner-facing `POST
/api/loyalty/reward-rules` handler's own `RULE_TYPES` allowlist **does not
even include `'redemption'`** — these rows were seeded directly (a demo/seed
script), never created by the owner through the UI, and are a different
feature (a redemption catalog surfaced on `/{slug}/rewards`) than the
"behaviour-triggered rules" tab (`RewardRulesTab`) on the owner dashboard.

**Real bug found and fixed:** the redemption catalog (`/{slug}/rewards`,
`RewardsClient.tsx`) correctly reads these 3 rows and shows a "Redeem" button
once a member has enough points — but that button links to
`/{slug}/loyalty/redeem?rule={id}`, and **that route never existed** (confirmed
via repo-wide glob — zero files under `src/app/[slug]/loyalty/`). Any member
who tapped "Redeem" on a reward they qualified for hit a 404. This is
consistent with `loyalty_rule_awards` having 0 rows and would have stayed
silently broken indefinitely (no logging, no error surfaced to the owner —
just a dead link a customer would hit and quietly give up on).

**Fix:** built `src/app/[slug]/loyalty/redeem/page.tsx`. Redemption in this
app is staff-mediated at the till everywhere else it exists (`OffersTab`'s own
copy: *"Redemption happens in store"*; the counter-QR / `redeem-scan` POS
flow) — there was never a self-service points-spend endpoint, and inventing
one now would add new fraud/concurrency surface under audit time pressure for
no product requirement. The new page instead: resolves the specific reward +
the member's live points balance, and — when eligible — shows a confirmation
card ("Show this screen to staff at the counter to redeem") consistent with
the existing in-store pattern. Not-signed-in and insufficient-balance states
are handled gracefully (defensive; the link is only ever shown when eligible,
but a stale/shared link shouldn't crash).

---

## Step 4 — Four-subsystem verdicts

All four checked against Sip's live `pos_loyalty_config` row and the actual
wiring in code, not assumed from empty tables alone.

| Subsystem | Owner UI reachable? | Sip's live config | Verdict |
|---|---|---|---|
| **`loyalty_tiers`** (custom VIP tier definitions) | Yes — `/dashboard/loyalty` → Tiers tab (`TiersTab`), full CRUD via `/api/loyalty/tiers` | 0 custom tiers defined | **Unconfigured — owner action needed, not a bug.** (Separately, the auto-computed Bronze/Silver/Gold/Platinum label on `pos_customers.loyalty_tier`, driven by `pos_loyalty_config.tier_silver/gold/platinum_points`, is a different mechanism and *is* active with real thresholds — this empty table only affects the optional named-perk layer.) |
| **`loyalty_challenges`** | Yes — `/dashboard/loyalty` → Config tab → `ChallengesSection` toggle, `/api/loyalty/challenges` POST | `challenges_enabled: false` | **Unconfigured — owner action needed, not a bug.** Wiring verified correct: the customer-facing GET lazily generates + evaluates challenges, gated on this exact flag (`readConfig().enabled`) — if the owner flips it on, the next member dashboard visit will generate real, grounded challenges. |
| **`loyalty_referrals`** | Yes — `/dashboard/loyalty` → Referrals tab (`ReferralsTab`), `/api/loyalty/referrals` POST | `referrals_enabled: false` | **Unconfigured — owner action needed, not a bug.** `evaluateReferrals` explicitly checks `cfg.referrals_enabled` before ever paying out (`reward-rules.ts` sibling `referrals.ts:100-102`) — correctly gated, not silently no-op'ing. |
| **`loyalty_lifecycle_log`** (birthday/winback) | Yes — `/dashboard/loyalty` → Config tab, birthday/winback toggles + bonus fields | `birthday_enabled: false`, `winback_enabled: false` | **Unconfigured — owner action needed, not a bug.** Both crons (`cron/loyalty-birthday`, `cron/loyalty-winback`) are genuinely wired into the daily dispatch schedule (`dispatch/h09` 09:00 UTC, `dispatch/h10` 10:00 UTC — both registered live in `vercel.json`, one cron entry each, RULE-4 compliant). They run daily platform-wide but correctly skip any business with the flag off. |

**No genuine bugs found in Step 4.** All four subsystems have real, reachable
owner UI, real backing API routes with working persistence, and real
enforcement of their enable flags in the evaluation code — Sip has simply
never turned any of them on. No fixes, no commits for this step.

---

## Commits

1. `fix(loyalty): redemption-catalog "Redeem" button 404'd — build the missing customer confirmation page` —
   the one genuine bug found (Step 3). Staff-mediated redemption, matching the
   existing in-store pattern; no new spend endpoint invented.
2. No commit for Step 2 (already fixed and verified, prior sprint).
3. No commit for Step 3's reward-rule engine itself (already correctly wired; only the dead link needed a fix).
4. No commit for Step 4 (all four subsystems are config gaps, not bugs).

tsc: 0 errors. Build: green (see build log).
