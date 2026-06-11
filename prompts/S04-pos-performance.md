# S04 — POS Performance & Terminal
STATUS: DONE | MODE: BATCH
Covers: prompts/08, 09, 31

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_sales, pos_sale_items, pos_registers, pos_sessions, pos_cash_sessions
Run live SQL before any edit.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] POS terminal opens; scan barcode → product added to cart
- [ ] Complete sale → pos_sales row created with correct total_amount
- [ ] Cash drawer open/close → pos_cash_sessions updated
- [ ] Sale receipt renders correctly
- [ ] KDS (if applicable) → order appears on KDS screen

## Push
BATCH mode.
