# S45 — Basiq Bank Feed
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/67
Missing: auto-categorisation of bank transactions as business expenses, reconcile vs Xero

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: businesses (basiq_user_id, basiq_connected, basiq_connected_at), business_expenses (label NOT name, amount in dollars)
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Auto-categorise bank transactions
When Basiq sync pulls new transactions:
- For each transaction: call claude-haiku to classify as business_expense category
  (rent, wages, supplies, insurance, utilities, marketing, other)
- Create business_expenses row if classified as business expense
- Log to aria_ai_calls (agent_key='expense_categoriser')

### Gap 2 — Reconcile vs Xero
If Xero is connected (businesses.xero_connected_at not null):
- Compare business_expenses vs Xero expense lines for the same period
- Flag discrepancies: "This expense is in Aria but not in Xero"
- "Push to Xero" button → creates Xero expense record

## Aria Intelligence Rule
- Bank expense spike → upsertAriaAction 'Unusual expense category this week'
- Uncategorised transactions → upsertAriaAction 'N bank transactions need categorisation'
- All categorisation AI calls → aria_ai_calls

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Bank feed connected (basiq_connected = true in businesses)
- [ ] New transaction synced → auto-categorised → business_expenses row created
- [ ] business_expenses.label (NOT name) and amount (dollars, NOT cents) verified
- [ ] Xero reconciliation: missing expense flagged
- [ ] aria_ai_calls entry for each categorisation call

## Push
SOLO mode — stop before push. Write reports/sprint-S45-report.md.
