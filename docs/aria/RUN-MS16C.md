# RUN-MS16C — AX-1 FRAMING + THE REAL AVATAR

**Run dates:** 2026-08-25 — attempts 1 and 2 stopped at Phase 0; **attempt 3 ran all five phases.**
Autonomous (RULE 20) · branch `main`

---

## THE ONE-SCREEN SUMMARY

**Five phases done, five commits, nothing parked.** The corrected contract landed and the surface no
longer leaks in either direction.

| phase | commit | outcome |
|---|---|---|
| 1 — re-lift | `dedc2f28` | 204 lines, **0 modified** |
| 2 — no leaking | `b4ea4b9b` | all assertions pass at 1280/1440/1920, both states |
| 3 — the real Aria | `86fc5d60` | mounted; drawn face never rendered |
| 4 — re-baseline | `e4be1651` | **0.0px** against the new contract |
| 5 — real sizes | `3b2631a7` | no collisions; one finding |

### The three things you most need to know

**1. The leak is fixed, and I can show you.** At every width, in both states: the surface occupies
exactly the dashboard's content area (`{220,0,1700,900}` at 1920 — the sidebar's 220px is untouched),
**nothing paints outside it**, and no Cormorant, serif or dashboard sage reaches any of its 72
elements. The sidebar's computed width, height, background and font are identical whether the
surface is mounted or not. The screenshot of the working state shows the black sidebar strip
completely clean.

**2. Reverting the fix reproduces your bug exactly.** Setting `.deco` back to `position:fixed` makes
the surface paint over the sidebar in all six width/state combinations — ~2,280 differing pixels
each time. That is what you saw, now caught by a test.

**3. Aria mounts, and the drawn face never ships.** The contract's `.hair/.head/.fringe/.eye/.smile/
.torso/.lapel` placeholder is never rendered in any state — not on load, not while the model
downloads, not on failure. The real Aria is `public/models/Aria.glb` via `AriaTalkingHead`, loaded
after first paint and memoised so streaming tokens cannot re-render her.

---

## PHASE 0 — THE HASH CHECK

**Attempts 1 and 2 stopped here** and were right to: the file was byte-identical to the one MS16
lifted, had never been written since (mtime unchanged), and existed on no branch. Attempt 3 found
the real thing.

```
was   566e2fba9e70f1c7f7ec2d820ff8e6fe244a52b7aa85aa35675a564892dc9c57   22,127 bytes
now   f80ae7dd070dd6d80bc3aee47a908c918f764e7eb86be54b665f43332a7afc89   23,186 bytes
```

| check | result |
|---|---|
| `.ax-surface` | **22** ✅ |
| `#ax-avatar` | **present** ✅ (see below) |
| `.arrow` | **1** ✅ |
| `position:fixed` | **0** ✅ |
| `body.work` | **0** ✅ |
| `.hair{` / `.fringe{` / `.torso{` | 1 each — **expected**, the marked placeholder ✅ |

### ⚠️ MY OWN PHASE-0 CHECK REPORTED A FALSE FAIL, AND CHECKING IS THE ONLY REASON THIS SPRINT RAN

`grep -c "#ax-avatar"` returned **0**, and my PASS/FAIL one-liner printed FAIL. The marker was there
all along — the contract declares the mount point as an HTML attribute:

```html
<div class="figure" id="ax-avatar" data-mount="AriaTalkingHead">
```

There is no CSS selector `#ax-avatar`, so a literal grep for the `#` form misses it. **The one-liner
I gave you at the end of the last run has this flaw**; it should match `ax-avatar`, not `#ax-avatar`.
Had I stopped on that first result, a correct contract would have been rejected for a third time.

---

## PHASE 1 — THE RE-LIFT

```
lifted region:            204 lines
lines DELETED:              0
lines MODIFIED:             0   ← the requirement
appended (clearly marked): 32 lines
```

A test re-derives both the contract's `<style>` block and the installed sheet's lifted region at
runtime and asserts line-for-line equality, so the sheet cannot drift without a red suite.

**Appends**, carried forward from MS16 and re-pointed from `body.work` to `.ax-surface.work`
(re-pointing an *append* is not editing a lifted rule): `.rope`/`.track`/`.ex`/`.ropemini` (the
autonomy control — the contract has none), `.quiet` (the empty/unreadable states — the contract's
noticed list is always populated), `.unknown`, `.errline`, and **new**: `.fallback`, the avatar's
loading label, because the contract has no such class.

**Markup:** `.ax-surface` wrapper, `.arrow` on the noticed cards, `id="ax-avatar"` on `.figure`.
**The brand mark is deleted** — the sidebar already carries one and the two collided. The remaining
pill is **Aria's own rooms**, not app navigation; the sidebar keeps owning that.

### Three gaps between the brief and the contract — contract wins, all reported

| the brief says | the contract has |
|---|---|
| the rooms pill is `.axnav` | `.nav`. **No `.axnav` exists.** |
| ship the `.fallback` label | **no `.fallback` class.** Appended. |
| labels collapse to icons below 1120px | **no 1120px rule.** Its only breakpoint is 1180px, which hides `.hero` in working mode. |

**Mutations:** re-authoring a lifted value → **RED**. Reformatting a lifted rule "more cleanly" →
**RED**. `position:fixed` anywhere in the lifted sheet → **RED**.

---

## PHASE 2 — THE LEAK TEST  ← *the fix you saw fail*

`scripts/ms16c-leak-verify.tsx`. Chromium, three widths, both states, computed styles and painted
pixels.

### Measured boxes

| width | sidebar | dashboard content area | surface |
|---|---|---|---|
| 1280 | `{0,0,220,900}` | `{220,0,1060,900}` | `{220,0,1060,900}` |
| 1440 | `{0,0,220,900}` | `{220,0,1220,900}` | `{220,0,1220,900}` |
| 1920 | `{0,0,220,900}` | `{220,0,1700,900}` | `{220,0,1700,900}` |

**The surface is the content area, to Δmax 0.0px at every width, in both states.** Not the viewport,
not the page.

### The three assertions

- **Nothing escapes** — the strip beside the surface is **byte-identical** with the surface mounted
  and with it absent, at every width and state. The surface is confirmed a clipping and isolating
  context (`overflow:hidden | isolation:isolate | position:relative`).
- **Nothing leaks in** — 72 elements checked by *computed* style: **0 Cormorant, 0 serif, 0
  dashboard sage/deep-green.** Host font resolves to `Outfit, system-ui, sans-serif`.
- **Nothing leaks out** — sidebar computed width `220`, height `900`, background `rgb(0,0,0)`, font
  `Outfit, system-ui, sans-serif` — **identical** mounted vs unmounted, at all three widths.

Plus: body never scrolls vertically, no horizontal overflow, at every size.

### ⚠️ MY FIRST VERSION OF THIS TEST WAS WRONG, AND I REPLACED IT RATHER THAN LOOSENING IT

It used `getBoundingClientRect()` and reported `.hill` and `.moire` escaping at every width — **22
failures**. That was my error, not a defect. A bounding box ignores clipping, and `.ax-surface`
carries `overflow:hidden`, so a box can extend past the surface while nothing paints there. The
contract deliberately oversizes both (`.hill{left:-6%;width:112%}`, `.moire` at 1180px) and relies on
the surface to clip them.

The honest question is whether anything *paints* outside. The assertion now screenshots the strip
beside the surface with it mounted and without, and compares the PNG buffers byte-for-byte — no
decoder, no tolerance to argue about. Layout boxes are still printed, as diagnostics only.

### MUTATION — `.deco` back to `position:fixed`

**RED in all six combinations**, ~2,280 differing bytes in the sidebar strip each time. That is your
bug, reproduced and caught.

### ONE REAL LEAK-OUT, REPORTED NOT HIDDEN

The lifted `body{margin:0;height:100vh;overflow:hidden}` changes body overflow from `visible` to
`hidden` on this route. It is a **lifted rule**, so per the decision table it is not edited. Benign
here — `DashboardShell.tsx:161` already sets `overflow-hidden` for ask-aria and the surface scrolls
internally — but it is a global rule reaching outside the surface and you should know it exists.

---

## PHASE 3 — THE REAL ARIA

**Component:** `AriaTalkingHead` · **Asset:** `public/models/Aria.glb` (18 MB VRM) · **Mount:**
`src/components/ask-aria-ax/AriaAvatarMount.tsx` into `#ax-avatar`.

**The drawn face is never rendered in any state.** It was never emitted in Phase 1 either, so there
was nothing to delete — the placeholder simply never entered this codebase.
`public/videos/aria-intro-poster.jpg` (a different, male character) is used nowhere.

| requirement | how it is met |
|---|---|
| must not block first paint | `next/dynamic` + `ssr:false` keeps the GLB and three.js out of the initial bundle; mount is triggered from a `useEffect` (post-paint) and deferred again to `requestIdleCallback`. No `setTimeout` — a timer here would also trip the Phase-3 "no fake liveness" rail. |
| must not re-render per streamed token | **Two defences.** `memo()`, **and** props that cannot change per token: the avatar is fed `settledReply` — the text of the last *finished* turn — never the live stream buffer. During streaming both props hold still and the memo short-circuits. |
| must resize, not letterbox or reset | r3f `<Canvas>` at 100%/100% observes its container; the contract meets it with `.figure canvas{width:100%!important;height:100%!important}`. The mount node is the **same DOM element** in both states, so 250px → 148px resizes rather than tears down. |

**Loading state:** the `.fallback` label ("Waking Aria…"), visible in the screenshots. Never a face.

### THE ONE PERFORMANCE REQUIREMENT I *CAN* PROVE — from the build output

```
/dashboard/ask-aria/ax        5.94 kB        181 kB First Load JS
/dashboard/ask-aria          24.3  kB        451 kB First Load JS   ← the old surface
```

**181 kB, against 180 kB in MS16 before the avatar existed.** Adding a 3D VRM mount grew the
route's first load by ~1 kB, which is the mount component itself. three.js, `@react-three/fiber`
and the 18 MB GLB are **not** in the initial bundle — exactly what `next/dynamic` + `ssr:false` is
for. The old Ask Aria surface, which imports `AriaTalkingHead` the same way, sits at 451 kB for
other reasons.

That measures requirement 1 (does not block first paint) at the bundle level. It does **not**
measure load time, frame rate, or whether she renders — see below.

### ⚠️ WHAT I DID **NOT** VERIFY — read this before believing the avatar works

**I did not see the 3D Aria render.** This environment has no authenticated browser session — the
route is behind `DashboardShell` and auth, and `.env` is not readable here — so the harness renders
the component statically, where `next/dynamic` and effects do not run. **Every screenshot in this
run shows the `.fallback` label, not Aria.**

What *is* proven: the mount code is correct and tested, the placeholder never renders, the fallback
does, the container geometry is right at both sizes, and the memo/settled-text guarantee holds. What
is **not** proven: that the GLB loads, that it fills the circle, its load time, or its frame rate
during the transition and during streaming — the three measurements the brief asks for.

**What you should check on the deployed site:** open `/dashboard/ask-aria/ax`, confirm Aria appears
in the corona (not a permanent "Waking Aria…"), start a long answer, and watch whether the frame
rate holds while tokens stream. If she never appears, the `.fallback` is doing its job and the GLB
is the problem.

### A TEST OF MINE WAS PASSING BECAUSE IT COULD NOT FAIL

The first version of the placeholder check built its patterns with
`new RegExp('className="[^"]*\bhair\b')`. **A `\b` inside a JavaScript string is a backspace
character, not a word boundary** — so the pattern matched nothing, and "renders none of the
placeholder children" passed regardless of what the source contained. This is the backslash-mangling
trap the standing rules warn about, hit through a shell heredoc.

Rewritten as regex **literals** via a script file, with a **MUTATION PROBE** that injects a `.hair`
child and asserts the pattern goes red — so the check is falsifiable rather than vacuously true.

---

## PHASE 4 — THE RE-BASELINE

| | WELCOME | WORKING |
|---|---|---|
| `.orbit` | `{582,92,250,250}` | `{86,113,148,148}` |
| `.headline` | `{427,368,560,114.4}` | `{47,277,226,46.2}` |
| `.talk` | `{1414,122.6,2,841.2}` | `{320,88,1094,790}` |
| `.hero` | `{26,92,1362,858.4}` | `{26,88,268,790}` |

**Worst delta across all four elements, both states: 0.0px.** Timing strings identical:
`cubic-bezier(0.65, 0.02, 0.2, 1)` / `0.85s`.

**Old vs new:** MS16 also measured 0.0px, but against the old contract and different absolute boxes —
`.talk` height `834.3 → 841.2`, `.hero` height `851.4 → 858.4`. The surface is ~7px taller because
the canvas is now `.ax-surface` (`height:100%` of its container) rather than `<body>` (`100vh`).
Same score, genuinely different geometry.

### ⚠️ THE NUMBERS SAID 0.0px WHILE THE PICTURE WAS STILL WRONG

After the re-baseline I opened the screenshot instead of trusting the score, and the noticed-card
arrow was **still a big blue pill** — the exact bleed this contract renames `.go` → `.arrow` to fix.

**Cause was mine, not the component's.** The harness seeds the three noticed cards with the
contract's own text so the comparison isolates layout from string length, and that seed still carried
`class="go"` from the MS16 version. The component was correct all along (`className="arrow"`). The
pixel comparison could not catch it, because the harness fed the same stale markup to *both* sides.

Seed fixed. Both MS16 defects are now visually confirmed fixed: the card title and subtitle **stack**
on separate lines, and the arrow is the subtle grey glyph the contract specifies.

**That is twice this sprint that looking at the picture beat reading the number.**

---

## PHASE 5 — THE PANEL AT REAL SIZES

1280 / 1440 / 1920 × 900, both states, inside the dashboard shell.

| check | result |
|---|---|
| rooms pill vs corona | clears by **46.5px** (welcome) / **42.0px** (working), every width |
| rooms pill vs "New chat" | no overlap |
| `.flow` | scrolls internally (`overflow-y:auto`) |
| page scroll | never scrolls vertically |
| horizontal overflow | none, any width |
| composer on screen | welcome `790.5→850.5px`, working `725.8→832.8px` |

### THE ONE FINDING — reported, not fixed

**The contract has no 1120px breakpoint**, so the rooms-pill labels never collapse to icons at any
width. The brief expects that behaviour "as the contract specifies"; the contract does not specify
it. Its only breakpoint is 1180px, which hides `.hero` in working mode.

Not built. Writing that rule would mean authoring the design I am here to reproduce, and the decision
table is explicit that a gap at real sizes is a finding to report, not a rule to edit. **If the
labels should collapse, the rule belongs in `ask-aria-transition.html` and the sheet gets re-lifted.**

---

## THE HARNESS CAVEAT, STATED ONCE AND APPLYING TO PHASES 2, 4 AND 5

**Real:** the `AskAriaTransition` component, the installed lifted stylesheet, the compiled
application CSS from the production build (Tailwind, dashboard theme, `aria-tokens`), and
`DashboardShell`'s exact wrapper markup copied from source.

**Not real:** the Sidebar is a structural stand-in carrying the dashboard's own classes and its real
220px/black box, because the live component needs `BusinessProvider`, a Supabase session and
`next/navigation`, and this environment has no authenticated browser session.

That does not weaken the leak result: **every way this sheet can reach the dashboard is a global
rule** — `*`, `body`, `button`, `:root` custom properties — and those apply to a stand-in exactly as
they would to the real component. It does mean nothing here was seen under real auth with real data.

---

## GATES

- `npx tsc --noEmit` — **0 errors** (with `--max-old-space-size`; the 4 GB default OOMs on this tree)
- `npx vitest run` — **720 passed / 720**, whole suite
- **Mutations all RED**: lifted value re-authored · lifted rule reformatted · `position:fixed`
  restored (6/6 combinations) · placeholder child in the DOM · avatar fed the live stream
- **Visual: 0.0px**, timing identical · **Leak: all assertions pass** · **Sizes: no collisions**
- `npx next build` — **BUILD_EXIT=0**, read from the log, never the wrapper

**Gate cadence, honestly:** phases were gated on `tsc` + the full `vitest` suite each, with **one
full `next build` before the push**. A build on this tree takes ~20 minutes, so six were not run.
Nothing reached `main` unbuilt, but saying so is better than implying otherwise.

## THE FLAKY PUSH GATE, FINALLY IDENTIFIED

MS16C attempt 1 recorded a mystery flake: the pre-push hook blocked once, then passed on identical
code. I could not name the test then, because I had piped the push through `tail -5` and the output
scrolled past. **It happened again on this run, and this time I captured it.**

```
FAIL  src/lib/pos/staff-pin.test.ts > no route compares a PIN in plaintext
      > the only === / !== comparisons on .pin are documented legacy fallbacks
Error: Test timed out in 5000ms.
```

**Not an assertion failure — a timeout.** That test is a SEC-PIN security rail: it walks every file
under `src/`, reads each one, and runs an `indexOf` over the whole file for each matching line. It
is slow by construction, and vitest's 5s default is tight enough that it fails intermittently when
the disk is busy — which it was, repeatedly, during this sprint's builds and screenshot runs.

**Fixed with an explicit 30s timeout on that one test.** The walk, the pattern, the offenders list
and the expectation are all unchanged — only the time budget moves. This is not a weakened security
check; it is the same check given room to finish.

Worth doing rather than retrying the push: a security rail that fails randomly under load is exactly
the kind people learn to push past with `--no-verify`, and that is how a guard quietly stops working.

## WHAT IS NOT DONE

- **The 3D Aria was never seen rendering** — see the Phase 3 warning. This is the one thing in the
  sprint I could not verify, and the screenshots show the fallback label.
- **The rooms pill has no 1120px collapse** — the contract has no such rule.
- **Nothing was viewed under real auth**, with the real Sidebar and real data.
- **The rooms pill, "New chat", share/more, mic and attach are presentation only** — not wired.
