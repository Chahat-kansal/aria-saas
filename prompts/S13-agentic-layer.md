# S13 — Agentic Action Layer
STATUS: DONE | MODE: SOLO
Covers: prompts/21

---

## RULE 0 — UPGRADE ONLY
Protected files (never touch): AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## CONSTRAINT CATALOGUE
Tables: aria_actions, aria_agent_actions, aria_autopilot_actions
Run live SQL before any edit. Confirm table ownership per WIRE-3.

## Sprint scope — DONE (verify-only)

## Founder verify checklist
- [ ] Autopilot page shows pending recommendations from aria_actions
- [ ] Approving a recommendation → aria_agent_actions executor log created
- [ ] Action rollback button reverses an executed action
- [ ] action-executor.ts uses supabaseAdmin (RLS bypass for executor operations)

## Push
SOLO mode for any code changes.
