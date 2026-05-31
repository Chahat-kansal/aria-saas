# Audit Session 7 — False-Positive Reconciliation (verify earlier fixes didn't break features)

Session 6 discovered that some earlier audit "fixes" may have been WRONG — they changed
or removed code that referenced columns which actually DO exist in the live DB. This is a
RULE 0 violation (upgrade-only): a false-positive "fix" that removes a real feature is a downgrade.

## Pre-flight
```
git pull origin main
```
Read CLAUDE.md (RULE 0 — upgrade only) and AUDIT_STATE.md.

## Confirmed live DB facts (queried 2026-05-31 — these columns ARE REAL)
- pos_sales.points_earned ✓ EXISTS
- pos_sales.points_redeemed ✓ EXISTS
- pos_sales.total_amount ✓ EXISTS (so total→total_amount fixes were CORRECT, keep them)
- staff_members.name ✓ EXISTS (plus first_name, last_name — all three real)
- pos_products.track_stock ✓ EXISTS
- pos_products.track_inventory ✓ EXISTS (separate column)
- pos_products.low_stock_threshold ✓ EXISTS
- pos_products.reorder_point ✓ EXISTS (separate column)

## Mission
Find any earlier audit fix that REMOVED or CHANGED a reference to a column that actually
exists, thereby breaking or degrading a feature. Restore the functionality (RULE 0).

## Steps

### 1. Audit the pos_sales points removal (HIGHEST PRIORITY)
Session 2 may have removed points_earned/points_redeemed from a query or insert thinking
they didn't exist. They DO exist.
```bash
git log --all --oneline | grep -i "points\|loyalty\|pos_sales"
git log -p --all -S "points_earned" -- "src/**/*.ts" | head -200
```
Find where points_earned/points_redeemed were removed. Check if the CURRENT code still
records loyalty points on a sale. If a sale no longer writes points_earned/points_redeemed
because of an audit fix → RESTORE it. This is a broken feature.

### 2. Review every "removed column" fix from sessions 1-6
For each audit commit that REMOVED a column from a select/insert (not renamed — removed):
```bash
git log --all --oneline --grep="removed\|remove\|non-existent\|doesn't exist"
```
For each: query the live DB to confirm the column truly doesn't exist:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'X' AND column_name = 'Y';
```
- If column DOESN'T exist → the fix was correct, leave it
- If column DOES exist → the fix was a false positive that removed a feature → RESTORE the reference

### 3. Review every "renamed column" fix
For renames (e.g. total → total_amount, customer_segment → segment), verify the NEW name
is correct AND the OLD name doesn't also exist as a separate column with different meaning.
Most renames are correct (confirmed: total_amount, line_total, segment, items_on_hand).
Just double-check none introduced a regression.

### 4. The staff_members.name question
staff_members HAS name, first_name, AND last_name. Earlier fixes changed name → first_name+last_name.
- If the original code used `name` and it worked → those changes were unnecessary but NOT harmful
  (name still exists), so leave them — they're semantic improvements, not regressions
- BUT if any change BROKE a query (e.g. selected first_name where the table genuinely lacked it
  in some context) → fix it
- Do NOT revert these unless they actually broke something

## Fix rule (RULE 0)
- Restore any feature that a false-positive fix removed
- Verify against live DB before changing anything (query information_schema)
- One commit per restoration: "fix(restore): re-add [column] to [route] — column exists, earlier removal broke [feature]"
- npx tsc --noEmit + npm run build before commit
- git push origin main + verify after each commit

## Output
```
RECONCILIATION COMPLETE
False positives found: N
  - file: what was wrongly removed → restored (commit)
Confirmed-correct fixes (no action): M
Features restored: [list]
```
Update AUDIT_STATE.md.

## Start
Begin with Step 1 — the pos_sales loyalty points issue. That's the most likely real
feature regression. Verify against live DB, restore if broken.
