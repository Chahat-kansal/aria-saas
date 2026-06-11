# S11 — Aria Council Multi-Brain
STATUS: DONE | MODE: SOLO
Covers: prompts/19, 22

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: aria_ai_calls, aria_actions, businesses
Run live SQL before any edit. Confirm model IDs are correct per RULE 8.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] Ask Aria a question → council runs (multiple brain roles visible in response)
- [ ] /dashboard/briefing → council briefing generates with consensus + contested items
- [ ] aria_ai_calls logs each brain role call separately
- [ ] Council fallback to single-model works when council errors
- [ ] Model IDs in code: claude-haiku-4-5-20251001, claude-sonnet-4-5-20250929, claude-opus-4-5-20251101

## Push
SOLO mode — stop before push for any code changes. No code changes expected for DONE sprint.
