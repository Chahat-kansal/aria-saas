# WIRE-2 — Briefing Table Consolidation
STATUS: READY | MODE: SOLO
Pre-condition: BRIEF-1 complete ✅ (c0fbb7f7)
Goal: aria_daily_briefings = single source of truth for dashboard briefing display.
      Retire pos_daily_briefings as a READ source; keep it as a write-only audit log.

---

## RULE 0 — UPGRADE ONLY
Every change must ONLY upgrade, improve, or add. Never downgrade, remove, stub, or weaken.
The briefing card must still show content after this sprint. If it shows anything less → BLOCKED.
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.
Sibling-check: `%briefing%`, `%daily%`

## CONSTRAINT CATALOGUE
FIRST ACTION: run live SQL for every table this sprint touches.

```sql
-- Confirm all three briefing tables and their columns
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('aria_daily_briefings','pos_daily_briefings','daily_briefings')
ORDER BY table_name, ordinal_position;

-- Row counts per table (freshness check)
SELECT 'aria_daily_briefings' as t, count(*), max(briefing_date) as latest FROM aria_daily_briefings
UNION ALL
SELECT 'pos_daily_briefings', count(*), max(briefing_date::text) FROM pos_daily_briefings
UNION ALL
SELECT 'daily_briefings', count(*), max(date::text) FROM daily_briefings;
```

Fill in results here before writing any code.

## Sprint scope

### Step 1 — Audit every component + route that reads from a briefing table

Search for `.from('pos_daily_briefings')`, `.from('daily_briefings')`, `.from('aria_daily_briefings')` in:
- src/components/dashboard/
- src/app/dashboard/
- src/app/api/aria/
- src/app/api/pos/

For each READ site, determine: is it displaying the briefing to the user? → switch to aria_daily_briefings.
For each WRITE site: keep writing to pos_daily_briefings as audit log; ensure aria_daily_briefings is also written.

### Step 2 — Consolidate /api/aria/briefing

The route already has the cache gate (BRIEF-1). Verify it:
- Returns `from_cache: true` when aria_daily_briefings has today's row
- Falls through to council only when no cached row exists
- `force=true` bypasses cache (AriaBriefingCard manual refresh)

### Step 3 — DailyBriefingModal

`src/components/dashboard/DailyBriefingModal.tsx`
- Currently calls /api/aria/briefing first, then /api/aria/daily-briefing as fallback
- After BRIEF-1: /api/aria/briefing already serves cached content
- Verify: modal shows today's content on open; does NOT re-call council on every open

### Step 4 — DailySummaryCard

`src/components/dashboard/DailySummaryCard.tsx`
- Currently calls /api/aria/daily-narrative → writes to pos_daily_briefings.summary
- This is a DIFFERENT card from the briefing card; it shows today's real-time narrative
- Do NOT change this card's data source — it should stay on daily-narrative
- Just confirm: the card does NOT read from aria_daily_briefings (it's a separate surface)

### Step 5 — RetailDashboard briefing fallback

`src/components/dashboard/RetailDashboard.tsx`
- `loadBriefing`: calls /api/aria/briefing → sets councilBriefing state
- Falls back to /api/aria/daily-briefing POST → sets briefingRecs
- After WIRE-2: the primary path should always return from cache (aria_daily_briefings)
- Fallback can remain; just confirm it's not called unnecessarily

### Step 6 — Add `briefing_date` index if missing

```sql
CREATE INDEX IF NOT EXISTS idx_aria_daily_briefings_biz_date
ON aria_daily_briefings (business_id, briefing_date DESC);
```

### Step 7 — Document the table ownership model

Update AUDIT_STATE.md "THREE BRIEFING TABLES" section:
```
1. daily_briefings — original OS briefings. READ: legacy only. WRITE: deprecated.
2. aria_daily_briefings — CANONICAL display source. READ: dashboard + API. WRITE: cron + briefing route.
3. pos_daily_briefings — POS-specific audit log. READ: never for display. WRITE: morning/evening cron only.
```

## Aria Intelligence Rule
- No new AI calls in this sprint
- Confirm generate-briefings cron writes enriched content to aria_daily_briefings (BRIEF-1 already done)
- Confirm /api/aria/briefing logs the cache hit/miss to console (already has `from_cache: true` flag)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (10 min max)
- [ ] Open /dashboard → briefing card shows TODAY's content, not yesterday's
- [ ] Hard-refresh briefing card → "force" fetch runs; content updates; no blank state
- [ ] DailyBriefingModal opens → shows same content as briefing card
- [ ] Check Network tab: /api/aria/briefing returns `from_cache: true` on second load
- [ ] DailySummaryCard still shows today's real-time narrative (separate from briefing)
- [ ] Check Supabase: aria_daily_briefings has today's row; pos_daily_briefings still has its rows

## Push
SOLO mode — stop before push. Write reports/sprint-WIRE-2-report.md. Founder verifies, then pushes.
