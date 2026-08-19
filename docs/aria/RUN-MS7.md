# RUN LOG — MEGA-SPRINT 7 · COUNT-TRUTH + AU-COMMS-RAIL

**Autonomous run under RULE 20.** Completed 2026-08-19.

---

## SUMMARY

**Phases done: 5 · Parked: 1 (phase 6, needs schema) · Commits: 6**

| phase | outcome | commit |
|---|---|---|
| 1 · spot count writes a ledger line | done | `8049b769` |
| 2 · blind count on the staff app | done | `05561d55` |
| 3 · cycle-list truth | verified, nothing to fix | `17ddb2ec` |
| 4 · consent diagnosis | done — `COMMS-CONSENT-AUDIT.md` | `7bbd7bb3` |
| 5 · one send rail | rail existed; guard added | `324648e9` |
| 6 · Sender ID | **PARKED** — needs a column | *(this commit)* |

Block A and Block B both completed. Nothing was parked as URGENT.

### The three things you most need to know

**1. Tell staff before their next count.** Phase 2 changed the counting surface they use daily. The
box now **starts at 0** instead of pre-filled with the expected quantity, and "Aria expects: N" and
the live variance no longer appear while they type — they appear immediately *after* the count is
recorded. Every count that surface has produced until now was confirmation, not verification: open,
submit, perfect match, nothing counted. This is the POS surface's existing pattern, not a new
design, and no figure was removed — only the moment it appears has moved.

**2. There is no consent problem, and no remediation to do.** The brief's reading of the SMS log
was the opposite of what happened. `consent_ok` is not absent — it is **`false` on 25 rows**, all
`status='skipped'`: the gate ran and **refused 25 marketing sends**. The remaining 23 are
transactional, where consent is exempt by design and never evaluated. **Zero marketing SMS have
ever reached a customer** (49 have a phone; 1 has consent, and wasn't targeted). The URGENT branch
of the decision table did not fire, and nothing was parked for remediation. The rail has been
quietly doing its job since 22 June — and phase 5 added the guard that stops the *next* bypass,
which is what was genuinely missing.

**3. The Sender ID work is parked on one column, and it is overdue rather than upcoming.** ACMA
register enforcement began **1 July 2026**. Per-business Sender ID has nowhere to live — the exact
`ALTER TABLE` is written out in phase 6 below, along with the five registration steps in order.
**Mitigating fact:** `CLICKSEND_SENDER_ID` is currently unset, so sends go out on ClickSend's shared
number, not an unregistered alphanumeric — the "Unverified" exposure is latent, and it activates the
moment anyone sets that env var before registering.

### Worth knowing beyond those three

- **Two of the brief's live-DB facts were wrong**, both in Block B, both corrected in the preflight
  below. The rail described in phase 5 as needing to be built already existed in full.
- **A spot count has never actually been run.** `pos_stock_take_items` holds 0 rows and 0 of 75
  inventory rows have `last_counted_at`. Phase 1's fix is therefore proven structurally, not
  observed — phase 3 lists the four things to check after the first real count.
- **The guard's `--working-tree` mode stages every untracked file** via `git add -N .`, and after a
  guard run the 22 junk files at the repo root showed as staged. `git reset` before committing.

---

## ⚠️ READ FIRST — PHASE 2 CHANGES THE COUNTING SURFACE STAFF USE DAILY

The staff app no longer pre-fills the count box with the expected quantity, no longer shows
"Aria expects: N" or a live variance while a count is being typed, and no longer prints the
expected figure in the cycle list. **Staff should be told before their next count**, because the
box now starts at 0 and they must enter what is actually on the shelf.

Nothing was redesigned — this is the POS surface's existing pattern (empty input, reveal after
submit) applied to the staff app. The expected figure and the variance still appear, immediately
after the count is recorded.

---

## PREFLIGHT

Run in full before phase 1, per RULE 20. **Two of the brief's live-DB facts were wrong**, and both
changed what a phase had to do.

### Count paths
| | |
|---|---|
| `submitCount` callers | 1 — `api/inventory/app/[slug]/count/route.ts:26`. (Two UI functions share the name; neither is this one.) |
| `pos_stock_take_items` insert paths | **1** — `stocktake.ts:110-111`, the canonical engine |
| `pos_stock_takes` header writers | **2 before this run** — `count.ts:65` and `stocktake.ts:59`. **1 after phase 1.** |
| counting surfaces | staff app (task flow + stocktake flow), POS `stocktake/new`, dashboard `stocktake` (3 of its 4 endpoints are 404 — out of scope, logged only) |

### Comms paths
| | |
|---|---|
| SMS chokepoint | `src/lib/clicksend.ts` — `sendSMS()`. **45 files import it.** |
| direct ClickSend API calls bypassing it | **1**, and it is legitimate: `whatsapp.ts:28` is the *WhatsApp* provider call inside `sendWhatsApp()`, its own chokepoint with consent, suppression and `loyalty_whatsapp_log`. **No SMS path bypasses `sendSMS`.** |
| writes `sms_send_log.consent_ok` / `.suppressed` | `clicksend.ts` `logSend()` only — one writer, every branch |
| Sender ID config | `process.env.CLICKSEND_SENDER_ID`, read once at `clicksend.ts`; omitted when unset so ClickSend falls back to a shared number. **Global, not per-business.** |
| call sites passing `category: 'marketing'` | 36 |
| call sites relying on the default (`transactional`) | 26 |

### ❗ Corrections to the brief's live-DB facts

**1. "`consent_ok` true on zero, `suppressed` on zero" is true but reads as "the gate never ran".
The opposite is the case.** Actual distribution:

| category | status | consent_ok | rows |
|---|---|---|---|
| marketing | **skipped** | **false** | **25** |
| transactional | sent | null | 19 |
| transactional | failed | null | 4 |

**The consent gate ran and refused 25 marketing sends.** `consent_ok` is `false` on those, not
absent — and `null` on the 23 transactional rows because transactional is exempt by design and the
gate never evaluates consent for them. `suppressed` is false everywhere because `sms_suppression`
is empty, which is correct rather than broken. Detail in `docs/aria/COMMS-CONSENT-AUDIT.md`.

**2. The rail described in phase 5 already exists.** `sendSMS()` already checks consent, records
`consent_ok`, honours suppression, appends the STOP notice to marketing, and logs every attempt.
Phase 5 is therefore *not* "build a rail" — see that phase for what was actually missing.

---

## PHASE 1 — `submitCount` WRITES A LEDGER LINE

**Commit:** `8049b769`

### Changes
- `src/lib/inventory/count.ts` — a perpetual spot count now goes through the canonical engine
  (`openStocktake` → `countStocktakeLine` → `submitStocktake`) instead of inserting its own header.
- `src/lib/inventory/spot-count-ledger.test.ts` — new, 9 assertions.
- `src/lib/inventory/variance-value.test.ts` — one assertion rewritten (below).

### What changes in behaviour
A spot count is now a first-class count. It writes a real `pos_stock_take_items` row, so
attribution (`counted_by`), variance, variance value, the recount counter, **the `last_counted_at`
cache** and the materiality policy all apply to it exactly as they do to a full count.
`items_counted` is computed from the lines that persisted instead of being hardcoded to 1.

The commit/review outcome is unchanged: `count-policy` routes **every** staff count to owner
review regardless of size, which is what this function always did — now reached through one
implementation instead of a second copy.

### Sweep
`pos_stock_takes` header writers: **2 → 1.** Only `stocktake.ts:59` inserts one. Asserted in the
test file, not just counted here, so a third writer fails the suite.

### Mutation
Restored the header-only write (`items_counted: 1`, no engine call) → **5 of 9 tests red.**
Restored → 9/9 green.

### Decisions taken under the standing table
- **"A test asserts the old behaviour → rewrite it, never delete it."** `variance-value.test.ts`
  required `count.ts` to initialise `varianceCents` to null. count.ts no longer computes a variance
  value *at all* — the engine prices the line — so the old assertion would have forced a dead local
  variable back into the file to stay green. Rewritten to assert the stronger property (count.ts
  cannot re-flatten an unknown cost because it no longer resolves costs), with the reason written
  into the test file.
- **"Do not backfill."** The three June headers are untouched.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** (read from build.log, not the wrapper) · `vitest` 286/286 (24 files).

### Parked
None.


---

## PHASE 2 — BLIND COUNT

**Commit:** `05561d55`

### Changes
- `src/app/inventory/[slug]/page.tsx` — 5 edits (both count flows + the cycle list).
- `src/lib/inventory/blind-count.test.ts` — new, 9 assertions.

### What changes for staff — the item at the top of this log
| | before | after |
|---|---|---|
| task count box | pre-filled with the expected qty | **starts at 0** |
| stocktake count box | pre-filled with the expected qty | **starts at 0** |
| during entry | "Aria expects: N" + live variance, updating per keystroke | nothing — a one-line instruction only |
| cycle list row | "expect 14 · 3d since count" | "A-tier · 3d since count" |
| after submit | (same) | **unchanged — expected + variance revealed immediately** |

No figure was removed from the product; only the moment it appears has moved. This is the POS
surface's existing pattern, not a new design.

### Sweep
Counting surfaces: **3.** Staff app — fixed (both flows). POS `stocktake/new` — **already correct**,
untouched, and asserted as such so a later edit cannot quietly regress it. Dashboard `stocktake` —
**out of scope by instruction** (3 of its 4 endpoints are 404); it renders `expected_qty` beside its
input at `page.tsx:400` and would need the same treatment if those endpoints are ever built.

### Mutation
| mutation | result |
|---|---|
| restore the task-count pre-fill | 1 red |
| restore the stocktake pre-fill + live variance chip | 2 red |
| un-gate the "Aria expects" panel | 1 red |

Restored → 9/9 green.

### Decisions taken under the standing table
- **"Do not redesign; build the minimum equivalent."** The POS anomaly modal was *not* ported. The
  staff app's post-submit reveal already existed (`countMsg`, and the recorded-lines list with
  `varChip`), so gating the pre-submit display was sufficient. Copying the modal would have been a
  second implementation of a reveal that already works.
- **"Out of scope — log it, don't touch it."** Dashboard page left alone, recorded above.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 295/295.

### Parked
None.


---

## PHASE 3 — CYCLE-LIST TRUTH

**Commit:** `17ddb2ec`

### REPORT AND SKIP — nothing needed fixing.

Per the decision table: *"P3: nothing to fix → report and skip. Do not invent scope."* The chain
phases 1–2 completed is intact, verified link by link in source:

| link | evidence |
|---|---|
| a counted line refreshes the cache | `stocktake.ts:135` — `.update({ last_counted_at: countedAt })` |
| a spot count reaches that writer | `count.ts:98` — `countStocktakeLine(...)` (phase 1) |
| the cycle list reads the cache | `stocktake.ts:350` — `last_counted_at` in the same query as `items_on_hand` |
| a counted product leaves the rotation | `due = daysSince / cadence` → ~0 immediately after a count → sorts to the bottom |
| an uncounted product stays | `due = 999 + tier bonus` when `last_counted_at` is null → sorts to the top |

Phase 2's edit removed `expected_qty` from the *display* only; it is still passed to
`stPickProduct(c.product_id, c.name, c.expected_qty)`, so nothing was orphaned.

### ⚠️ THE PROOF IS STRUCTURAL, NOT OBSERVED — and that is worth knowing

Live state right now: **0 of 75** `pos_outlet_inventory` rows have `last_counted_at`, the ledger
(`pos_stock_take_items`) holds **0 rows**, and **0** perpetual sessions have ever existed.

So the cycle list currently reports "never counted" for every product — **and that is TRUE.**
Nothing has ever been counted through a path that wrote a ledger line. The misdirection phase 1
fixes is *forward-looking*: before it, a spot count would have left this state unchanged; after it,
a spot count sets `last_counted_at` and the product drops out of the rotation.

**I cannot demonstrate the rotation working against live data, because no count has been run.**
What Chahat should check after the first real spot count:

1. `pos_stock_take_items` gains a row (it has never had one).
2. That product's `pos_outlet_inventory.last_counted_at` becomes non-null and equals the line's
   `counted_at`.
3. The product disappears from the top of the staff app's cycle list.
4. `inventory_review_queue` gains a `count_variance` row if the count differed (it has never had
   one either — see phase 4's note that the review path has produced 0 rows in production).

### Gates
No source changed in this phase. `tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 295/295 — the same green
run that covered phase 2, re-confirmed before this commit.

### Parked
None.

---

## PHASE 4 — CONSENT DIAGNOSIS

**Commit:** `7bbd7bb3` · **Document:** `docs/aria/COMMS-CONSENT-AUDIT.md`

### The answer is none of the three offered

The brief asked whether **(a)** the gate runs but never records, **(b)** paths bypass it, or
**(c)** all 48 are transactional. **The gate runs, records correctly, and refused 25 marketing
sends.**

`consent_ok` is `false` on 25 rows (marketing, skipped — refused at the gate) and `null` on 23
(transactional, exempt by design). `suppressed` is false everywhere because `sms_suppression` is
empty — nobody has opted out, because no marketing SMS has ever been delivered.

**Zero marketing SMS have ever reached a customer.** 49 customers have a phone; 1 has
`sms_consent`, and was not among the 25 targets.

### 🟢 NOTHING PARKED AS URGENT — there is no past-send exposure to remediate

The decision table's URGENT branch (*"a marketing path sends without consent → park all
remediation"*) **does not fire.** No marketing message was sent without consent. The rail has been
refusing them since 22 June.

### Per-path
All SMS goes through `sendSMS()` (45 importing files), so consent-check, `consent_ok` logging,
suppression and the STOP notice are properties of the rail, not per-path. What varies is the
`category` each caller passes: **36 marketing, 26 transactional.** No path is misclassified; two
ambiguous ones (daily-briefing, community digest) already pass `marketing`, which is the safer
error. Full table in the audit document.

### Bypass check
**None.** One direct ClickSend `fetch` exists (`whatsapp.ts:28`) and it is inside `sendWhatsApp()`
— WhatsApp's own chokepoint with its own consent, the shared suppression list, and its own audit
log. A second rail, not a hole in the first.

### Gates
Documentation only. `tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 295/295.

### Parked
None.


---

## PHASE 5 — ONE SEND RAIL

**Commit:** `324648e9`

### The rail already existed. What was missing was the guard.

Per the decision table (*"the work is already done -> report and skip; never invent scope"*), I did
not rebuild `sendSMS()`. It already checks per-channel `sms_consent`, honours the `sms_suppression`
opt-out list, appends the STOP notice to marketing, and writes **every** attempt to `sms_send_log`
— and phase 4 confirmed **no path bypasses it** (45 importers, 0 bypasses).

What did not exist is anything stopping the *next* bypass. Not hypothetical: the email side already
lost this exact way, when a raw `fetch` around `sendEmail()` in the CX digest meant no unsubscribe
and no suppression check ever ran, and nothing caught it. This repo's own measured figure is that
adoption stalls at **9-15%** without enforcement.

### Changes
- `scripts/canon-rail-guard.ts` — new rule **`direct-sms-provider-call`**; the two chokepoints
  (`src/lib/clicksend.ts`, `src/lib/whatsapp.ts`) added to `EXEMPT_PATHS` because they *are* the
  rail; and a fix-hint explaining what the chokepoint does that a raw fetch does not.

Added to the **existing** guard rather than built as a second mechanism — it already runs in CI
(`canon-rail-guard.yml`) and in the pre-push hook, scans **added lines only**, and grandfathers
everything pre-existing. A new guard would have needed its own wiring into both.

### Verified by making it fail
Exercised, not asserted. A probe file containing a direct `fetch('https://rest.clicksend.com/...')`
was written and scanned:

```
[canon-rail-guard] 1 new violation(s) found
  src/lib/guard-probe-tmp.ts:2  [direct-sms-provider-call]
    return fetch("https://rest.clicksend.com/v3/sms/send", { method: "POST" })
```

Probe deleted, re-scanned -> **Pass**, confirming the two real chokepoints do not trip their own
rule. Both directions checked.

> ⚠️ **Side effect, and it nearly bit me.** `--working-tree` mode runs `git add -N .`, which marks
> every untracked file intent-to-add — including the 22 pre-existing junk files at the repo root
> (`pw-report*-extracted/`, two `.glb` binaries, `design/*.png`). After my second guard run they
> showed as staged `A` entries, and a plain `git commit` would have swept all of them in. Caught by
> checking `git status` before staging; cleared with `git reset`. **Anyone running the guard in
> working-tree mode must `git reset` afterwards.**

### Not retrofitted, deliberately
Per the decision table, the 62 call sites were left alone. Rail plus guard only.

### Gates
`tsc` 0 · **`BUILD_EXIT=0`** · `vitest` 295/295 · guard verified in both directions.

### Parked
None.

---

## PHASE 6 — SENDER ID · PARKED (needs schema)

### Why parked
The decision table is explicit: *"P5 or P6 needs a column -> PARK, name the column, continue"* and
*"schema needed -> PARK that phase."* Phase 6's scope is **per-business** Sender ID configuration,
and there is nowhere to put it:

- `businesses` has no sender/SMS-identity column (only `alert_sms_enabled`, unrelated).
- No existing settings table fits. `pos_company_settings` is POS-terminal config (sign-in type,
  auto-logout); `pos_online_settings.settings` is online-ordering config. A comms identity in
  either would be the wrong home and found there by nobody.
- Today it is **one global env var**, `CLICKSEND_SENDER_ID`, read once in `clicksend.ts`. Unset, the
  `from` field is omitted and ClickSend falls back to a shared account number — so every business
  sends under the same identity, or none.

**Phase 5 is not parked with it.** Its deliverable was the guard: code-only, and shipped.

### Schema needed — named exactly
```sql
-- per-business SMS sender identity + ACMA registration state
ALTER TABLE businesses
  ADD COLUMN sms_sender_id            text,         -- alphanumeric ID, max 11 chars (AU), e.g. 'SipCafe'
  ADD COLUMN sms_sender_status        text NOT NULL DEFAULT 'unregistered'
    CHECK (sms_sender_status IN ('unregistered','pending','registered','rejected')),
  ADD COLUMN sms_sender_registered_at timestamptz;
```
The status column is not decoration: surfacing the **unregistered state to the owner** is the
phase's actual requirement, and inferring it from a null ID cannot distinguish "not set up yet"
from "submitted and waiting".

### THIS IS OVERDUE, NOT UPCOMING
ACMA Sender ID Register enforcement began **1 July 2026**. SMS on an unregistered alphanumeric
Sender ID displays to recipients as **"Unverified"**. `clicksend.ts` already records the failure
mode from experience: a hardcoded alphanumeric is accepted by the ClickSend API (`response_code:
SUCCESS`, a `message_id` assigned) and then **silently dropped at the carrier** — exactly the
symptom of OTP rows persisting while no SMS arrives.

**Mitigating fact, verified:** `CLICKSEND_SENDER_ID` is unset in this environment, so sends omit
`from` and go out on ClickSend's shared number rather than an unregistered alphanumeric. The
"Unverified" exposure is **latent, not active** — and it activates the moment anyone sets that env
var without registering first.

### Registration — exactly what Chahat must do, in order
1. **Choose the Sender ID string per business.** Max 11 characters, alphanumeric, no spaces. It must
   plausibly identify the actual sender (`SipCafe`, not `AriaOS`, for a message from Sip) — ACMA's
   rule is that it must not mislead the recipient about who is contacting them.
2. **Register via ClickSend**, which files with the ACMA register on the account's behalf:
   Dashboard -> **Account -> Sender IDs -> Add Alphanumeric Sender ID**. Supply the legal entity
   name, ABN, and the ID string; ClickSend requires evidence the sender owns the brand.
3. **Wait for approval before setting it anywhere.** Approval is not instant, and sending on a
   pending ID has the same "Unverified" outcome as an unregistered one.
4. **Only then set the value** — and once the schema above exists, set it per business rather than
   in the global env var, so one cafe's registration does not put its ID on another's messages.
5. **Repeat per business at onboarding.** Blocking a new customer from sending SMS before
   registration depends on `sms_sender_status`, so it is parked with the column.

### What this park does NOT block
Marketing SMS cannot be delivered at all today (phase 4: zero ever sent; 1 customer with consent),
so the Sender ID gap blocks no live send. Transactional SMS continues on the shared number, which
is unaffected by the ACMA alphanumeric rules.
