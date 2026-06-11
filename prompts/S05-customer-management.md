# S05 — Customer Management
STATUS: DONE | MODE: BATCH
Covers: prompts/10, 34

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: pos_customers, customers (separate), pos_loyalty_config, pos_loyalty_transactions
Run live SQL before any edit. Note: pos_customers ≠ customers — different tables, different schemas.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] /dashboard/customers lists all pos_customers
- [ ] Customer detail shows visit_count, total_spent, loyalty_points, segment
- [ ] RFM scoring runs (rfm_recency_score etc. populated)
- [ ] Add customer from POS terminal → pos_customers row created
- [ ] Customer search works (name, email, phone)

## Push
BATCH mode.
