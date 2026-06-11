# S10 — POS Layout Customisation
STATUS: DONE | MODE: BATCH
Covers: prompts/17, 18

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: businesses (terminal_layout jsonb), pos_products
Run live SQL before any edit.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] /pos/settings → layout picker shows L1/L2/L3 options
- [ ] Saving a layout updates businesses.terminal_layout
- [ ] POS terminal reflects the saved layout on reload
- [ ] Product category buttons display correctly per layout

## Push
BATCH mode.
