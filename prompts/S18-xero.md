# S18 — Xero Integration
STATUS: DONE | MODE: SOLO
Covers: prompts/30, 57

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: businesses (xero_access_token, xero_refresh_token, xero_tenant_id, xero_connected_at)
Run live SQL before any edit.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] /integrations → Xero connect flow works
- [ ] xero-sync cron runs → invoices + expenses pushed to Xero
- [ ] Token refresh works (xero_refresh_token updated)
- [ ] Disconnect Xero → clears tokens in businesses table

## Push
SOLO mode for any code changes.
