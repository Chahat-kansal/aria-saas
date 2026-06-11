# Sprint WIRE-2 — Briefing Table Consolidation
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS

---

## Goal
Make `aria_daily_briefings` the single source of truth for all dashboard briefing display.
Retire `daily_briefings` as a READ source; keep `pos_daily_briefings` as write-only audit log.

---

## Pre-flight read map (grep results)

### aria_daily_briefings reads
| File | Purpose |
|---|---|
| `src/app/api/aria/briefing/route.ts:128` | Cache gate — serves today's row, returns `from_cache: true` ✅ |
| `src/app/api/cron/aria-health-monitor/route.ts:253` | Count check for health monitor ✅ |
| `src/app/api/cron/generate-briefings/route.ts:126,283` | Freshness check + upsert ✅ |
| `src/app/api/cron/daily-briefing-poll/route.ts:54` | Upsert on poll ✅ |
| `src/app/api/onboarding/provision/route.ts:141,160` | Read + write on onboarding ✅ |

### daily_briefings reads (legacy)
| File | Purpose | Action |
|---|---|---|
| `src/app/api/aria/daily-briefing/route.ts:120,564,641,701` | Legacy route R+W | Keep — fallback route |
| `src/app/api/cron/aria-health-monitor/route.ts:252` | Count check | Count only — no display risk |
| `src/app/dashboard/daily-briefing/page.tsx:169` | **History sidebar READ** | **FIXED → aria_daily_briefings** |

### pos_daily_briefings reads
| File | Purpose |
|---|---|
| `src/app/api/aria/daily-narrative/route.ts:118` | DailySummaryCard write (keep) ✅ |
| `src/app/api/cron/aria-health-monitor/route.ts:254` | Count check only ✅ |
| `src/app/api/cron/generate-briefings/route.ts:209,317` | Audit log writes (keep) ✅ |

---

## Step 2 — /api/aria/briefing cache gate ✅

Verified: `src/app/api/aria/briefing/route.ts:123-143`
- Reads `aria_daily_briefings` WHERE `business_id` + `briefing_date = today` + `content IS NOT NULL`
- Returns `{ briefing, from_cache: true }` on hit
- Falls through to council only when no cached row
- `?fresh=true` / `?force_refresh=true` bypasses cache

No changes needed.

---

## Step 3 — DailyBriefingModal ✅

Verified: `src/components/dashboard/DailyBriefingModal.tsx:120`
- Primary: `GET /api/aria/briefing?businessId=...` → reads from `aria_daily_briefings` cache
- If briefing text returned without structured recs → parses into insight cards
- Fallback: `POST /api/aria/daily-briefing` — only called when primary returns empty
- No unnecessary council calls on every open (respects `from_cache: true`)

No changes needed.

---

## Step 4 — DailySummaryCard ✅

Verified: `DailySummaryCard.tsx` grep → zero `aria_daily_briefings` reads.
- This card calls `/api/aria/daily-narrative` → writes to `pos_daily_briefings.summary`
- Completely separate surface from the briefing card — correct by design

No changes needed.

---

## Step 5 — RetailDashboard ✅

Verified: `RetailDashboard.tsx` grep → calls `/api/aria/briefing` (primary) then `/api/aria/daily-briefing` (fallback).
- Primary path hits `aria_daily_briefings` cache on every non-forced load
- Fallback is only reached if primary returns no content

No changes needed.

---

## Step 6 — Fix: daily-briefing page history ✅

**File changed:** `src/app/dashboard/daily-briefing/page.tsx`

**Before (broken):**
```typescript
supabase
  .from('daily_briefings')            // ← legacy table, rarely has data
  .select('id, date, generated_at, recommendations, data_snapshot')
  .order('date', ...)
```

**After:**
```typescript
supabase
  .from('aria_daily_briefings')       // ← canonical table with actual data
  .select('id, briefing_date, generated_at, content, source')
  .order('briefing_date', ...)
  .then(({ data }) => {
    if (data) setHistory(data.map(row => ({
      id: row.id, date: row.briefing_date, generated_at: row.generated_at, content: row.content
    })))
  })
```

**Also upgraded:**
- `HistoryEntry` interface: made `recommendations` and `data_snapshot` optional, added `content?: string | null`
- Executive summary section: when viewing a history entry with `content`, shows the briefing text directly (upgrade from showing today's bullets)
- History sidebar: shows `'Daily briefing'` label instead of rec count (rec count was always `'—'` anyway since `aria_daily_briefings` has no recommendations array)

---

## Step 7 — Index migration ✅

Created `supabase/migrations/20260611_wire2_briefing_index.sql`:
```sql
CREATE INDEX IF NOT EXISTS idx_aria_daily_briefings_biz_date
  ON aria_daily_briefings (business_id, briefing_date DESC);
```
Supports the `/api/aria/briefing` cache gate query (business_id + briefing_date filter).

---

## Step 8 — AUDIT_STATE.md updated ✅

Updated THREE BRIEFING TABLES section with canonical ownership model per WIRE-2 spec.

---

## Files changed

| File | Change |
|---|---|
| `src/app/dashboard/daily-briefing/page.tsx` | Switch history read from `daily_briefings` → `aria_daily_briefings`; map `briefing_date`→`date`; show `content` in history view; update `HistoryEntry` type |
| `supabase/migrations/20260611_wire2_briefing_index.sql` | New — composite index on `(business_id, briefing_date DESC)` |
| `AUDIT_STATE.md` | Update THREE BRIEFING TABLES to canonical ownership model |
| `prompts/WIRE-2-briefing-consolidation.md` | STATUS: READY → AWAITING-VERIFY |
| `prompts/MANIFEST.md` | WIRE-2 → AWAITING-VERIFY |

---

## Founder verify checklist

- [ ] Open `/dashboard` → briefing card shows TODAY's content (not empty, not yesterday's)
- [ ] Hard-refresh briefing card → second load returns `from_cache: true` in Network tab
- [ ] Open `/dashboard/daily-briefing` → history sidebar shows past entries (not empty)
- [ ] Click a history entry → executive summary shows that day's briefing text
- [ ] DailyBriefingModal (click Aria ✦) → shows today's content, opens without blank state
- [ ] DailySummaryCard still shows real-time narrative (separate from briefing)
- [ ] Supabase: `aria_daily_briefings` has today's row; `pos_daily_briefings` still has its rows

---

## Push instruction
```
git add src/app/dashboard/daily-briefing/page.tsx \
  supabase/migrations/20260611_wire2_briefing_index.sql \
  AUDIT_STATE.md \
  prompts/WIRE-2-briefing-consolidation.md \
  prompts/MANIFEST.md \
  reports/sprint-WIRE-2-report.md
git commit -m "fix(wire-2): aria_daily_briefings as canonical display source — switch history read, add index, update ownership docs"
git push origin main
```
