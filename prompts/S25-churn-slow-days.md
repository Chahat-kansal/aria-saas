# S25 — Churn & Slow Days
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/40
Missing: predicted footfall overlay on the roster view

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_sales (created_at for day-of-week analysis), pos_rosters, staff_shifts
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Footfall prediction overlay on roster
- Use last 12 weeks of pos_sales to compute average transactions per day-of-week + hour
- Display as a heatmap strip above the roster grid: "Expected: Busy / Average / Quiet"
- Data: fetch from new or existing endpoint /api/pos/sales/footfall-prediction
- Overlay on pos_rosters roster view
- Aria recommendation: if roster has fewer staff than predicted peak → upsertAriaAction

## Aria Intelligence Rule
- Staffing gap on a predicted-busy day → upsertAriaAction category='staff', priority='high'
- Feed slow-day pattern into aria_daily_briefings (tomorrow is expected slow)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Roster view shows footfall heatmap overlay
- [ ] Predictions based on real historical sales data (not random)
- [ ] Understaffed-on-busy-day → aria_action created

## Push
SOLO mode — stop before push. Write reports/sprint-S25-report.md.
