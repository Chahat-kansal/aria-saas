# Aria OS — Audit Pass C: AI Intelligence Layer — Upgrade Everything
ONE task, ONE commit, ONE push. Run AFTER Pass B is green.

## CORE RULE — UPGRADE ONLY, MAKE ARIA SMARTER
This pass is about making the AI layer genuinely more intelligent. Every change
must make Aria better, more contextual, more useful. Nothing gets removed or simplified.
- NEVER remove AI context, tools, or capabilities
- NEVER downgrade a model (e.g. from Sonnet to Haiku) unless a route explicitly
  needs speed over quality — and even then, only if the current model choice is wrong
- NEVER remove a system prompt section — add to it if anything is missing
- NEVER simplify a multi-step AI pipeline into a single call
- If a route has a good AI implementation → leave it alone, only fix what's wrong
- The goal: every AI route is using the right model, the right context, and logging correctly

## CORRECT MODEL IDs (use these exactly, fix any that differ)
- Fast / high-volume: claude-haiku-4-5-20251001
- Standard / most routes: claude-sonnet-4-5-20250929
- Complex reasoning: claude-opus-4-5-20251101
Any route using claude-3, claude-2, or any other ID is wrong — fix it.

## STEP 0 — SYNC
```
pwd   # must be C:\Users\kansa\aria-saas-audit
git status   # must be clean
git pull origin main
```

## STEP 1 — AUDIT FIRST, REPORT BEFORE FIXING
Read each file below and assess quality. Write a findings report first.

1. src/lib/aria/get-system-prompt.ts — is the system prompt genuinely specific to
   the business? Does it inject real data (industry, trading name, city, pos_enabled,
   staff count, revenue range, biggest challenges)? Or is it generic?
2. src/lib/aria/business-brain.ts — does it feed real, current business data?
   Is it missing key context from the new onboarding fields (business_model,
   pos_enabled, access_status, goals, entity_type)?
3. src/app/api/aria/briefing/ — does it pull real data (sales today, customers,
   compliance items due, pending actions)? Or does it fabricate/hallucinate?
4. src/app/api/aria/ask/ — does every call include full business context?
   Is it logging to aria_ai_calls on every invocation?
5. src/lib/aria/model-router.ts — are all model IDs correct per the list above?
6. Scan ALL routes under src/app/api/aria/ — find routes that:
   - Use a generic/hardcoded system prompt not tailored to the business
   - Do NOT log to aria_ai_calls (every AI call must log — this is the moat)
   - Return fake/placeholder AI responses
   - Use wrong/deprecated model IDs
   - Have a weaker context than the best routes do
7. src/lib/aria/signal-engine.ts + signal-runner.ts — do they produce real
   aria_autopilot_actions rows? If not, what's missing?
8. src/lib/aria/brain.ts + business-brain.ts — are these two feeding each other
   correctly, or is there a disconnect?

## STEP 2 — UPGRADE IN PRIORITY ORDER
1. Wrong model IDs → fix to the correct IDs. Never downgrade.
2. Routes missing aria_ai_calls logging → add the log call (feature name, model, input/output tokens, business_id)
3. Generic system prompts → inject the real business context that already exists in
   get-business-context.ts / business-brain.ts. The richer the context, the better Aria is.
4. Add the new onboarding fields to the business context wherever it's built:
   business_model ('product'/'service'), pos_enabled, goals/biggest_challenge,
   entity_type, year_established — these help Aria give more relevant advice.
5. Stub AI routes returning fake data → wire to real data sources, implement properly.
6. Signal engine not producing autopilot_actions → fix the write so actions get created.
7. Any AI route with a weaker implementation than comparable routes → bring it up to
   the standard of the best route in the codebase.

## STEP 3 — BUILD GATE
npx tsc --noEmit + npm run build. Both pass. ONE commit, ONE push.
Commit: feat(ai): AI intelligence upgrade — correct model IDs, complete aria_ai_calls logging, richer business context injected, new onboarding fields added to brain, stub routes wired, signal engine producing autopilot_actions
