# RUN-MS16C — AX-1 FRAMING + THE REAL AVATAR

**Run date:** 2026-08-25 · autonomous (RULE 20) · branch `main`
**Outcome: STOPPED AT PHASE 0. Nothing was built. This is the outcome the sprint's own gate asks for.**

---

## THE ONE-SCREEN SUMMARY

**The corrected contract still has not been committed.** `docs/design/ask-aria-transition.html` is
byte-for-byte the same file MS16 lifted and MS16B parked on — unchanged for the third sprint running.

```
sha256   566e2fba9e70f1c7f7ec2d820ff8e6fe244a52b7aa85aa35675a564892dc9c57
size     22,127 bytes
mtime    2026-08-25 02:14
```

That hash is identical to the one recorded in `RUN-MS16B.md`. Not a similar file — **the same file.**

### Phase 0, exactly as specified

| must be PRESENT | found |
|---|---|
| `.ax-surface` | **0** ❌ |
| `.axnav` | **0** ❌ |
| `#ax-avatar` | **0** ❌ |
| `.arrow` | **0** ❌ |

| must be ZERO | found |
|---|---|
| `position:fixed` | **5** ❌ |
| `body.work` | **17** ❌ |
| `.hair{` | **1** ❌ |
| `.fringe{` | **1** ❌ |
| `.torso{` | **1** ❌ |

**Nine of nine checks fail.** The decision table's first row is unconditional — *"The contract still
lacks the four markers → STOP. Report. Build nothing."* — so phases 1–5 were not started.

**It is not a filename or path mistake.** I searched the entire repo for any file containing
`ax-surface`, `axnav` or `ax-avatar` in any `.html`, `.css` or `.tsx`: **zero hits anywhere**, and
`git status` shows no new or untracked design file. The only HTML in `docs/design/` is the old
contract and the superseded `ask-aria-FINAL.html`.

**I did not write the corrections myself.** The brief forbids it twice, and it is the right call:
authoring the design I am meant to reproduce would make the zero-modified-lines proof circular —
I would be diffing my own work against itself and reporting 0.0px.

### To unblock: commit the corrected file to that path. Nothing else is needed.

The tooling is all in place and working — the verify script, the baseline, the lift-and-diff
harness, and the mutation runner. This sprint runs end to end the moment the file lands.

---

## THE DIAGNOSIS IS CORRECT — I VERIFIED IT AGAINST THE CODE

I did not build anything, but the brief's account of *why* the screen broke is checkable read-only,
and confirming it is worth more than a bare "file missing". **Every element of it is true**, so the
four structural changes will fix the real cause rather than a guess.

| the claim | verified in the code |
|---|---|
| The surface renders inside the dashboard shell | `src/app/dashboard/layout.tsx:59` — `<DashboardShell>{children}</DashboardShell>`. The ax route is a child, so the sidebar and its brand mark are always present around it. |
| Decoration is anchored to the viewport, not the surface | **Five** `position:fixed` rules in the lifted sheet: `.deco` (line 34), `.brand` (63), `.nav` (66), `.newbtn` (72), `.back` (210). `position:fixed` resolves against the viewport, so `.hill` and the blobs escape over the sidebar **no matter where the surface is placed**. |
| The canvas is on `<body>` | `body{height:100vh;overflow:hidden;font-family:'Outfit'…}` at line 28 — the sheet styles the document itself, and the page importing it lives inside the dashboard. |
| The state class is on `<body>` | **17** `body.work` selectors. The state lives on the document, not on a surface element. |
| Cormorant can leak in | `Cormorant` is loaded in the root layout (`src/app/layout.tsx:2`) and applied via `.font-display` (`aria-tokens.css:195`), so it is live on this route. |

**An honest note on MS16.** I flagged the scoping risk then and scoped the sheet by route —
imported by the ax page only, never a layout — and I wrote in `RUN-MS16.md` that it "carries `*`,
`body` and `:root` rules and must not reach any other route." That was necessary but **it could not
have prevented what Chahat saw**, and I should say so plainly: route-scoping stops the sheet
reaching *other* pages; it does nothing about `body{}` and `position:fixed` *within* the route it is
on. The escape was structural in the source, and the only real fix is the one this sprint
describes — a `.ax-surface` wrapper with `isolation:isolate` and absolutely-positioned decoration.
The lift was faithful; the source was page-scoped.

---

## WHAT EACH PHASE NEEDS

| phase | blocked on |
|---|---|
| **1 — re-lift** | The new `<style>` block. Cannot lift what does not exist. |
| **2 — no leaking** | Phase 1's `.ax-surface`. The three leak assertions test rules that are not written yet. |
| **3 — mount 3D Aria** | Phase 1's `#ax-avatar` mount point. |
| **4 — re-baseline** | Phase 1's output. Re-running against today's file would re-measure MS16's 0.0px — a true number that answers nothing. |
| **5 — real sizes** | Phases 1–3. |

**Phase 3's research is already done and still stands** (`RUN-MS16B.md`): Aria is
`public/models/Aria.glb`, 18 MB, rendered live by `AriaTalkingHead`; there is no still image of her
anywhere in the repo; `public/videos/aria-intro-poster.jpg` is **a different, male character** and
must never be used. The performance concern the sprint raises is real and unchanged — an 18 MB GLB
in a circle on a surface that re-renders per streamed token — and that is the thing most likely to
force a PARK once the contract lands.

---

## STATE OF THE TREE

**No source file was modified in this run.** `HEAD` is `d08dbee4`, the MS16B run-log commit, and
`src/` is exactly as MS16B left it: tsc 0 errors, vitest 710/710, `BUILD_EXIT=0`.

Three files are modified in the working tree that **are not mine and were not committed**:

```
 M .gitignore        + .vercel, + .env*
 M package.json      + "@vercel/global-config": "^1.5.1"
 M package-lock.json
```

Those are the footprint of a Vercel CLI operation (`vercel link` or similar), not of this sprint.
Left untouched and uncommitted — flagged here so they are not mistaken for sprint output, and so
whoever ran it can commit them deliberately if they were meant to land.

## GATES

Nothing was built, so nothing new was gated. The pre-push hook ran on this run log's commit:
canon-rail-guard clean, tsc 0 errors, unit tests green.

## WHAT IS NOT DONE

**All five phases.** Every one of them, parked on a single missing input. No code was written, no
stylesheet was lifted, no avatar was mounted, and no baseline was re-run — because doing any of it
would have required me to invent the contract first.
