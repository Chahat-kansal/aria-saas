# S23 — Compliance Pro
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/38
Missing: ATO BAS auto-population from pos_sales data, penalty calendar with AU dates

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_sales (total_amount, tax_amount — dollars), business_expenses (amount — dollars, label NOT name)
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — BAS auto-population
- Query pos_sales for the quarter (based on businesses.gst_registered_from)
- Calculate: GST collected = sum(tax_amount), taxable sales = sum(total_amount - tax_amount)
- Calculate: GST paid on expenses = sum(business_expenses.amount * 0.1) where expense is GST-applicable
- Net GST = collected - paid
- Pre-fill the BAS form fields in /dashboard/compliance
- "Export to ATO portal" = copy-paste formatted output (not direct API — ATO API requires complex auth)

### Gap 2 — AU penalty calendar
- Static AU tax dates: BAS quarterly lodgement (28 Oct, 28 Feb, 28 Apr, 28 Jul)
- PAYG quarterly (same dates)
- Superannuation quarters (28 Oct, 28 Jan, 28 Apr, 28 Jul)
- Show as a calendar card in /dashboard/compliance with days-until countdown
- 14 days before due: upsertAriaAction category='compliance', priority='high'

## Aria Intelligence Rule
- BAS due in 14 days → upsertAriaAction
- Estimated GST liability > prior quarter by 20% → upsertAriaAction 'GST spike detected'
- Feed compliance status into aria_daily_briefings

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] BAS calculator shows correct GST collected from pos_sales
- [ ] GST on expenses deducted correctly (business_expenses.amount × 0.1)
- [ ] Compliance calendar shows next due date with countdown
- [ ] 14-day reminder fires: aria_action created

## Push
SOLO mode — stop before push. Write reports/sprint-S23-report.md.
