# S09 — Roster & Staff Intelligence
STATUS: DONE | MODE: BATCH
Covers: prompts/16, 43

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: staff_members (first_name+last_name, NOT name), staff_shifts, pos_rosters, pos_timesheets
Run live SQL before any edit.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] /dashboard/staff → roster view shows current week with shifts
- [ ] AI roster generation creates a pos_rosters row with shifts jsonb populated
- [ ] Timesheet clock-in/out → pos_timesheets row created
- [ ] Labour cost shown on roster view
- [ ] Staff portal login works for a staff_member

## Push
BATCH mode.
