# Prompt 203 — Consolidated Silent-Failure Sweep (final verification)


## UI/UX & ANIMATION REQUIREMENTS
Before writing any frontend code, read these skill files in full:
- /mnt/skills/user/ui-ux-pro-max/SKILL.md — apply design tokens, color palettes, font pairings, and component patterns from this skill to every page and component you create or edit
- /mnt/skills/public/frontend-design/SKILL.md — apply production-grade frontend patterns

For any page that involves data visualization, reports, charts, or animated content, also read:
- /mnt/skills/public/remotion/SKILL.md (if it exists) — use Remotion for any video/animation exports or animated report components

Apply these skills silently — do not narrate reading them. Just produce better UI as a result.
Every dashboard page must use the design system from ui-ux-pro-max: correct spacing, typography, color tokens, and component hierarchy. No plain HTML divs with inline styles that ignore the design system.

The definitive single-pass sweep for ALL pattern-detectable silent failures. Re-runs every
check class from Sessions 6/7 + prompt 202, PLUS new classes not yet covered. This is the
most complete static sweep possible.

## HONEST SCOPE — what this DOES and does NOT catch
CATCHES (pattern-detectable): un-awaited writes, RLS empties, unchecked errors, .single()
crashes, swallowed catches, column mismatches, race conditions on increments, unhandled
third-party API error shapes, missing ownership checks.
DOES NOT CATCH (needs runtime testing — PRR-6): logic bugs returning wrong-but-valid data,
data-dependent edge cases, timing races across requests. Do not claim "zero silent failures"
after this — claim "all pattern-detectable classes swept."

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0). After EVERY commit: push + verify (git log origin/main..HEAD empty).

## METHOD
This is a VERIFICATION sweep. Most classes were done in prior sessions — confirm they hold,
fix any stragglers, and do the NEW classes (8, 9, 10) thoroughly. Work file-by-file across
ALL of src/app/api/ and src/lib/. For each file, run all 10 checks below.

---

## CHECK 1 — Un-awaited background writes (waitUntil)
```bash
grep -rn ";(async\|void (async\|).catch(() =>\|fire-and-forget\|non-blocking" src/app/api/ src/lib/ --include="*.ts"
```
Any un-awaited async doing a DB write or external call that NEEDS to complete → waitUntil from @vercel/functions.
(Prompt 202 did the main ones — verify none remain.)

## CHECK 2 — RLS anon-key silent empties
For every route/lib using createServerSupabaseClient/anon client on a server-side data fetch
of an RLS table → must use supabaseAdmin (with upstream ownership check).
```bash
grep -rln "createServerSupabaseClient\|createServerClient" src/app/api/ src/lib/ --include="*.ts"
```

## CHECK 3 — Unchecked Supabase errors
```bash
grep -rn "const { data" src/app/api/ src/lib/ --include="*.ts"
```
Every destructured query: is `error` checked? If the result matters and error is dropped → handle it.

## CHECK 4 — .single() that can hit 0 rows
```bash
grep -rn "\.single()" src/app/api/ src/lib/ --include="*.ts"
```
If the query isn't guaranteed exactly-one-row → .maybeSingle().

## CHECK 5 — Swallowed catch blocks
```bash
grep -rn "catch {}\|catch (e) {}\|catch { return \[\]\|catch { return null" src/app/api/ src/lib/ --include="*.ts"
```
Real failures masked as empty/null → log the error; return proper status where the result matters.

## CHECK 6 — Missing await on mutations
```bash
grep -rn "supabase.*\.\(insert\|update\|delete\|upsert\)" src/app/api/ src/lib/ --include="*.ts"
```
Any mutation not awaited (and not intentionally in waitUntil) → add await or waitUntil.

## CHECK 7 — Ownership checks (re-verify Session 6 completeness)
```bash
grep -rln "business_id" src/app/api/ --include="*.ts"
```
Every business-data route: ownership check present, OR scoped to user_id, OR under /api/public/ (exempt).

---

## NEW CLASSES (not done before — do these thoroughly)

## CHECK 8 — Race conditions on read-modify-write increments
THE BUG: reading a value, computing new value in JS, writing it back. Two concurrent requests
both read the old value → one update is lost.
```typescript
// RACE-PRONE:
const { data } = await supabase.from('pos_customers').select('loyalty_points').eq('id', id).single()
await supabase.from('pos_customers').update({ loyalty_points: data.loyalty_points + 10 }).eq('id', id)
// Two sales at once → one point gain lost
```
```bash
grep -rn "loyalty_points\|stock_quantity\|qty_on_hand\|items_on_hand\|visit_count\|total_spent\|uses_count\|points" src/app/api/ --include="*.ts"
```
For each read-then-write increment on a counter/balance:
FIX with an atomic operation. Either:
- A Postgres RPC function that does `UPDATE ... SET col = col + X` atomically, OR
- supabase.rpc('increment_column', {...})
Create a generic SQL function via migration:
```sql
CREATE OR REPLACE FUNCTION increment_numeric(
  p_table text, p_id uuid, p_column text, p_amount numeric
) RETURNS void AS $$
BEGIN
  EXECUTE format('UPDATE %I SET %I = COALESCE(%I,0) + $1 WHERE id = $2', p_table, p_column, p_column)
  USING p_amount, p_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;
```
Priority targets: loyalty points on sale, stock deduction on sale, promo uses_count, visit_count.
These are the ones where concurrent transactions realistically collide.
Commit per fix: "fix(race): atomic increment for [column] — was read-modify-write race"

## CHECK 9 — Unhandled third-party API error shapes
THE BUG: code assumes Stripe/Twilio/SendGrid/Bunny/Cloudflare/Basiq/Anthropic returns success
shape, doesn't handle their error response → crashes or silently continues with bad data.
```bash
grep -rn "await fetch(\|stripe\.\|twilio\|sendgrid\|sgMail\|.messages.create\|anthropic\|bunnycdn\|cloudflare" src/app/api/ src/lib/ --include="*.ts"
```
For each external API call:
1. Is the HTTP status / response checked before using the result?
2. Is there a try/catch?
3. If the call fails, does the user get a clear error (not silent success)?
4. For payment/SMS/email: a failure MUST be surfaced, never swallowed.
Fix: check response.ok / response status, handle error shape, return meaningful error.
Commit per fix: "fix(external): handle [provider] error response — was assuming success"

## CHECK 10 — Insert/update no-op detection on critical mutations
For critical writes (price changes, payments, status updates, ownership-scoped updates):
after .update().eq(...), if zero rows matched it silently did nothing.
For critical ones, add .select() and check the returned row count:
```typescript
const { data, error } = await supabase.from(x).update(y).eq('id', id).eq('business_id', bid).select()
if (!error && (!data || data.length === 0)) {
  return errors.notFound('Record not found or not owned')
}
```
Apply to: price updates, payment status, refunds, void, settings saves. Not needed for analytics.
Commit per fix: "fix(noop): detect zero-row update on [route]"

---

## Output
```
CONSOLIDATED SWEEP COMPLETE
Check 1 (waitUntil): X verified, Y fixed
Check 2 (RLS): X verified, Y fixed
... (all 10)
NEW bugs found this sweep: N
  - file: class → fix (commit)
Total silent-failure classes swept: 10/10 pattern-detectable
NOT covered (needs PRR-6 testing): logic bugs, data-edge-cases, cross-request timing
```
Update AUDIT_STATE.md: "Consolidated silent-failure sweep complete — all 10 pattern classes."

## Rules (RULE 0)
- Every fix is an UPGRADE — making unreliable writes reliable. Remove nothing.
- Atomic increments must not change behaviour, only make it concurrency-safe.
- External error handling must surface failures, not hide them.
- Don't slow the critical path — use waitUntil for background, atomic RPC for increments.
- npx tsc --noEmit + npm run build before every commit. Push + verify each.

## Start
Begin with CHECK 8 (race conditions) — it's new and high-impact (loyalty/stock on every sale).
Then 9, 10, then verify 1-7 hold. Create the increment_numeric SQL function first via migration.
