# Aria OS — Audit Pass C: AI Intelligence Layer Quality
ONE task, ONE commit, ONE push. Run AFTER Pass B is green.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT THE AI LAYER
Read each of these files/routes and assess quality. Report findings before fixing.

1. src/lib/aria/get-system-prompt.ts — is the system prompt genuinely specific to
   the business (uses real business data) or is it generic filler?
2. src/lib/aria/business-brain.ts — does it feed real, current business data?
   Is it missing any of the key context fields (industry, pos_enabled, onboarding data)?
3. src/app/api/aria/briefing/ — does the daily briefing route pull real data
   (sales, customers, compliance) or fabricate it?
4. src/app/api/aria/ask/ — does the Ask Aria route include the full business
   context in every call? Is it logging to aria_ai_calls?
5. src/lib/aria/model-router.ts — are the model IDs correct?
   Must be: claude-haiku-4-5-20251001 / claude-sonnet-4-5-20250929 / claude-opus-4-5-20251101
   Fix any outdated model IDs found.
6. Scan ALL routes under src/app/api/aria/ — find any that:
   - Use a hardcoded generic system prompt (not business-specific)
   - Do NOT log to aria_ai_calls (violates the Aria Intelligence rule)
   - Return fake/placeholder AI responses
   - Use deprecated model IDs (claude-3, claude-2, etc.)
7. src/lib/aria/signal-engine.ts and signal-runner.ts — do they produce real
   aria_autopilot_actions rows? Or are they stubs?

## STEP 2 — FIX IN PRIORITY ORDER
1. Wrong model IDs — fix to the correct IDs listed above
2. Routes that skip aria_ai_calls logging — add the log
3. Generic system prompts — inject the real business context that already exists
   in get-business-context.ts / business-brain.ts
4. Stub AI routes returning fake data — wire to real data
5. Signal engine gaps — if autopilot_actions aren't being produced, fix the write

Rules: never change working AI behaviour. Never remove a real AI feature.
Never use a worse model. Business context must come from the real DB, not hardcoded.
Locked files: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: fix(ai): AI intelligence layer audit — correct model IDs, wire missing aria_ai_calls logging, inject real business context into generic prompts, fix stub AI routes
