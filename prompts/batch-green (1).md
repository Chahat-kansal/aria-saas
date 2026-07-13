# BATCH-GREEN — unattended run (no DB, no migrations, no RPCs, no push)
> Run headless. Execute EVERY sprint below in order. Commit each that builds; skip any that fails; never stop for input.

## ORCHESTRATION (obey for every sprint)
1. FIRST: confirm `pwd` = C:\Users\kansa\aria-saas-audit. If not, abort the whole batch.
2. For each sprint, in order:
   a. Implement it ADDITIVELY (RULE 0 — extend, never remove working code).
   b. Run `npx tsc --noEmit` then `npm run build`.
   c. If BOTH pass → `git add -A && git commit -m "<the commit line in the sprint>"`.
   d. If EITHER fails → `git checkout -- . && git clean -fd <only files you added>` to revert THIS sprint only,
      record it as FAILED with the error, and CONTINUE to the next sprint. Never let one failure stop the batch.
3. DO NOT `git push`. DO NOT run any migration. DO NOT call or create any DB RPC. DO NOT touch any table.
4. NEVER touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts. Terminal page additive only.
5. Theme locked: #7FB897 / #2D5240 / #C9A37A / #BA7517 / #E24B4A · Cormorant + Outfit. No new tokens.
6. Function count must stay ≤22 in vercel.json. If any sprint would exceed it, skip that sprint, log it.
7. DETAILED REPORTING — for EVERY sprint, whether it passes or fails, append a full section to
   `reports/batch-green-summary.md` AS YOU GO (write it incrementally, not just at the end, so a crash
   still leaves a record). Each sprint's section must include:
   - Sprint id + final status: PASS / FAILED / SKIPPED, and the commit SHA if committed.
   - Every file created or edited, with the full path and a one-line description of the change.
   - Any npm dependency added (name + version).
   - The exact integration point touched (component/file:line where the feature was wired in).
   - VERBATIM the full output of `npx tsc --noEmit` and `npm run build` (or at least all errors/warnings).
   - If FAILED: the complete error text, your diagnosis of the cause, and exactly what you reverted.
   - Any env var, API, or capability the feature needs but didn't find (e.g. window.ai absent, no WebGPU).
   - Any assumption you made or anything you couldn't verify (so it can be checked by hand).
   - A "TO FIX WHEN BACK" line if anything is incomplete, degraded, or uncertain — even on a PASS.
8. AT THE END: append a top summary table (sprint · status · SHA · one-line note) and STOP. Do not push.

═══════════════════════════════════════════════════════════
## SPRINT 1 — CRON-1 (census, read-only, produces a doc — cannot break anything)
═══════════════════════════════════════════════════════════
Goal: reconcile cron entries vs vercel.json function configs. NO code behaviour change — documentation only.
- grep/scan: list every cron defined (vercel.json crons[] + any /api/cron/* route) and every function config.
- Produce `reports/cron-census-2026-06-14.md`: a table of cron path · schedule · matching function config (Y/N) ·
  purpose (infer from route) · suspected duplicates/orphans.
- Make NO code change. The only new file is the report.
Commit: `docs(cron-1): cron vs function-config census`

═══════════════════════════════════════════════════════════
## SPRINT 2 — FA-2.4 background removal (in-browser, client-side, additive)
═══════════════════════════════════════════════════════════
Goal: let owners remove a product photo's background in the browser. $0, no server, no DB.
- Add dep `@imgly/background-removal` (this feature needs it — allowed).
- New util `src/lib/image/bg-removal.ts`: removeBackground(file|blob) → Blob, lazy-imports the lib so it
  never loads until used. Wrap in try/catch; on any failure return the ORIGINAL image unchanged + a console warn.
- Wire a single optional "Remove background" button into the EXISTING product-photo upload component
  (find it; do not create a new upload flow). Additive button only.
- Fallback: if WebGPU/WASM unsupported, hide the button (feature-detect) — never block the normal upload.
Commit: `feat(fa-2.4): in-browser product photo background removal`

═══════════════════════════════════════════════════════════
## SPRINT 3 — FA-2.5 content moderation (in-browser NSFW gate, additive)
═══════════════════════════════════════════════════════════
Goal: client-side NSFW check before a user upload is accepted (community + reels surfaces). $0, no server.
- Add dep `nsfwjs` (+ its tf backend if required). Lazy-load the model on first use only.
- New util `src/lib/moderation/nsfw-check.ts`: isLikelyNSFW(imageEl|blob) → {flagged:boolean, score}.
  On model-load failure → return {flagged:false} (fail-OPEN, log warn — do not block uploads if the check breaks).
- Wire into the EXISTING upload paths for community posts and reel assets (find them). If an image flags,
  block that upload with an inline message; otherwise proceed unchanged.
- No DB writes, no logging table — purely a client gate.
Commit: `feat(fa-2.5): in-browser nsfw upload gate`

═══════════════════════════════════════════════════════════
## SPRINT 4 — FA-2.6 Gemini Nano quick suggestions (Chrome window.ai, additive, zero-dep)
═══════════════════════════════════════════════════════════
Goal: instant on-device text suggestions where a smart-autocomplete helps (e.g. product description field).
NO dependency — uses Chrome's built-in `window.ai` / Prompt API.
- New util `src/lib/ai/nano.ts`: nanoSuggest(prompt) → string|null. Feature-detect window.ai/LanguageModel;
  if absent OR unavailable → return null (NEVER throw). Cap output, single short suggestion.
- Wire a subtle optional "✨ suggest" affordance into ONE existing text field (product description) that calls it.
  If nano returns null, hide the affordance entirely — Chrome-only, must degrade invisibly elsewhere.
- This is autocomplete-class only — never use it for anything grounded or numeric. No DB, no anchors.
Commit: `feat(fa-2.6): optional on-device nano suggestions (chrome)`

═══════════════════════════════════════════════════════════
END: ensure reports/batch-green-summary.md has a full detailed section per sprint + the top summary table,
then STOP. Do not push. Do not start any other sprint.
