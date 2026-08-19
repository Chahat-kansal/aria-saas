# RUN LOG — MEGA-SPRINT 7 · COUNT-TRUTH + AU-COMMS-RAIL

**Autonomous run under RULE 20.** Six phases. Started 2026-08-19.

*(Summary is written at the top when the run completes — see the end of this file until then.)*

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

**Commit:** *(see git log — this phase's own sha is written in phase 2's commit, per the standing
addition against amending pushed commits.)*

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
