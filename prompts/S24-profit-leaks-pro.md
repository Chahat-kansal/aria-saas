# S24 — Profit Leaks Pro
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/39
Missing: supplier overcharge auto-dispute email draft

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: profit_leaks, pos_purchase_orders, pos_products (cost_price)
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Supplier overcharge dispute email
When a profit_leak has type='supplier_overcharge':
- Button: "Draft dispute email"
- POST /api/aria/profit-leaks/draft-dispute → calls claude-haiku
- Generates professional email: [Supplier name], re: overcharge on invoice [PO number]
- Pre-fills sender as businesses.owner_name, businesses.email
- Log to aria_ai_calls (agent_key='dispute_draft')

## Aria Intelligence Rule
- New profit_leak detected → upsertAriaAction with estimated monthly_loss
- Dispute email generated → aria_ai_calls log

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Profit leak with type='supplier_overcharge' → "Draft dispute email" button visible
- [ ] Clicking it → professional email generated with correct business name
- [ ] aria_ai_calls row created for the generation

## Push
SOLO mode — stop before push. Write reports/sprint-S24-report.md.
