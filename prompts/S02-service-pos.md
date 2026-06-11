# S02 — Service Business POS
STATUS: DONE | MODE: BATCH
Covers: prompts/03-service-business-pos.md

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.

## CONSTRAINT CATALOGUE
FIRST ACTION at execution time: run live SQL for every table this sprint touches.
See RUNNER-PROTOCOL.md CONSTRAINT CATALOGUE instruction.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] Service businesses (beauty, trades, etc.) can create invoices without POS products
- [ ] Bookings widget loads for service business slug
- [ ] Quote builder is accessible from the service business dashboard

## Push
BATCH mode — push immediately after build gate passes.
