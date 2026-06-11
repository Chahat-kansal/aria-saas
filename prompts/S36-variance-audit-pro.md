# S36 — Variance Audit Pro
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/55
Missing: AI supplier comparison (Aria compares your cost vs market wholesale), variance root-cause tagging

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_inventory_transfers (NOT pos_stock_transfers), pos_outlet_inventory (items_on_hand NOT stock_quantity)
        pos_products (cost_price), pos_purchase_orders
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — AI supplier comparison
- For each pos_purchase_order item: compare order cost vs pos_market_price_cache wholesale equivalent
- If order cost is >15% above market: "Possible supplier overcharge: $X above market wholesale"
- Button: "Draft dispute email" (same as S24)
- log to aria_ai_calls (agent_key='supplier_comparison')

### Gap 2 — Variance root-cause tagging
When a stock take (pos_stock_takes) finds variance:
- AI suggests root cause: theft, waste, miscounting, data entry error
- Tag stored in pos_stock_takes.variance_root_cause (column may need migration)
- Dashboard: variance breakdown by root cause type over last 6 months

## Aria Intelligence Rule
- Supplier overcharge → upsertAriaAction category='inventory', priority='high'
- Recurring theft variance → upsertAriaAction 'Possible theft pattern detected'
- All AI calls → aria_ai_calls

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Purchase order shows "supplier overcharge" flag when cost > market
- [ ] Stock take variance → AI root-cause tag displayed
- [ ] Variance breakdown by root cause chart visible
- [ ] pos_inventory_transfers (NOT pos_stock_transfers) used throughout

## Push
SOLO mode — stop before push. Write reports/sprint-S36-report.md.
