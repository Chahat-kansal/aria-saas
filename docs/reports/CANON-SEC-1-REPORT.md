# CANON-SEC-1 — Closing the 4 Missing-Business-Scope Gaps from CANON-MIGRATE-1 Triage

Follow-up to CANON-MIGRATE-1's Bucket C: 4 handlers (5 including `pos/expiry-alerts`' two affected
methods) were flagged as genuine pre-existing missing-business-scope security gaps, not migration
candidates. This sprint fixes exactly those 5 handlers — same class as SECURITY-CRITICAL-1..4 (a
route reads/writes without confirming the row belongs to the caller's business). Not a migration
sprint, not a new hunt.

No divergence from CANON-MIGRATE-1-REPORT.md's Bucket-C list was found — all 4 named items were
real, at the exact locations described.

---

## Part 1 — the real gap, precisely, before any fix

Live `pg_policies` checked for all 5 tables before touching any code, applying the SC-1..4 lens
(**supabaseAdmin = no RLS backstop = must carry its own check**; RLS-scoped client + a solid RLS
policy = defense-in-depth-only unless proven otherwise):

| Handler | Client | Table | RLS policy found | Verdict |
|---|---|---|---|---|
| `aria/compliance` PATCH | RLS-scoped (`createServerSupabaseClient`) | `compliance_items` | `own_compliance`/`own_compliance_items`, `ALL`, business-scoped, no `WITH CHECK` | **Defense-in-depth only.** Postgres treats a bare `USING` clause as the `WITH CHECK` too when one isn't set — a foreign row is invisible to the session for both the match and the write, so a foreign `id` matches zero rows today even without app-level scoping. |
| `pos/expiry-alerts` PATCH | RLS-scoped | `pos_expiry_alerts` | `biz_expiry_alerts`, `ALL`, business-scoped, no `WITH CHECK` | **Defense-in-depth only** — same reasoning. |
| `pos/expiry-alerts` POST | **Mixed** — RLS client for the initial `pos_products` ownership check, then **`supabaseAdmin`** for every write | `pos_products` (RLS: `biz_products`, `ALL` + `WITH CHECK`, business-scoped — solid), `pos_expiry_alerts`, `pos_waste_log` | **Genuinely exploitable.** `product_id` was legitimately gated by the RLS-scoped SELECT (safe on its own), but `alert_id` — a second, independent client-supplied id — was **never checked against the product or the business at all** before its `supabaseAdmin` write. `supabaseAdmin` bypasses RLS unconditionally, so this was the one real hole: a caller could supply their own valid `product_id` (passes the gate) alongside a **foreign business's `alert_id`** and silently acknowledge/dismiss that foreign alert. This is the exact "verified primary id, unverified secondary id reaching a write" shape from SECURITY-CRITICAL-1. |
| `social/inbox` PATCH | RLS-scoped | `social_inbox` | `social_inbox_owner`, `ALL` **with `WITH CHECK`**, business-scoped | **Defense-in-depth only** — the strongest of the four; both read-visibility and write-validation are explicitly enforced by the policy. |
| `social/library` DELETE | RLS-scoped | `social_content_library` | `social_content_library_owner`, `ALL` **with `WITH CHECK`**, business-scoped | **Defense-in-depth only** — same as above. |

**Honest calibration, as asked**: 4 of the 5 handlers (`compliance` PATCH, `expiry-alerts` PATCH,
`social/inbox` PATCH, `social/library` DELETE) were **not actually exploitable** in production —
RLS already blocked the cross-tenant case in every one of them, confirmed live against
`pg_policies`, not assumed. Only `pos/expiry-alerts` POST's `alert_id` path was a real, live gap
(it rides `supabaseAdmin`, which has no RLS to fall back on regardless of policy). All 5 are fixed
anyway, because this codebase's own standing convention (established across BUG-HUNT-1
through CANON-MIGRATE-1) is explicit business-scoping everywhere, not reliance on RLS alone —
but the severity claim above is the honest one, not manufactured to justify the sprint.

---

## Part 2 — the fix, and whether it landed on the rail

All 5 handlers had **zero existing business-resolution step of their own** (no local `getBid()`
call, in any of them) — each file's *sibling* handlers (GET/POST) already had a working local
`getBid()`, but the specific broken handler skipped it entirely. That absence is exactly why
`withBusinessContext()` was a clean fit for all 5: there was no existing "no business" response
shape to preserve or conflict with, so wrapping is strictly additive (a caller with no business now
gets an explicit `400 No business` instead of a silent 0-rows-affected success) — no regression for
any real owner, who always has a business.

| Handler | Fix | On the rail? |
|---|---|---|
| `aria/compliance` PATCH | `.eq('id', id).eq('business_id', bid)` | **Yes** — `withBusinessContext`. GET/POST keep their existing local `getBid()` (still used, untouched — extend-never-remove). |
| `pos/expiry-alerts` PATCH | `.eq('id', id).eq('business_id', bid)` | **Yes** — `withBusinessContext`. GET keeps its own local `getBid()` (bucket B per CANON-MIGRATE-1 — client-supplied `business_id` override pattern, untouched). |
| `pos/expiry-alerts` POST | Explicit `business_id` scoping added to **all four** id-keyed operations: the `pos_products` ownership SELECT, the `pos_products` price/stock `supabaseAdmin` UPDATE, and **both** `pos_expiry_alerts` `supabaseAdmin` UPDATEs (`mark_down` and `write_off` branches) that reference `alert_id` | **Yes** — `withBusinessContext`. This is the sprint's clearest case of "the fix and the canonicalization are the same act": migrating onto the wrapper is what supplies the resolved+verified `bid` the fix needed. |
| `social/inbox` PATCH | `.eq('id', id).eq('business_id', bid)` | **Yes** — `withBusinessContext`. GET/POST keep their existing local `getBid()` (untouched). |
| `social/library` DELETE | `.eq('id', id).eq('business_id', bid)` | **Yes** — `withBusinessContext`. GET/POST keep their existing local `getBid()` (untouched). |

All 5 fit the rail. None needed a standalone ownership check outside `withBusinessContext` — there
was no behavior-divergent response shape to work around in any of them.

---

## Part 3 — cross-tenant proof

No live user session exists in this environment, so per this session's established method
(identical to CANON-RAIL-1/CANON-MIGRATE-1's own VERIFY steps): simulated the exact fixed
WHERE-clause shape directly via SQL, authenticated-in-spirit as a real second business (Global
Liquor, `e9fee069-ac40-4c0d-b7bb-33f09bfc19ea`) targeting real rows belonging to a different real
business (Sip Café, `ff5055a0-c351-4ada-817a-1804961035f3`, and vice versa where the real row
happened to belong to Global Liquor instead) — never a fabricated row.

| Check | Rows matched | Verdict |
|---|---|---|
| `compliance_items` PATCH shape, attacker=Sip Café targeting a **real Global Liquor** compliance item | 0 | Blocked |
| Same row, queried as its real owner (Global Liquor) | 1 | Legit owner unaffected |
| `pos_expiry_alerts` PATCH shape, attacker=Global Liquor targeting a **real Sip Café** alert | 0 | Blocked |
| Same row, queried as its real owner (Sip Café) | 1 | Legit owner unaffected |
| `pos/expiry-alerts` POST's product-ownership gate, attacker=Global Liquor targeting a **real Sip Café** product | 0 | Blocked |
| Same product, queried as its real owner (Sip Café) | 1 | Legit owner unaffected |
| `pos/expiry-alerts` POST's `alert_id` write (**the actual exploit path**) — attacker's own business_id against the real Sip Café alert | 0 | **Blocked — the real gap is closed** |

**`social/inbox` and `social/content_library` have zero production rows** (confirmed via
`count(*)`, both tables entirely empty) — there is no real row to test a live cross-tenant read/write
against. Per the sprint's own allowance, verified instead via the identical ownership primitive
every other fix in this sprint (and CANON-RAIL-1/CANON-MIGRATE-1 before it) relies on:
`businesses.id = <foreign id> AND user_id = <attacker's real user_id>` returns 0 rows;
`businesses.id = <their own id> AND user_id = <their own real user_id>` returns 1. Since both fixed
queries are literally `.eq('id', <target>).eq('business_id', bid)` where `bid` comes from this exact
primitive (`withBusinessContext` → `resolveOwnerBusinessId`), a foreign business_id can never
satisfy the second half of the WHERE clause — the same guarantee, just without a row to physically
click through.

---

## Build gate

`npx tsc --noEmit` — 0 errors. `npx tsx scripts/canon-rail-guard.ts --working-tree` — passes clean
(all 5 changes remove/tighten scoping, none introduce a new inline resolver). `npm run build` —
succeeded (exit 0). Single commit, per sprint rule.
