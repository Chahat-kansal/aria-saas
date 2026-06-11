# S37 — Inventory Pro
STATUS: PARTIAL | MODE: SOLO
Covers: prompts/56
Missing: expiry forecast AI (predict which batches will expire unsold), reorder-to-supplier direct send

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_products (expiry_date, qty_backroom, shelf_capacity — confirmed valid in AUDIT_STATE)
        pos_outlet_inventory (items_on_hand NOT stock_quantity), pos_purchase_orders
Run live SQL before any edit.

## Gap closure scope

### Gap 1 — Expiry forecast AI
- Products with expiry_date set + current stock: calculate days_until_expiry
- Forecast: at current sales velocity (from pos_sale_items), how much will remain unsold at expiry?
- If projected_waste > 0: upsertAriaAction 'X units of [product] likely to expire unsold by [date]'
- Show in /dashboard/inventory as "Expiry risk" card

### Gap 2 — Reorder-to-supplier direct email
Current: reorder recommendations create aria_actions.
Gap: "Send reorder to supplier" button that emails the supplier directly.
- Use businesses.email as sender (via Resend)
- Email: "Please prepare an order of N units of [product], SKU [sku]. Expected delivery by [date]."
- Log send in pos_purchase_orders with status='requested_via_email'

## Aria Intelligence Rule
- Expiry waste prediction → upsertAriaAction
- Reorder send → aria_agent_actions (executor log — action WAS taken)
- All AI calls → aria_ai_calls

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist
- [ ] Products with expiry_date show days-until-expiry in inventory list
- [ ] Expiry risk card shows projected waste for affected products
- [ ] "Send reorder to supplier" button → email sent; pos_purchase_orders row created
- [ ] pos_outlet_inventory.items_on_hand used (NOT stock_quantity)

## Push
SOLO mode — stop before push. Write reports/sprint-S37-report.md.
