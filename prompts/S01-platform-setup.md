# S01 — Platform Setup & Onboarding
STATUS: DONE | MODE: BATCH
Covers: prompts/01-onboarding-wizard.md, 02-provisioning-landing.md, 04-setup-guide.md

---

## RULE 0 — UPGRADE ONLY
Every change must ONLY upgrade, improve, or add. Never downgrade, remove, stub, or weaken.
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## Pre-flight
See RUNNER-PROTOCOL.md Pre-flight protocol steps 1–9.

## CONSTRAINT CATALOGUE
FIRST ACTION at execution time: run live SQL for every table this sprint touches.
See RUNNER-PROTOCOL.md CONSTRAINT CATALOGUE instruction.

## Sprint scope — DONE (verify-only)

This sprint is fully shipped. The verify checklist below is the only work required.

## Aria Intelligence Rule
- No new AI tasks for this sprint.
- Confirm aria_ai_calls is logging for any AI-powered onboarding steps.

## Build gate
```
npx tsc --noEmit && npm run build
```

## Founder verify checklist (10 min max)
- [ ] `/signup` → complete onboarding wizard → confirm business created in `businesses` table
- [ ] Setup guide shows correct next steps based on industry
- [ ] `/dashboard` loads without errors after onboarding
- [ ] No console errors on the onboarding pages
- [ ] POS is provisioned with demo products on first signup

## Push
BATCH mode — push immediately after build gate passes. No founder pre-verify required.
