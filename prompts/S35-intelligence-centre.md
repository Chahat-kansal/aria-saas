# S35 — Intelligence Centre Pro
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/54
Missing: hypothesis auto-test framework (Aria generates a hypothesis, runs an A/B experiment, reports outcome), signal trending charts

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: aria_hypotheses (if exists), intelligence_events (if exists), aria_actions, aria_ai_calls
Run live SQL — sibling-check `%hypothesis%`, `%intelligence%`, `%signal%`

## Gap closure scope

### Gap 1 — Hypothesis auto-test
- When Aria generates a recommendation (aria_actions row), add option: "Test this hypothesis"
- Creates entry in `aria_hypotheses` (confirm table exists; if not: migration)
  columns: id, business_id, hypothesis, start_date, end_date, test_group, control_group, metric, result, status
- After end_date: outcome-check cron compares metric for test vs control period → writes result
- Display in Intelligence Centre with outcome cards

### Gap 2 — Signal trending charts
- intelligence_events (if exists) or derive from aria_ai_calls + pos_sales
- Show trending metrics: revenue trend (sparkline, last 30d), customer count trend, top product trend
- Each trend: current value, % change, direction arrow

## Aria Intelligence Rule
- Hypothesis outcomes → aria_autopilot_actions (learning)
- Signal trends → aria_daily_briefings context
- All hypothesis AI calls → aria_ai_calls

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Intelligence Centre shows signal trend sparklines
- [ ] "Test this hypothesis" button visible on aria_actions cards
- [ ] After test end_date: result populated automatically
- [ ] Hypothesis outcome feeds into aria_autopilot_actions

## Push
SOLO mode — stop before push. Write reports/sprint-S35-report.md.
