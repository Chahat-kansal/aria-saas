# Prompt 207 — PRR-5: Data Safety

Fifth production-readiness phase. Customer data and business data must NEVER be lost.
This phase ensures backups exist, restores actually work, migrations are safe, and
destructive operations can't wipe data accidentally.

## Pre-flight + MANDATORY COMMIT PROTOCOL
Read CLAUDE.md FIRST — the mandatory commit protocol at the top.
Before EVERY commit: npx tsc --noEmit → npm run build → commit → push → verify empty.
At the end: final npm run build green, state "Build verified green, all pushed."

## TASK 1 — Verify Supabase backups are enabled
Supabase has automatic backups, but verify the actual policy:
1. Document in DATA_SAFETY.md what Supabase plan is active and its backup policy:
   - Free: daily backups, 7-day retention (or none on some plans)
   - Pro: daily backups, 7-day retention, PITR available as add-on
2. If on a plan without point-in-time-recovery (PITR), document the risk + recommend enabling it
   before significant customer data accumulates.
3. Verify backups exist via Supabase dashboard (document where to find them).
Commit: "docs(data-safety): document Supabase backup policy + retention"

## TASK 2 — Application-level export/backup
Don't rely solely on Supabase. Add a business-data export so an owner can get their data out
(also satisfies data portability under privacy law).
Create src/app/api/business/export/route.ts (owner-only):
- Export all of a business's data as JSON: products, sales, customers, invoices, settings
- Stream it as a downloadable file
- This is both a feature (data portability) AND a safety net (manual backup)
Commit: "feat(data-safety): full business data export (JSON) for owners"

## TASK 3 — Restore test (CRITICAL — backups are worthless if restore doesn't work)
Document and verify a restore procedure in DATA_SAFETY.md:
1. How to restore from a Supabase backup (steps)
2. How to re-import from the JSON export (Task 2)
3. ACTUALLY TEST IT: create a test business, export it, delete some data, re-import, verify it restored.
   Document the result. (A backup you've never restored is not a backup — it's a hope.)
Commit: "docs(data-safety): tested restore procedure (backup + JSON re-import)"

## TASK 4 — Migration safety
Database migrations can destroy data if careless.
Review the migrations directory + establish rules in DATA_SAFETY.md:
- NEVER DROP COLUMN or DROP TABLE without an explicit, reviewed decision (RULE 0!)
- Destructive migrations must be flagged and backed up first
- All migrations must be reversible or have a documented rollback
- New columns: nullable or with defaults (don't break existing rows)
Audit recent migrations for any destructive operations that ran without backup.
Commit: "docs(data-safety): migration safety rules + audit of existing migrations"

## TASK 5 — Soft-delete verification + accidental-deletion guards
Verify destructive operations don't hard-delete by default:
```bash
grep -rn "\.delete()" src/app/api/ --include="*.ts"
```
For each .delete():
- Customer/sale/product/invoice deletes should be SOFT (archived flag) by default
- Hard delete only via explicit ?permanent=true (already added for customers in PRR-2)
- Verify no cascade delete accidentally wipes related data
- Bulk deletes must have extra confirmation/guards
RULE 0: removing customer-facing delete features is NOT the fix — making them safe (soft) is.
Commit: "fix(data-safety): soft-delete by default on destructive operations"

## TASK 6 — Transaction integrity on multi-step writes
Operations that write to multiple tables (a sale → pos_sales + pos_sale_items + loyalty +
stock) must not leave partial data if one step fails.
For pos/sale and similar multi-table writes:
- Use a Postgres transaction (RPC function with BEGIN/COMMIT) OR
- Ensure a clear cleanup/compensation path if a later step fails
- The worst case is a sale recorded with no line items, or stock deducted for a sale that
  didn't complete
Identify the critical multi-table writes and ensure atomicity.
Commit: "fix(data-safety): transactional integrity on multi-table writes"

## TASK 7 — Audit trail for sensitive changes
For sensitive mutations (price changes, refunds, voids, payroll, customer data changes, deletions):
- Ensure there's an audit log entry (who, what, when, old value → new value)
- Check if an audit_log / deletion_audit table exists; if partial, extend coverage
- This protects against disputes AND helps recover from mistakes
Commit: "feat(data-safety): audit trail on sensitive mutations"

## TASK 8 — DATA_SAFETY.md runbook
Consolidate into DATA_SAFETY.md:
- Backup policy + retention + where to find backups
- Tested restore procedure (step by step)
- Migration safety rules
- Soft-delete policy + how to recover soft-deleted data
- Data export feature
- What to do if data loss is suspected (incident response)
Commit: "docs(data-safety): DATA_SAFETY.md complete runbook"

## PRR-5 EXIT CHECKLIST
- [ ] Supabase backup policy documented + verified
- [ ] PITR risk assessed (recommend enabling if not on)
- [ ] Business data export (JSON) working
- [ ] Restore procedure documented AND actually tested
- [ ] Migration safety rules established + existing migrations audited
- [ ] Destructive ops soft-delete by default
- [ ] Multi-table writes are atomic (no partial data)
- [ ] Audit trail on sensitive mutations
- [ ] DATA_SAFETY.md complete
- [ ] npx tsc --noEmit + npm run build pass
- [ ] All pushed (git log origin/main..HEAD empty)
- [ ] Deploy green

Update PRODUCTION_READINESS.md: check off PRR-5. Next: PRR-6 (testing — the big one).

## Rules (RULE 0 + commit protocol)
- NEVER add data-safety by removing features (no "delete the delete button")
- Soft-delete preserves data + the feature; that's the upgrade
- Test the restore — a documented-but-untested restore is a failure of this phase
- Build MUST pass before every commit

## Start
TASK 1 (verify backups) + TASK 3 (test restore) are the foundation — if backups don't
exist or restore doesn't work, nothing else matters. Confirm those first.
