# Aria OS — Runner Protocol
How to execute sprints from MANIFEST.md.

---

## Before any sprint run

1. `git pull origin main` and confirm you're on the latest commit
2. Verify MANIFEST.md sprint STATUS is not `IN-PROGRESS` (would mean a previous run didn't finish)
3. Check the sprint's MODE tag: SOLO or BATCH
4. For BLOCKED sprints: do not proceed; state the credential/decision required

---

## SOLO mode execution

> Use for any sprint touching DB schema, money, auth, crons, Stripe, payroll, or the Aria brain.

### Step-by-step

1. **Update MANIFEST.md**: change sprint status from `READY/PARTIAL/ABSENT` → `IN-PROGRESS`
2. **Open the sprint file** (`prompts/SXXX-name.md`)
3. **Execute Pre-flight** (all steps, including step 9: sibling/duplicate-table check)
4. **Fill CONSTRAINT CATALOGUE** — run live SQL for every table this sprint touches; write results into the sprint file before writing any code
5. **Implement** — follow the sprint scope exactly; no scope creep
6. **Aria Intelligence tasks** — complete every item in the sprint's Aria Intelligence Rule section
7. **Run build gate**:
   ```
   npx tsc --noEmit       # MUST be zero errors
   npm run build          # MUST pass
   ```
8. **Write sprint report**: create `reports/sprint-SXXX-report.md` with the Founder-verify checklist filled in
9. **Stop before push** — do not `git push`. State clearly:
   ```
   ⏸ AWAITING VERIFY — sprint SXXX ready. Report at reports/sprint-SXXX-report.md.
   Founder: complete the verify checklist, then run:
     git push origin main && git log origin/main..HEAD
   ```
10. **Update MANIFEST.md**: change status → `AWAITING-VERIFY`

### After founder verify

Once the founder has completed the checklist and confirmed no regressions:
```
git push origin main
git log origin/main..HEAD    # MUST be empty
```
Update MANIFEST.md: `AWAITING-VERIFY` → `DONE`

---

## BATCH mode execution

> Use for UI polish, renderers, docs, and client-only work with zero new DB writes.

1. Identify the contiguous run of BATCH sprints at the top of MANIFEST.md (stop at first SOLO or BLOCKED)
2. Execute all BATCH sprints sequentially in one session
3. After all BATCH sprints complete: run ONE combined build gate:
   ```
   npx tsc --noEmit
   npm run build
   ```
4. Make ONE combined commit (all BATCH sprint changes together)
5. Write ONE combined report: `reports/batch-YYYY-MM-DD-report.md`
6. Push immediately (no founder verify required for BATCH):
   ```
   git push origin main
   git log origin/main..HEAD    # MUST be empty
   ```
7. Update all BATCH sprint statuses in MANIFEST.md → `DONE`

---

## Pre-flight protocol (all sprints)

Every sprint file includes this pre-flight; execute it fully before touching code.

1. `git status` — confirm clean working tree
2. `git log --oneline -3` — confirm on correct base commit
3. `npx tsc --noEmit` — must be zero errors before you start
4. Read CLAUDE.md (project root) — confirm all RULES are loaded
5. Read AUDIT_STATE.md → Column traps section — internalize for every table this sprint touches
6. Read RULE 6 column trap list (also in CLAUDE.md)
7. For every API route this sprint changes: trace the A→B→C dependency chain
8. For every component this sprint changes: confirm it does not import from the RULE 5 locked files
9. **Sibling/duplicate-table check**: for each table this sprint writes, run:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name ILIKE '%<stem>%'
   ORDER BY table_name;
   ```
   Examples: `%briefing%`, `%action%`, `%timesheet%`, `%customer%`
   Confirm you are writing to the CORRECT table (not a legacy or sibling table).

---

## CONSTRAINT CATALOGUE instruction (copy into every sprint file)

```
FIRST ACTION at execution time: run live SQL against Supabase for every
table this sprint touches — column types, CHECK constraints verbatim,
FKs, UNIQUE constraints, numeric columns used in UI — and write the
results into this section before any code is written. Never use values
from docs or memory; schemas drift.

SQL to run for each table TABLE_NAME:
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'TABLE_NAME'
  ORDER BY ordinal_position;

  SELECT conname, contype, pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'TABLE_NAME'::regclass
  ORDER BY contype;
```

---

## MANIFEST status state machine

```
READY / PARTIAL / ABSENT
        ↓  (runner picks up sprint)
   IN-PROGRESS
        ↓  (build gate passes, report written)
  AWAITING-VERIFY  ← SOLO only; BATCH skips this state
        ↓  (founder completes verify checklist)
      DONE
```

BLOCKED stays BLOCKED until founder resolves the dependency.

---

## Reports directory

All sprint reports live in `reports/` (gitignored is fine; commit to main for traceability).

### Sprint report template (`reports/sprint-SXXX-report.md`)

```markdown
# Sprint SXXX — <name>
Date: YYYY-MM-DD
Commit: <hash>
Mode: SOLO / BATCH

## Constraint catalogue (filled at execution time)
[table name → columns, constraints]

## What changed
[bulleted summary, one bullet per file]

## Build gate
- tsc: 0 errors ✅
- npm run build: PASS ✅

## Founder verify checklist
(copy from sprint file and tick each item)
- [ ] ...

## Regressions checked
- [ ] <list pages/features that might be affected>

## Next sprint
<name of next sprint in MANIFEST>
```
