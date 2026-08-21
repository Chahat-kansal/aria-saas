# RUN-MS12 — ONE BILLING TRUTH + IMPORT HOLE (autonomous, 2026-08)

## Summary (read this first)

**All six phases done. Nothing parked. Six commits, pushed.**

| Phase | What | Commit |
|---|---|---|
| 1 | Census + verdict: the models are LAYERS, not rivals — `BILLING-MODEL.md` | `8a1e3de0` |
| 2 | Tier vocabulary proven against live values; `autonomous` tripwire | `0a6788be` |
| 3 | Four raw-tier readers routed through `normalizePlan`; checkout validates tier input | `497095e9` |
| 4 | Webhook: fail-closed idempotency, refuse-don't-guess price IDs, trial_will_end added, inert | `6ce26bcc` |
| 5 | Import writes the canonical pack pair; ambiguous/invalid rows refused with reasons | see log |
| 6 | Canon rail rule `tombstoned-uom-write` — a new write to a dead column fails the push | see log |

**Which model won, and how many readers moved:** neither "won" — the code had already assigned
roles (founder-locked, SS series): **`businesses.plan` is canonical for entitlement,
`business_subscriptions` for Stripe lifecycle, the webhook mirrors between them.** The brief's
fallback ("if they disagree, subs wins") never triggered because they don't disagree. Census:
businesses 20 readers/3 writers; subs 14 readers/5 writers. **4 readers moved** in phase 3 (the
raw-tier ones: dashboard/ai-usage, admin/ai-costs, business-context, billing/checkout's input
path); the lifecycle readers (billing/status, [action] GET, portal, trial-warnings, the 10
status-filter crons) were verified as already reading their canonical source and left, listed.

**Exactly what Chahat must create in Stripe, in order** (nothing exists yet; no IDs invented):
1. Three products: Aria Starter, Aria Growth, Aria Pro.
2. One recurring monthly price each — founder matrix $297 / $597 / $997 USD.
3. Vercel env: `STRIPE_PRICE_ID_STARTER` / `STRIPE_PRICE_ID_GROWTH` / `STRIPE_PRICE_ID_PRO`
   (the three price IDs) and `STRIPE_SECRET_KEY`.
4. ONE webhook endpoint → `https://<domain>/api/stripe/webhook` with events:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_succeeded`, `invoice.payment_failed`,
   `customer.subscription.trial_will_end`, `charge.succeeded`.
   **Do not register `/api/billing/webhook` or `/api/stripe` — they are duplicate handlers with
   clashing skip semantics on the shared `stripe_events` table** (BILLING-MODEL.md hazard #3).
5. `STRIPE_WEBHOOK_SECRET` = that endpoint's signing secret.
Until then everything fails safe: unknown price IDs refuse (no tier writes), checkout returns
`billing_not_configured`, unsigned webhook calls are rejected.

**Three things Chahat most needs to know:**
1. **Two silent money hazards were live in the webhook and are fixed**: idempotency errors were
   discarded (a transient DB failure would have processed a Stripe event with no dedupe record —
   the double-apply path; now 500 → Stripe retries), and all three copies of the price→tier
   mapping defaulted unknown price IDs to `starter` — with today's unset env, every subscription
   event would have labelled every customer `starter` regardless of what they pay. Unknown now
   refuses and leaves the stored tier alone.
2. **`autonomous` is an alias, not a tier.** It lives on one real row, resolves to `pro`
   (founder-locked decision, now test-pinned so removing the alias goes red), and phase 3 means
   every reader that keys off a tier string resolves it first — the alias row was silently
   mis-budgeted in two AI-cost surfaces before this.
3. **The import hole is closed and guarded**: CSV/product imports now write
   `purchase_uom`/`purchase_uom_qty` (unit `case` is explicit — it's the column's own name),
   refuse rows with invalid or self-contradictory pack sizes, and a new canon-rail rule fails
   any push that writes a tombstoned UOM column outside the 7 grandfathered edit-form files.
   The edit forms still write the dead columns — that's the next tombstone batch.

---

## Phase log

### Phase 1 — WHICH MODEL WINS (`8a1e3de0`)
Census in `docs/aria/BILLING-MODEL.md` (readers/writers per model, per file). Verdict from the
code, not the brief's fallback. Retraction recorded (pattern #5): an in-session check against
the invented name `stripe_webhook_events` said the idempotency table was missing; `stripe_events`
exists. `businesses.trial_ends_at` also exists despite the brief's column list omitting it.

### Phase 2 — ONE TIER VOCABULARY (`0a6788be`)
Already-done work reported and skipped (pattern #3 ×2): dead `plans.ts` already tombstoned with
an import guard; `autonomous` already aliased. New: `tier-vocabulary.test.ts` pins every
MCP-verified live value — plans {pro, starter}, tiers {autonomous, starter, NULL}, statuses
{active, trial, trialing, NULL} — into the registry. Mutation: removing the alias → red.

### Phase 3 — MIGRATE THE READERS (`497095e9`)
dashboard/ai-usage and admin/ai-costs keyed `PLAN_DEFAULTS` off raw tier strings (the
`autonomous` row missed the map and fell to a generic 3000-cent budget); business-context fed
the raw label into the Ask-Aria prompt; billing/checkout CAST `body.tier` instead of validating
— and that string round-trips through Stripe metadata back into `business_subscriptions.tier`,
which is exactly how orphan vocabulary is born. All four now resolve/validate through the one
vocabulary. Mutation: reverting ai-usage to the raw map → red. VERIFY: the live Sip shape
(plan=`pro`, tier=`autonomous`) resolves identically through both paths.

### Phase 4 — THE SUBSCRIPTION LIFECYCLE, INERT (`6ce26bcc`)
The handler existed (pattern #3) — signature-verified, event-id-idempotent against a real table.
Fixed in it: fail-closed idempotency via pure `webhook-guards.decideEventAction` (unreadable
store or unwritable marker → 500, never process-without-record); `priceIdToTier` refuses unknown
price IDs (three silent `return 'starter'` copies replaced — lifecycle fields still update, tier
and plan are left alone with a loud log); checkout metadata tiers verified against `PLANS`
before writing; `customer.subscription.trial_will_end` added (notification only). The two
duplicate handlers hardened and marked DO-NOT-REGISTER. Replay proven at the pure layer
(processed → skip; crashed-mid → re-process, which is Stripe's own retry contract) plus source
wiring assertions; not exercised with signed Stripe traffic here — stated. Mutation: gutting
`decideEventAction` → 2 tests red. **Nothing in the phase can move money** — a test forbids
every `stripe.*.create` money surface in the handler file.

### Phase 5 — IMPORT WRITES TO TOMBSTONED COLUMNS
`importPackFields()` in uom.ts: a CSV "Units Per Case"/"Case Quantity" cell is an EXPLICIT pack
declaration (the unit is the column's own name) → converts to `{purchase_uom:'case',
purchase_uom_qty:N}` at the front door. Refusals per the MS11 rule: non-positive/non-numeric →
row refused with reason into the import's errors list; two mapped pack columns that disagree →
ambiguous, refused. Both import routes (`pos/import/csv`, `pos/products/import`) migrated; the
tombstoned keys no longer appear in any import payload.
**SWEEP: 5 writer files remain**, all edit-form/mapping domain, listed and grandfathered:
`pos/products/route.ts` (create), `pos/products/[id]/route.ts` (legacy + update_inventory
ALLOWED lists), `ProductForm.tsx`, `ProductEditShell.tsx`, `InventoryTab.tsx` (+
`RetailProductFields.tsx`, `map-columns` as mapping vocab). Decision table: import fixed, edit
forms listed — they are the next batch.
Mutation: restoring the tombstoned write in the CSV payload → red.

### Phase 6 — GUARD THE TOMBSTONES
Canon-rail rule `tombstoned-uom-write`: an ADDED line writing any of items_per_case /
case_quantity / cases_in_stock / sell_uom / cases_on_hand / cases_reorder_* / cases_max_on_hand
in object-key form fails the push, naming the column and pointing at uom.ts. The 7 phase-5
leftovers are grandfathered by name in `UOM_TOMBSTONE_WRITE_ALLOWLIST` (shrink, never grow).
Probes: tombstoned write → exit 1; canonical-pair write → pass. Mutation re-run against the
WORKING rule after the backspace fix (below): disarmed → probe sails through; re-armed → caught.

---

## Deviations & findings
- **The tool-injected backspace (new failure mode, recorded loudly):** the phase-6 rule was
  first written with `\b` in its regex via an inline heredoc — and the shell layer collapsed
  `\\` → `\`, so Python's `\b` escape wrote a literal BACKSPACE (0x08) into the source. The
  regex then required a backspace character in scanned code and could never match; grep/sed
  DISPLAYED the line as if correct because the terminal swallows 0x08. The first "mutation
  check" passed in both directions — which is the finding, per RULE 15: a check that fails to
  fail. Diagnosed by replicating the guard's diff+regex in isolation, fixed via a Write-tool
  script (`chr(8)` matching), and both probes + the mutation re-run against the working rule.
  **Standing lesson: any edit containing backslashes goes through a Write-tool script file,
  never an inline heredoc.** (My own test regex also had a `\s*`-backtracking hole that let the
  negative lookahead be dodged — fixed and commented in the test.)
- **No DDL anywhere** — `stripe_events` exists; billing schema untouched; nothing parked.
- **Enforcement unchanged**: no gating was added or enabled anywhere in this sprint.
