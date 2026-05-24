# Aria OS — Roster Intelligence Upgrade
Wire leave, availability and skills into the roster calendar and AI draft.
ONE task, ONE commit, ONE push.

## STEP 0 — SYNC FIRST
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — READ BEFORE WRITING
Read these files IN FULL before touching anything:
- src/lib/aria/agents/rostering-agent.ts (the AI draft agent)
- The roster calendar component (search src/app/dashboard/staff for the
  roster/calendar view — find where shifts are rendered as calendar cells)
- src/app/api/staff/roster/route.ts
Do NOT write code before reading all of them.

## CONTEXT — DB TABLES ALREADY EXIST, do not create/alter tables

staff_leave: id, business_id, staff_id, leave_type, start_date (date),
end_date (date), days_taken, status ('pending'|'approved'|'rejected'),
notes, approved_by, approved_at, return_date.
Only status='approved' leave blocks scheduling.

staff_availability: id, business_id, staff_member_id, day_of_week (0=Sun,
1=Mon...6=Sat), specific_date (date, nullable), unavailable_from (time),
unavailable_until (time), reason, is_recurring (bool).
Two types: recurring (is_recurring=true, day_of_week set, specific_date
null) and one-off (is_recurring=false, specific_date set).

staff_skills: id, staff_member_id, business_id, skill_name, certified (bool),
certified_at (date), expires_at (date), created_at.

## PART A — ROSTER CALENDAR: visual indicators

### A1 — Leave overlay on calendar cells
When rendering the roster calendar (the weekly view with shift cards), for
each staff member × each day cell:
- Query approved staff_leave rows that overlap that day
  (start_date <= day AND end_date >= day AND status = 'approved')
- If the person has approved leave that day:
  - Show a coloured overlay or banner on that cell: amber/orange background,
    a small "🏖 Leave" label with the leave_type (Annual Leave, Sick, etc.)
  - If a shift is ALSO scheduled on that day (conflict): highlight the cell
    with a red border and show a warning icon ⚠ "Leave conflict"
  - The manager can still schedule someone on leave (don't hard-block) but
    the visual warning must be unmissable

### A2 — Unavailability indicator on calendar cells
For each staff member × each day cell, also check staff_availability:
- Recurring unavailability: is_recurring=true and day_of_week matches that
  day's day of week
- One-off unavailability: is_recurring=false and specific_date = that day
If either matches:
  - Show a subtle grey striped pattern or a small "Unavailable" chip on the
    cell (less prominent than leave — it's a preference, not an approval)
  - If a shift overlaps the unavailable time window: show an amber ⚠
    "Conflicts with availability" tooltip on the shift card
  - Again, do NOT hard-block — just make it visible

### A3 — Leave and unavailability in the staff member row header
In the roster's left-hand staff column (where names appear), for the
current week being viewed:
- Show a small 🏖 icon next to the name if they have any approved leave
  in that week
- Show a small 🕐 icon if they have any unavailability in that week
This gives the manager a quick scan of who has restrictions before even
looking at individual cells.

## PART B — AI DRAFT: feed the missing signals

Update generateRosterDraft in src/lib/aria/agents/rostering-agent.ts.
The existing three data fetches (staff, rules, sales) stay unchanged.
Add THREE more parallel fetches to the same Promise.all:

### B1 — Approved leave for the draft week
Fetch staff_leave rows where:
  status = 'approved'
  AND business_id = businessId
  AND start_date <= weekEnd (last day of the draft week)
  AND end_date >= weekStart (first day of the draft week)
Build a lookup: Set of "staffId-YYYY-MM-DD" strings for each day each
person is on leave. Pass this into the user prompt as:
  LEAVE THIS WEEK:
  - [Name]: on leave [start] to [end] ([leave_type])
Instruction to Claude: "Never schedule a staff member on a day they have
approved leave."

### B2 — Staff availability for the draft week
Fetch staff_availability rows where business_id = businessId.
Resolve which constraints apply to each day of the draft week:
- Recurring: is_recurring=true, day_of_week matches the weekday
- One-off: is_recurring=false, specific_date falls within the draft week
Build a human-readable list per staff member. Pass into the user prompt as:
  AVAILABILITY CONSTRAINTS:
  - [Name]: unavailable [day] [from]-[until] ([reason if set])
  - [Name]: unavailable every [Weekday] [from]-[until]
Instruction to Claude: "Do not schedule a shift that overlaps a staff
member's stated unavailability. If unavoidable, note it in reasoning."

### B3 — Staff skills
Fetch staff_skills rows where business_id = businessId AND certified = true
AND (expires_at IS NULL OR expires_at > weekStart).
Add to the staff list in the user prompt:
  - [Name] | [position] | [employment_type] | Skills: RSA, Barista L2, etc.
Add a rule to the ROSTERING_SYSTEM prompt: "For roles requiring RSA
certification (liquor store, bar), only schedule RSA-certified staff."

### B4 — Conflict guard in the output
After Claude returns the shifts, add a post-processing step before
returning the draft:
  For each generated shift, check if that staff member has:
  a. Approved leave that day → flag the shift with conflict: 'leave'
  b. Unavailability overlapping that time → flag with conflict: 'availability'
  Add a conflicts array to the return value:
  { shifts, reasoning, cost_cents, conflicts: [{staff_name, date, type, detail}] }
Return these conflicts to the UI so it can show a warning banner:
"Aria couldn't avoid 2 conflicts — review highlighted shifts before publishing."

## PART C — Leave approval notification
When a manager approves a leave request (PATCH to staff/leave with
status='approved'), send a notification to the staff member via the
existing messaging pipeline: "Your leave request for [dates] has been
approved." This is a small additive change to the leave approval route.

## UI RULES (locked)
- No backtick template literals inside className={...} or style={{}}
- 'use client' line 1 where needed
- Financial Trust palette (#2D5240 forest, #7FB897 sage)
- Leave overlay: amber (#F59E0B) background at 15% opacity, amber text
- Conflict (leave + shift): red border (#EF4444), red ⚠ icon
- Unavailability: grey (#9CA3AF) striped or hatched CSS pattern
- Additive only — do not break existing roster, shift management, or
  leave management features

## STEP 2 — BUILD GATE
npx tsc --noEmit, then npm run build. Both must pass. Fix only TS/build
errors. ONE commit, ONE push.
Commit: feat(roster): wire leave + availability + skills into roster calendar and AI draft — approved leave shown as amber overlay with conflict detection, unavailability shown as grey indicator, AI draft never schedules leave days, respects availability windows, uses skill data for role-matching, post-processing flags unresolvable conflicts
