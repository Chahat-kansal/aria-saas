# BATCH-GREEN-2 — the remaining 15 + 2 CDN-fixed FA sprints (supervised run, no DB, no push)
> Run in order. Each is ADDITIVE and depends on existing code — so DISCOVER the existing pattern first,
> EXTEND it, and if you can't find it, SKIP that sprint and log why. Never invent a new system.

## ORCHESTRATION (obey for every sprint)
1. FIRST confirm `pwd` = C:\Users\kansa\aria-saas-audit. If not, abort.
2. Per sprint, in order:
   a. DISCOVER: grep/read for the existing component/lib/pattern the sprint extends. Quote what you found.
      If the pattern isn't clearly there → SKIP this sprint, log "pattern not found", continue. Do NOT invent.
   b. Implement ADDITIVELY (RULE 0 — extend, never replace/remove working code).
   c. `npx tsc --noEmit` then `npm run build`.
   d. Pass → `git add -A && git commit -m "<sprint commit line>"`. Fail → revert THIS sprint only
      (`git checkout -- .` + remove files you added), log the full error, CONTINUE.
3. DO NOT push. DO NOT run migrations / call or create RPCs / write to any table.
4. NEVER touch: AnimatedBg, FlyToCart, CursorGlow, pos-sfx.ts, aria-voice-guide.ts. Terminal page additive only.
5. Theme locked: #7FB897 / #2D5240 / #C9A37A / #BA7517 / #E24B4A · Cormorant + Outfit. No new tokens.
6. vercel.json function count must stay ≤22. If a sprint would exceed it, SKIP + log.
7. DETAILED REPORT — append to `reports/batch-green-2-summary.md` AS YOU GO (incremental). Per sprint:
   status (PASS/FAIL/SKIPPED) + commit SHA · every file touched (path + one-line) · what existing pattern you
   extended · verbatim tsc/build output (or all errors) · on fail: full error + cause + what you reverted ·
   any assumption made · a "TO FIX WHEN BACK" line on anything degraded or uncertain, even on PASS.
8. END: append the top summary table, STOP, do not push.

═══════════════════════════════════════════════════════════
## 1 — COMMAND-PORT-1  (BQ-5)
Port BREVITY + GROUNDING + RICH-1 response logic into the AriaCommandBar component (today they only apply to
the /ask chat surface). DISCOVER: find AriaCommandBar + where BREVITY/GROUNDING/RICH-1 are applied in /ask.
EXTEND the same functions into the command bar's response path — do not fork the logic, import/reuse it.
Commit: `feat(command-port-1): brevity+grounding+rich in AriaCommandBar`

## 2 — MONITOR-1  (BQ-8)
Surface existing failure signals (Sentry errors, cron failures, AI failure-rate already tracked) to an alert
channel. DISCOVER: where failure rates/cron health are already computed. Add a notifier (Discord webhook or
email via existing SendGrid). If no webhook/env var exists → ship the code reading from `process.env.ALERT_WEBHOOK`
and LOG that the env var must be set (don't block). No new table.
Commit: `feat(monitor-1): failure + cron alerting to webhook`

## 3 — RICH-2 / RICH-3  (BQ-9)
RICH-2: structured visual response blocks (extend the existing RICH-1 render format). RICH-3: interactive
proposal cards. DISCOVER the RICH-1 renderer first. EXTEND it with the new block types; render-only, no writes.
NOTE: RICH-3 cards overlap the intent-surface direction — keep them simple (title, claim, one action button),
no DB calls; the action just emits an event the existing handler catches.
Commit: `feat(rich-2-3): structured blocks + interactive proposal cards`

## 4 — SPELLS-1  (BQ-10)
Design Spells animation library (22 micro-animation patterns) as reusable CSS/Framer utilities. DISCOVER any
existing animation utils/tokens. Build a single `src/lib/anim/spells.ts` (or .css) exporting the patterns;
DO NOT apply them site-wide in this sprint — just define the library + a docs/spells preview page. Additive.
Commit: `feat(spells-1): design spells animation library`

## 5 — AVATAR V  (may already be in progress — DISCOVER first; if present & working, SKIP + log)
DISCOVER the avatar/TalkingHead component + the existing VRoid bone-patching path. Implement prompt V's scope
only if not already there. If V exists and works → SKIP, log "already present". Additive, procedural-only
animation (no VRMA files). Never touch aria-voice-guide.ts.
Commit: `feat(avatar-v): <what V adds>`

## 6 — AVATAR M   |  ## 7 — AVATAR L   |  ## 8 — AVATAR canvas-polish
Each EXTENDS the same avatar component. M and L = the next avatar prompt scopes (discover the V/M/L spec in
prompts/ if present; if not, implement the named scope conservatively + document the assumption). canvas-polish
= transparent-canvas rendering polish only. All additive, procedural animation, WebGL context-loss resilience
kept. If any scope is unclear → SKIP + log rather than guess.
Commits: `feat(avatar-m): …` · `feat(avatar-l): …` · `feat(avatar-canvas): transparent canvas polish`

## 9–13 — PHASE-AN A / B / C / D / E  (22 micro-animations total)
DISCOVER the existing motion/SPELLS utilities (run SPELLS-1 first so these can use it). Each prompt applies a
group of the 22 micro-animations to existing surfaces (page transitions, card reveals, hover states, number
count-ups, list staggers). EXTEND existing components with animation only — change NO logic, NO layout, NO data.
If a target component isn't found → SKIP that one + log. Respect prefers-reduced-motion.
Commits: `feat(phase-an-a): …` … `feat(phase-an-e): …`

## 14 — AR surfaces
DISCOVER what "AR" refers to in the codebase (likely augmented dashboard surfaces, not camera-AR). Implement the
named display surfaces as read-only UI over existing data. If ambiguous → SKIP + log a question for chat-Claude.
Commit: `feat(ar): dashboard AR surfaces`

## 15 — FIN surface
Surface the existing `financing_opportunities` data (48 rows already exist) as a read-only display page in the
Aria theme. READ ONLY — select + render, no writes, no new table. DISCOVER the table's columns first and render
what's there. Add a "not financial advice" note.
Commit: `feat(fin): financing opportunities surface (read-only)`

═══════════════════════════════════════════════════════════
## 16 — FA-2.4 background removal  (RUNTIME-CDN REWRITE — the failed sprint, fixed)
The npm version failed: @imgly bundles onnxruntime-web → webpack parse error. FIX: do NOT install any dep.
Load the library from a CDN at runtime so it never enters the build graph.
- NEW `src/lib/image/bg-removal.ts`:
  - `getImgly()` lazy-loads via `await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@latest/dist/index.mjs')`
    — the webpackIgnore comment is REQUIRED so webpack doesn't try to parse it.
  - `removeBackground(blob)`: call the lib with config `{ publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@latest/dist/' }`
    so its wasm/onnx ASSETS also load from the CDN (not bundled). Wrap in try/catch → return ORIGINAL blob on any failure.
  - If the CDN module or its wasm assets fail to resolve at runtime → the util returns the original image and logs a warn.
    This NEVER breaks the build (no dep) and never blocks an upload.
- DISCOVER the product-image component (the report names `ImagesTab.tsx`). Add ONE optional "Remove background"
  button (feature-detect: hide if `getImgly()` rejects on first probe). Additive only.
- ZERO npm dependency. `package.json` must be UNCHANGED. That is the whole point of the fix.
Build gate: with no dep added, tsc + build pass trivially. If somehow they don't → revert + log.
Commit: `feat(fa-2.4): runtime-CDN in-browser background removal (zero-dep)`

## 17 — FA-2.5 nsfw moderation  (RUNTIME-CDN REWRITE — the failed sprint, fixed)
The npm version failed: @tensorflow/tfjs type surface OOM'd tsc. FIX: do NOT install tfjs or nsfwjs.
Load both from a CDN via injected <script> tags and read the window globals — no types, no bundling, no OOM.
- NEW `src/lib/moderation/nsfw-check.ts`:
  ```
  function loadScript(src){return new Promise((res,rej)=>{
    if([...document.scripts].some(s=>s.src===src))return res();
    const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=rej;document.head.appendChild(s);});}
  let _model;
  async function getModel(){
    if(_model)return _model;
    await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4/dist/tf.min.js');
    await loadScript('https://cdn.jsdelivr.net/npm/nsfwjs@4/dist/nsfwjs.min.js');
    _model = await window.nsfwjs.load();   // default model from jsdelivr
    return _model;
  }
  export async function isLikelyNSFW(imgEl){
    try{ const m=await getModel(); const preds=await m.classify(imgEl);
      const bad=preds.filter(p=>['Porn','Hentai','Sexy'].includes(p.className)).reduce((s,p)=>s+p.probability,0);
      return {flagged: bad>0.6, score: bad}; }
    catch(e){ console.warn('nsfw check unavailable',e); return {flagged:false, score:0}; } // FAIL-OPEN
  }
  ```
  - Use `declare global { interface Window { nsfwjs:any; tf:any } }` (or `(window as any)`) so tsc needs NO tfjs types.
  - FAIL-OPEN: any load/classify error → `{flagged:false}` so a flaky CDN never blocks real uploads.
- DISCOVER the upload paths (report names `community/create/page.tsx`; also any reel-asset upload). On an image upload,
  call isLikelyNSFW; if flagged, block THAT upload with an inline message; else proceed unchanged.
- ZERO npm dependency. `package.json` UNCHANGED. No DB, no logging table — purely a client gate.
Build gate: no dep = no tsc types to load = no OOM. tsc + build pass. If not → revert + log.
Commit: `feat(fa-2.5): runtime-CDN in-browser nsfw upload gate (zero-dep)`

═══════════════════════════════════════════════════════════
END: ensure reports/batch-green-2-summary.md has a full section per sprint + the top table. STOP. Do not push.
