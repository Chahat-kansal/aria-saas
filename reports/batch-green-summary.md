# BATCH-GREEN — unattended run summary (2026-06-14)
Run of `prompts/batch-green (1).md` (file on disk has a " (1)" suffix). 4 sprints, additive, no DB/migration/RPC/push.

> **Staging note:** the batch says `git add -A`, but the working tree has pre-existing unrelated changes
> (`src/app/api/community/feed|stories/route.ts`, `supabase/.temp/*`, untracked `docs/`, `story-view/`).
> To avoid committing other people's WIP into these sprint commits, I stage **only each sprint's own files**.
> This matches the batch's per-sprint revert model.

## Top summary table
| sprint | status | SHA | note |
|---|---|---|---|
| CRON-1 | PASS | _pending_ | read-only census doc |
| FA-2.4 | _pending_ | | bg removal |
| FA-2.5 | _pending_ | | nsfw gate |
| FA-2.6 | _pending_ | | nano suggest |

---

## SPRINT 1 — CRON-1 (cron vs function-config census) — ✅ PASS
**Status:** PASS · **Commit:** _pending (filled after commit)_
**Files created:**
- `reports/cron-census-2026-06-14.md` — full census: 55 scheduled crons (path·schedule·route·fn-config·purpose), 8 orphan routes, 0 orphan schedules, 0 sub-daily, 9 fn-config globs (≤22).
- `reports/batch-green-summary.md` — this running summary.
**Files edited:** none. **Deps added:** none. **Integration point:** none (documentation only — no code wired).
**Build gate (verbatim):**
- `npx tsc --noEmit` → exit 0 (no output).
- `npx next build` → exit 0 (compiled successfully; route table printed, ends with the Static/SSG/Dynamic legend).
**Assumptions / unverifiable:** purpose column is inferred from route names (not from reading each route body). Orphan-route "likely trigger" is inference.
**TO FIX WHEN BACK:** decide whether the 8 orphan cron routes (`clv-outcomes`, `clv-weekly`, `flash-outcomes`, `flash-revenue`, `generate-briefings`, `memory-consolidate`, `reviews-weekly-digest`, `run-scheduled-reorders`) should be scheduled or removed. Also: `pattern-memory` is scheduled correctly but its route insert currently fails (see db-wiring-audit) — unrelated to scheduling.
