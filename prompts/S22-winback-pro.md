# S22 — Winback Klaviyo-level
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/37, 41
Missing: automated SMS sequence builder (multi-step), A/B test tracking for campaigns

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_customers, customers (separate!), pos_loyalty_transactions
Note: pos_customers has NO customer_segment column → use `segment` column. Confirm.
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — SMS sequence builder
Current: single SMS winback message.
Required: multi-step sequence (day 0 → day 3 follow-up → day 7 final).
- UI: sequence builder with step cards (delay, message, condition)
- Store in new table `sms_sequences` or as jsonb in existing campaign table (check what exists)
- Cron/send logic: check if customer responded (pos_sale created after SMS) → stop sequence

### Gap 2 — A/B test tracking
- When sending winback campaign: split audience 50/50
- Variant A: current message; Variant B: AI-generated alternative
- Track: conversion_rate per variant (sale after SMS within 14 days)
- Show results in campaign analytics

## Aria Intelligence Rule
- Sequence completions → aria_autopilot_actions outcome tracking
- upsertAriaAction: "N customers haven't responded to SMS sequence — consider new angle"
- Campaign performance → aria_daily_briefings (conversion rate)

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Create 3-step winback sequence → saves correctly
- [ ] Step 1 sends; step 2 fires only if customer hasn't returned
- [ ] A/B split: half of customers get variant B message
- [ ] Analytics shows conversion rate per variant after 14 days

## Push
SOLO mode — stop before push. Write reports/sprint-S22-report.md.
