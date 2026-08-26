# RUN-POS-INTEGRITY-1 — PARKED AT STEP 1. NO CODE CHANGED.

**Run date:** 2026-08-27 · autonomous (RULE 20) · branch `main`
**Outcome:** Step 0 complete. **Steps 1–4 PARKED.** One docs commit, no schema, no code.

---

## THE ONE-SCREEN SUMMARY

**The sprint parks on RULE 10a — DDL is never mine — but that is not the headline.**

The headline is that **the sprint's central premise is contradicted by the live database and by the
code**, and I would have built the wrong thing if I had followed it straight through.

### The three things you most need to know

**1. G1 is not a blocker. It is e2e fixture data.**
"Payment detail missing for 97% of sales" is true as a raw count and false as a diagnosis. Coverage
by month, queried live:

| month | completed sales | with payment rows | covered |
|---|---|---|---|
| Feb 2026 | 2 | 0 | 0% |
| Mar 2026 | 3 | 0 | 0% |
| Apr 2026 | 677 | 0 | 0% |
| May 2026 | 967 | 32 | 3.3% |
| Jun 2026 | 146 | 16 | 11.0% |
| Jul 2026 | 3 | 2 | 66.7% |
| **Aug 2026** | **4** | **4** | **100%** |

The Apr/May bulk is `e2e/helpers/global-setup.ts:134`, which bulk-inserts sale rows directly. The
repeated `$9.99` rows are `e2e/pos.spec.ts:182,193` (the idempotency test). The
`00000000-0000-4000-e000-…aa` row is `scripts/verify-sale-movements.ts`. **None of these go through
the sale write path**, so none of them could ever have had tender detail. Every sale that *did* go
through the rail has exactly one payment row and **drift $0.00**.

**2. The rail already does most of Step 2.** `src/lib/pos/create-sale.ts:304-321` already writes
payment rows — single tender, the `split_cash`/`split_card` pair, **and** an arbitrary
`splitPayments[]` array. Idempotent replay is already implemented at `:172-179`. G1 and G2 are
substantially **already built**; what is genuinely missing is dollars, tenancy, and tips — which is
the migration, which is not mine to apply.

**3. The migration as written cannot run — and I found two live bugs worse than the gap register.**
Both below. The offline one silently destroys sales.

---

## STEP 0 — RECONNAISSANCE (the sprint's own gate)

> *"Report back, before coding: how many distinct places insert into `pos_sales`? That count decides
> whether this is one rail or N."*

### The answer: **11 insert sites. It is N. Fix the rail, leave the callers.**

My first grep was wrong and I am recording that. `from\('pos_sales'\)\s*$` matched every multi-line
*read*, giving ~170 false hits. Re-run with a proper chained-operation scan:

```
pos_sales .from() call sites by first chained op:
  insert   11
  upsert    2
  update   15
  delete    2
  select  329
```

**The 11 inserts:**

| # | path | what it creates |
|---|---|---|
| 1 | `src/lib/pos/create-sale.ts:260` | **THE RAIL** — every real checkout |
| 2 | `src/lib/pos/return-engine.ts:139` | return sale |
| 3 | `src/lib/pos/return-engine.ts:200` | exchange sale |
| 4 | `src/app/api/pos/laybys/route.ts:97` | layby |
| 5 | `src/app/api/pos/online-orders/[id]/route.ts:42` | online order → sale |
| 6 | `src/app/api/pos/refund-unlinked/route.ts:22` | unlinked refund |
| 7 | `src/app/api/pos/sales/[id]/refund/route.ts:49` | refund |
| 8 | `src/app/api/pos/sales/return/route.ts:71` | refund |
| 9 | `src/app/api/pos/sales/draft/route.ts:18` | draft / held cart |
| 10 | `src/app/api/pos/splits/ocr/from-scan/route.ts:21` | split from scan |
| 11 | `src/app/api/pos/sync-offline/route.ts:69` | **offline replay — see BUG 1** |

**The rail is already consolidated.** `createSale()` is called by `api/pos/sale/route.ts:132`,
`api/pos/sales/route.ts:145`, `api/public/place-order/[business_id]/route.ts:230`, and
`lib/pos/recover-online-order-sale.ts:61`. A prior sprint (POS-SALE-CONSOLIDATE-1, comment at
`create-sale.ts:293-296`) already merged two near-identical copies into it. **This sprint does not
need to build a rail. It needs to extend one.**

Of the other 10, **9 are refund/return/draft/layby paths**, which are a different money shape and
outside "record how the sale was paid". Only #11 is a real sale path that bypasses the rail.

### Repo state
```
pwd                     C:\Users\kansa\aria-saas-audit          ✓
git log origin/main..   empty (clean vs origin)                 ✓
git status              3 modified (.gitignore, package.json, package-lock.json) + 26 untracked
```
⚠️ The sprint says "must be clean". It is **not** — but those 29 entries are the pre-existing set
`CLAUDE.md` already flags as a `git add -A` hazard. They predate this session and I did not touch
them. **Not a blocker; recorded so nobody reads "clean" into it.**

### `pos_sale_payments` — every reference
```
WRITE  src/lib/pos/create-sale.ts:318          the rail
WRITE  src/app/api/pos/sale-payments/route.ts:42
READ   src/app/api/public/receipt/[sale_id]/route.ts:46
READ   src/app/api/pos/sales-history/[id]/route.ts:18
READ   src/lib/agents/reconciliation-agent.ts:129   (comment at :122 notes amount_cents = CENTS)
READ   src/app/api/aria/ask/route.ts:1040
—      src/app/api/cron/aria-health-monitor/route.ts:462   (a remediation string, not a query)
```
Note `api/pos/sale-payments/route.ts:34` already carries a comment explaining the table has no
`business_id` and is scoped through `sale_id` — the G6 problem is known and documented in code.

---

## WHY THE SPRINT PARKS HERE

**RULE 10a — YOU DO NOT WRITE SCHEMA.** Step 1 is DDL. RULE 20's NEVER-UNATTENDED list names DDL
first. I do not apply it, and I do not apply a corrected version of it either.

**RULE 10a, second clause** — *"The migration always lands BEFORE the code that reads it. If you are
asked to write code against a column that does not exist yet, stop and report."* Step 2 writes
`pos_sale_payments.amount`, `.business_id`, `.tip_amount` and `pos_sales.tip_total`. Verified live
against `information_schema.columns`: **none of the four exist.** So Step 2 stops too, and Steps 3–4
depend on Step 2.

**I did not commit the migration file either, and that is deliberate.** RULE 10a says to commit
given SQL byte-identical — but that instruction assumes the SQL is what *ran*. This SQL cannot run
(next section). Committing it would put a file in `supabase/migrations/` describing a schema that
does not exist, which is precisely the `git-migration ≠ prod-schema` drift RULE 10 calls a recurring
failure here — and which I filed against this repo yesterday in `docs/TEAM-AUDIT-2.md`. The correct
order is: founder approves corrected SQL → Claude-in-chat applies it → I commit **what actually
ran**, byte-identical. That is the same sequence S2B phase 0 followed when its proposal turned out to
contain a subquery Postgres rejects.

---

## THE MIGRATION CANNOT RUN AS WRITTEN — three defects, one fatal

### ❌ FATAL — `VALIDATE CONSTRAINT` will abort on 3 orphan rows

```sql
ALTER TABLE pos_sale_payments VALIDATE CONSTRAINT pos_sale_payments_sale_id_fkey;
```
Queried live:
```
payment_rows                       62
orphan_rows_would_break_validate    3     <-- payment rows whose sale_id has no pos_sales row
null_sale_id                        0
```
`VALIDATE CONSTRAINT` scans every existing row. Three of them point at sales that no longer exist,
so it raises a foreign-key violation and **the entire migration transaction rolls back** — taking the
columns, the backfill and the index with it. Exactly the failure shape S2B phase 0 hit.

Options, all needing your decision (I am not choosing one; it touches money data):
- leave the FK `NOT VALID` (new rows enforced, the 3 legacy rows tolerated), **or**
- resolve the 3 orphans first, **or**
- point them at their sale if it was voided-and-recreated.
⚠️ Note `ON DELETE CASCADE` on this FK means a future `pos_sales` delete silently deletes payment
rows — and `api/pos/sales/draft/route.ts:52` and `draft/[sale_id]/void/route.ts:24` **do** delete
sales.

### ❌ `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block
Migrations are applied in a transaction. `CONCURRENTLY` is rejected there by Postgres
(`25001 active_sql_transaction`). At **62 rows** a plain `CREATE INDEX` is instant and correct;
`CONCURRENTLY` buys nothing here.

### ⚠️ The CHECK does not say what its comment says
```sql
-- "a payment line must be a positive amount"
ADD CONSTRAINT pos_sale_payments_amount_positive CHECK (amount >= 0) NOT VALID
```
`>= 0` permits a **zero-dollar** payment line. If the intent is positive, it is `> 0`. Left as-is —
naming it is my job, changing your money semantics is not. (Live: 0 rows have negative `amount_cents`,
so either predicate validates cleanly today.)

### ✅ Correct in the given SQL, for the record
The `ADD COLUMN IF NOT EXISTS` calls, both backfills, the `NOT VALID` on the CHECK, and the explicit
instruction **not** to add an RLS policy for the new `business_id` are all right. That last point is
important and I verified it: the two existing policies scope through `sale_id → pos_sales →
businesses`, and a second policy would `OR` with them and widen access.

---

## TWO LIVE BUGS FOUND THAT ARE NOT IN THE GAP REGISTER

### 🔴 BUG 1 — every offline sale is silently destroyed on sync

`src/app/api/pos/sync-offline/route.ts:70-88` inserts into `pos_sales` with:
```
:82   synced_from_offline: true,
:83   offline_queued_at:   sale.queued_at,
```
**Neither column exists in production.** Verified against `information_schema.columns` — the only
matching columns on `pos_sales` are `xero_synced`, `source`, `idempotency_key`, `order_type`,
`direct_deposit_ref`, `gift_card_code`. So every insert fails with `42703 undefined_column`.

Then:
```
:88   if (saleErr || !saleRecord) { errors++; continue; }
```
The error is swallowed. The till receives `{ synced: 0, errors: N }` and **the queued sale is gone** —
no row, no retry, no log line naming the column. A day of offline trading would vanish.

The same landmine sits in the rail: `src/lib/pos/create-sale.ts:252`
```ts
if (params.synced) { salePayload.synced_from_offline = true; salePayload.offline_queued_at = params.synced.queuedAt }
```
Any caller passing `synced` makes the **whole sale insert** fail. Nothing passes it today
(grep: the only `params.synced` producer is that line itself), so the rail is safe *by accident of
having no caller*, not by design.

**This contradicts G7.** "No offline capability — zero tables matching `%offline%`/`%queue%`" is
looking for the wrong thing: the capability is a **route plus two columns**, the route exists and is
wired, and it is broken. POS-OFFLINE-1 is not greenfield — it is a repair.

### 🟠 BUG 2 — the payment insert is non-fatal, so a sale can complete with no tender record

`src/lib/pos/create-sale.ts:306-321`: the whole payment block is wrapped in `try { … } catch`, and
the insert error is handled as
```ts
:319   if (paymentsErr) console.error('[createSale] pos_sale_payments insert failed:', paymentsErr.message)
```
The sale still returns `200`. Compare the item insert immediately above (`:297-302`), which **voids
the sale** if it fails. Money-arrival detail is currently held to a weaker standard than line items.

This matters directly to Step 2's *"If it doesn't, the sale does not complete"* — that guarantee does
not exist today, and adding a `CHECK` on the table would convert this silent skip into a silently
skipped constraint violation unless `:319` is promoted to a hard failure at the same time.
**Deliberate design decision on the sale path — parked for you, not decided by me.**

---

## THE GAP REGISTER, RE-VERIFIED

| # | claim | verdict |
|---|---|---|
| G1 | payment detail missing for 97% | **Substantially wrong as a diagnosis.** Historical/e2e fixture data. Aug = 4/4 covered, drift $0.00. Forward path already works. |
| G2 | split tender legal but unrecordable | **Wrong.** `create-sale.ts:309-313` writes one `pos_sale_payments` row per tender for both split shapes. `pos_sale_splits`/`pos_split_payments` are empty because they are a *different, unused* mechanism (that is G8, not G2). Live: only 2 split sales exist at all. |
| G3 | cents in an Aria column | **Confirmed.** `amount_cents integer`. |
| G4 | idempotency key only 2% | **Confirmed as a count** (38/1846) — but the same fixture caveat as G1 applies, and the rail *honours* a key when given one (`:172-179`); it just never generates one. The real gap is caller-side. |
| G5 | no tips anywhere | **Confirmed.** No tip column on `pos_sales` or `pos_sale_payments`. |
| G6 | payment rows can orphan | **Confirmed, and now measured: 3 orphans exist.** Already documented in code at `api/pos/sale-payments/route.ts:34`. |
| G7 | no offline capability | **Wrong.** A route exists (`api/pos/sync-offline`), is wired, and is broken — see BUG 1. |
| G8 | seven dead twin tables | Not re-verified this run — **UNVERIFIED**. |
| G9 | fractional stock impossible | Not re-verified — **UNVERIFIED**. |
| G10 | hardware unproven | Not re-verified — **UNVERIFIED**. |

**The three things the preflight said it disproved — I did not touch, and did not re-test.** The
idempotency unique index, the stock-movement reversal uniques, and the payments RLS shape were
declared correct and RULE0-protected. I read the RLS reasoning and agree with it; I ran no test
against the other two.

---

## WHAT I NEED FROM YOU TO UNPARK

1. **A decision on the 3 orphan payment rows** (leave FK `NOT VALID` / resolve them / re-point them).
2. **Approve corrected DDL** — the given SQL with `CONCURRENTLY` dropped and the `VALIDATE` line
   resolved per (1). Apply it in chat via Supabase MCP, then hand me the SQL that actually ran and I
   will commit it byte-identical.
3. **A ruling on BUG 2**: should a failed payment insert void the sale? Step 2 implies yes; today it
   is a `console.error`. This changes sale-path behaviour, so it is yours.
4. **BUG 1** is independent of all of the above and is the most urgent thing in this document. It
   needs either the two columns added or those two lines removed from both files. Either way it is
   schema or a money-path behaviour change — both parked.

Once the columns exist, Step 2 is genuinely small: `create-sale.ts:307-316` gains `amount`,
`business_id` and `tip_amount` alongside the existing `amount_cents` (dual-write, as instructed), and
the idempotency key gets derived caller-side. The rail is already there.

---

## GATES

Nothing to gate — **no source file was modified**. `tsc`/`build`/`vitest` unchanged from the last
green run (S2B: 907/907, `BUILD_EXIT=0`). This commit is documentation only.

**Live queries run this session were read-only**: `information_schema.columns`, `pg_constraint`,
`pg_policies`, `count(*)`, and one `left join` aggregate. **No DDL, no DML, no migration.**
