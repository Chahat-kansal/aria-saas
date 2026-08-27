# RUN-POS-OFFLINE-1a — the sync swallow (G11)

**Run date:** 2026-08-27 · autonomous (RULE 20) · branch `main`
**Outcome:** G11 closed. Two further defects found that were not in the brief, one of which meant
**the offline path had never worked at all**. One item PARKED (C5's type regeneration — no
credentials in this environment).

---

## THE ONE-SCREEN SUMMARY

### The three things you most need to know

**1. The offline path could never have worked. The queue and the server spoke different languages.**
The brief treats the swallow as hiding an *occasional* mismatch. It was hiding a total one:

```
queueOfflineSale() stored:   total_amount, items[{ unit_price, line_total }]        (dollars)
sync-offline read:           total_cents, subtotal_cents, tax_cents, unit_price_cents
```

Every one of those arrived `undefined`. `undefined / 100` is `NaN`, `NaN` serialises to `null`, and
`pos_sales.total_amount` is **NOT NULL** — so *every* offline sale failed its insert, every time,
and the swallow ate the reason. That is precisely why the preflight's
`count(*) where synced_from_offline = true` is **0**: not "never exercised", but **never able to
succeed**. The brief's own figure was the evidence, read the other way round.

**2. The main till's offline sync has never run, because it reads a key nothing writes.**
`terminal/page.tsx` read `aria_offline_queue`; the queue module writes `aria_pos_offline_queue`
(`pos-offline.ts:7`). **Nothing in the repo has ever written the terminal's key** — it is read there
and removed there, and that is the whole lifecycle. So that effect has always seen `[]` and returned
immediately. Only `/pos/mobile` queues offline sales. Giving the main till real offline capability is
`POS-OFFLINE-1`, not this sprint — but its clear-all was removed rather than left as a trap.

**3. The destructive line was in BOTH clients, and it is gone from both.**
`if (d.synced > 0) clearOfflineQueue()` — one success in a batch of ten cleared all ten. The queue
now drops **only** refs the server confirms.

---

## WHAT CHANGED

| file | why |
|---|---|
| `src/app/api/pos/sync-offline/route.ts` | per-item results · 207 on partial failure · real error logging · **replays through `createSale()`** |
| `src/lib/pos-offline.ts` | queue v2: `ref` + `attempts`, selective apply, legacy adapter, idempotency key |
| `src/app/pos/mobile/page.tsx` | queues the real `/api/pos/sale` body · clears only confirmed · surfaces stuck sales |
| `src/app/pos/(fullscreen)/terminal/page.tsx` | new response contract · canonical queue key · clear-all removed |
| `src/lib/pos-offline.test.ts` | **new** — 31 tests |
| `package.json` | `types:gen` script |

**The terminal is the fifth file; justifying it as instructed.** It is not optional: I changed the
response shape, and its `d.synced > 0` test would have become permanently false against an array.
Leaving it would have been shipping a known-dead branch.

**Consumer test (RULE 18, as settled 2026-08-18): PROCEEDS.** Both consumers of this route are in
this repo, found by the sweep, and change in the same commit. `/pos` is **not** service-worker
cached — the registered workers are `/owner-sw.js`, `/community-sw.js` and `/inventory-sw.js`, and
the root `aria-sw.js` is deliberately self-destructing (`components/PWARegister.tsx:6,17`) precisely
because it once served a stale shell. No cached bundle can call this route with the old expectations.

---

## C1 — THE RESPONSE CANNOT LIE

```ts
{ synced: string[], failed: { ref, reason }[], ok: boolean }   // 200 when ok, 207 when not
```

207 rather than 4xx/5xx on purpose: the batch **partially succeeded**, and a status that denies that
would push the client toward discarding results it must act on. A caller that only checks `r.ok`
still cannot mistake a lossy sync for a clean one.

## C2 — THE TILL CLEARS ONLY WHAT THE SERVER CONFIRMS

`applySyncResult()` is a pure function, and the three cases are asserted separately:

| server said | outcome |
|---|---|
| `synced` contains the ref | removed — **the only reason a sale ever leaves the queue** |
| `failed` contains the ref | kept, `attempts + 1`, reason recorded |
| never mentioned the ref | **kept, untouched, attempts unchanged** |

That third row matters: inferring "not mentioned" as failure would march an innocent sale toward
being marked stuck.

**Poison pill: paused, never discarded.** After `MAX_SYNC_ATTEMPTS = 5` an item stops being *sent*
but stays in the queue and is surfaced to the owner. A test runs 8 rounds of failure and asserts the
item is still there.

## C3 — THE REAL ERROR IS LOGGED

`console.error('[sync-offline] sale replay FAILED', { ref, business_id, reason, status, voided })`
and a `THREW` variant carrying `err.code`. A `42703` now produces a line naming the column, attached
to the ref it belongs to.

## C4 — IDEMPOTENCY, AND WHY IT SHIPS WITH C2

`offlineIdempotencyKey(businessId, ref)` → `sale-{bid}-offline-{ref}`, derived from the ref minted
when the sale was queued. `createSale()` already replays on a matching key, and
`idx_pos_sales_biz_idempotency_key` is the backstop.

⚠️ **This function lives in `pos-offline.ts`, not the route** — Next.js route files may export only
handlers and config, so exporting it from the route is a hard `tsc` error (TS2344). Found by tsc, not
by review. The queue owns a sale's identity anyway, so that is its correct home.

**Nothing was lost by delegating to `createSale()`** (RULE 0): the stock decrement, movement logging
and session-total bump the route used to do by hand are all inside `createSale()` already — it now
gets the canonical versions plus tax computation, promotions, loyalty and KDS it never had.

## C5 — THE CLASS KILL: HALF DONE, AND I AM SAYING WHICH HALF

**Done — the sync route can no longer name a `pos_sales` column at all.** It builds no raw insert;
it calls `createSale()`, whose `CreateSaleParams` is a closed interface. Verified by running the
brief's own check:

```
injected  nonexistent_column: true  into the createSale call
tsc       src/app/api/pos/sync-offline/route.ts(135,9): error TS2353:
          Object literal may only specify known properties,
          and 'nonexistent_column' does not exist in type 'CreateSaleParams'.
```
Injection reverted from backup afterwards.

**PARKED — the generated types were not regenerated, and the residual is real.**
The brief said to check whether generated types already exist. **They do**:
`src/types/database.types.ts`, 924 KB, dated 17 Aug — and it is **stale**: it knows nothing of
`synced_from_offline`, `offline_queued_at` or `tip_total`. So typing anything against it today would
reject correct code.

Regenerating needs credentials this environment does not have:
```
npx supabase projects list  ->  {"message":"Unauthorized"}     (CLI 2.116.0 present, not logged in)
reading .env.local          ->  denied by policy
```
I did not route ~250k tokens of generated types through the MCP and re-emit them by hand into a
924 KB file; a truncated types file would be a far worse outcome than a stale one.

**`npm run types:gen` is added** so it is one command once you are authenticated. **The residual:**
`createSale()` still builds `salePayload` as `Record<string, unknown>` (`create-sale.ts:313`), so a
made-up column *inside that function* still compiles. The fix, after regeneration, is to type it as
`Database['public']['Tables']['pos_sales']['Insert']`.

---

## LEGACY QUEUED SALES — UPGRADED, NOT DROPPED

A real till may hold v1 items right now. They never synced (they *couldn't*), so they are real sales
the owner took offline and has never been paid for in the books. `readQueue()` upgrades them.

⚠️ **Tax is DERIVED, never guessed:** `tax_amount = total_amount − subtotal`, both figures the till
actually recorded. It deliberately does **not** fall back to "10% GST" — a fabricated tax figure here
flows straight into BAS. Clamped at 0 so a malformed row cannot produce negative tax.

> **My first test of this was worthless and I rewrote it.** The fixture had subtotal 10 and total 11,
> so derived tax (1.00) and an assumed 10% (1.00) are *the same number* — the assertion could not
> tell the two rules apart, and it failed against correct code. Re-fixtured at total 11.50 so derived
> (1.50) and assumed (1.00) diverge. A test that cannot distinguish the thing it names is not a test.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **973 passed / 973** across 76 files (was 942/75; +31)
- `npx next build` — **BUILD_EXIT** read from `build-off1.log`, never the wrapper
- **Class check (the brief's own):** injected `nonexistent_column` → **tsc failed** with TS2353,
  then reverted. C5 is wired for this route.
- **Mutation probes:** reinstating `errors++`; a clear-all in the mobile client. Both detectable.

---

## VERIFY — what was and was NOT run

| check | result |
|---|---|
| `applySyncResult` semantics incl. never-mentioned refs | ✅ unit-tested |
| poison pill kept after 8 failures | ✅ unit-tested |
| legacy upgrade + derived tax + no negative tax | ✅ unit-tested |
| idempotency key derivation and collision behaviour | ✅ unit-tested |
| route returns per-item results and 207 | ✅ asserted |
| swallow gone; real error logged with code | ✅ asserted |
| both clients honour the contract; terminal key fixed | ✅ asserted |
| **class check** | ✅ **run for real against tsc** |
| **queue 3 offline sales on a device, force one to fail** | ❌ **NOT RUN** |
| **the failed sale is still in the till queue afterwards** | ❌ **NOT RUN** (proven at the pure-function layer only) |
| **replay a synced batch → no duplicate rows** | ❌ **NOT RUN against the database** |
| **`count(*) where synced_from_offline = true` becomes non-zero** | ❌ **still 0** — nothing has synced yet |

**I did not exercise this on a device.** There is no till session here, and `/pos/mobile` needs a
real browser with localStorage and a network it can lose. Everything above is unit-level plus the
tsc class check. **What you should check on the deployed site:** put `/pos/mobile` in airplane mode,
ring three sales, come back online, and confirm all three appear once; then force one to fail and
confirm the other two sync while the failed one **stays** in the queue and is named on screen.

**The end-to-end proof this sprint cannot give you** is that `synced_from_offline = true` finally
matches a row. That number has been 0 for the life of the product; the first non-zero value is the
real confirmation, and it needs a device.

---

## OPEN AFTER THIS

| # | item | state |
|---|---|---|
| G11 | sync swallows errors | **closed** |
| — | offline queue/server shape mismatch | **closed** (was never in the register) |
| — | terminal reads a key nothing writes | **closed**; terminal still has no offline *queueing* |
| G7 | offline | still `POS-OFFLINE-1` — the till cannot queue, only mobile can |
| C5 | typed inserts | **half** — sync route yes, `createSale`'s `salePayload` no |
| G3 | `amount_cents` readers | open |
| G8/G9/G10/G12 | unchanged | open |

**Still parked and yours:** the two phantom payment rows on sale `1296dff9` (`1c5e1390`,
`239f6a7d`). Money-table deletion — untouched, and I will not touch it without your word.
