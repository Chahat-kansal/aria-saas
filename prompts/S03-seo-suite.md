# S03 — SEO Suite
STATUS: DONE | MODE: BATCH
Covers: prompts/05, 06, 07, 26, 27, 85

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.

## CONSTRAINT CATALOGUE
Tables: seo_audits, seo_pages, seo_issues, seo_local, seo_keywords
Run live SQL before any edit.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] /dashboard/seo loads; health score displays
- [ ] "Run audit" triggers crawler; seo_audits row created
- [ ] AI fix suggestions generate on seo_issues
- [ ] Local SEO tab shows GBP data (gbp_listed, review_count, review_avg)
- [ ] Keyword tracker shows rank positions

## Push
BATCH mode — push immediately after build gate passes.
