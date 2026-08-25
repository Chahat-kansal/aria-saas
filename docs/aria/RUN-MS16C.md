# RUN-MS16C — AX-1 FRAMING + THE REAL AVATAR

**Run dates:** 2026-08-25 (attempt 1), 2026-08-25 (attempt 2) · autonomous (RULE 20) · branch `main`
**Outcome: STOPPED AT PHASE 0, TWICE. Nothing was built. This is what the sprint's own gate asks for.**

---

## THE ONE-SCREEN SUMMARY

**The corrected contract has never been written to disk.** Not "committed but unpushed", not "on
another branch", not "a filename mismatch". `docs/design/ask-aria-transition.html` is byte-for-byte
the file MS16 lifted, and this is now the **third** sprint to stop on it (MS16B, MS16C attempt 1,
MS16C attempt 2).

```
sha256   566e2fba9e70f1c7f7ec2d820ff8e6fe244a52b7aa85aa35675a564892dc9c57
size     22,127 bytes
mtime    2026-08-25 02:14      ← unchanged since the MS16 commit that created it
```

### The decisive evidence — attempt 2 went looking for the file, not just at it

| check | result |
|---|---|
| Local `HEAD` vs `origin/main` | **identical** (`a1a9c363`) — nothing to pull, this checkout is not behind |
| Commits ever touching the contract, **all branches** | **exactly one**: `d1f69643` — my own MS16 Phase 1 commit that first added it. Never modified since, by anyone. |
| Other branches carrying it | none (`codex/ai-co-owner-command-centre`, `verify/ci-e2e-1-break-selector` — neither touches it) |
| Repo-wide search for `ax-surface` / `axnav` / `ax-avatar` in any `.html`/`.css`/`.tsx` | **zero hits** |
| File mtime | **unchanged since 02:14**, the moment MS16 committed it |

**That last row is the one that matters.** The file on disk has not been written since the day I
created it. So this is not a git problem — a corrected file was never saved to that path. Whatever
holds the new version (an editor buffer, a browser artifact, a download folder, another machine) has
not reached this repository.

### Phase 0, as specified in this brief

| must be PRESENT | found |
|---|---|
| `.ax-surface` | **0** ❌ |
| `#ax-avatar` | **0** ❌ |
| `.arrow` | **0** ❌ |

| must be ZERO | found |
|---|---|
| `position:fixed` | **5** ❌ |
| `body.work` | **17** ❌ |

**Five of five hard checks fail.** The revised expectation for `.hair{` / `.fringe{` / `.torso{`
(present in the contract, deleted from the build by Phase 3) is noted and correct — they are present
(1 each) — **but that is not evidence of the new file**, because the old file contains them too. They
are the only checks that pass, and they pass for the wrong reason.

The decision table's first row is unconditional — *"The contract still lacks the four markers →
STOP. Report. Build nothing."* — so phases 1–5 were not started and nothing under `src/` was touched.

**I did not write the corrections myself.** The brief forbids it twice. It is also self-defeating:
Phase 1's proof is a zero-modified-lines diff against the contract, and Phase 4's is a pixel
comparison against it. If I authored the contract, I would be diffing my own work against itself and
reporting a perfect score that means nothing.

---

## HOW TO UNBLOCK THIS IN TEN SECONDS

Save the corrected HTML to `docs/design/ask-aria-transition.html`, then **run this before pasting the
next brief.** It prints PASS only if the file is genuinely the new one:

```bash
cd c:/Users/kansa/aria-saas-audit
f=docs/design/ask-aria-transition.html
sha256sum "$f"
if grep -q '\.ax-surface' "$f" && grep -q '#ax-avatar' "$f" \
   && ! grep -q 'position:fixed' "$f" && ! grep -q 'body\.work' "$f"; then
  echo "PASS — new contract, MS16C can run"
else
  echo "FAIL — still the old contract, MS16C will stop at phase 0"
fi
```

If it prints `566e2fba…` as the hash, the save did not land. Everything else is ready: the verify
script, the baseline, the lift-and-diff harness and the mutation runner all work and are committed.

---

## THE DIAGNOSIS IS CORRECT — I VERIFIED IT AGAINST THE CODE

I built nothing, but the brief's account of *why* the screen broke is checkable read-only, and
confirming it is worth more than a bare "file missing". **Every element is true**, so the four
structural changes will fix the real cause rather than a guess.

| the claim | verified in the code |
|---|---|
| The surface renders inside the dashboard shell | `src/app/dashboard/layout.tsx:59` — `<DashboardShell>{children}</DashboardShell>`. The ax route is a child, so the sidebar and its brand mark are always around it. |
| Decoration is anchored to the viewport, not the surface | **Five** `position:fixed` rules: `.deco` (34), `.brand` (63), `.nav` (66), `.newbtn` (72), `.back` (210). `position:fixed` resolves against the viewport, so `.hill` and the blobs escape over the sidebar **wherever the surface is placed**. |
| The canvas is on `<body>` | `body{height:100vh;overflow:hidden;font-family:'Outfit'…}` at line 28 — the sheet styles the document itself. |
| The state class is on `<body>` | **17** `body.work` selectors — state lives on the document, not a surface element. |
| Cormorant can leak in | Loaded in the root layout (`src/app/layout.tsx:2`), applied via `.font-display` (`aria-tokens.css:195`), so it is live on this route. |

**An honest note on MS16.** I flagged the scoping risk then and scoped the sheet by route, writing
in `RUN-MS16.md` that it "carries `*`, `body` and `:root` rules and must not reach any other route."
That was necessary but **it could not have prevented what Chahat saw**, and I will say so plainly:
route-scoping stops the sheet reaching *other* pages; it does nothing about `body{}` and
`position:fixed` *within* the route it is on. The escape was structural in the source. The lift was
faithful; the source was page-scoped.

---

## WHAT EACH PHASE NEEDS

| phase | blocked on |
|---|---|
| **1 — re-lift** | The new `<style>` block. Cannot lift what does not exist. |
| **2 — no leaking** | Phase 1's `.ax-surface`. The three leak assertions test rules not yet written. |
| **3 — mount the real Aria** | Phase 1's `#ax-avatar` mount point. |
| **4 — re-baseline** | Phase 1's output. Re-running against today's file would re-measure MS16's 0.0px — a true number that answers nothing. |
| **5 — real sizes** | Phases 1–3. |

**Phase 3's research is done and still stands** (`RUN-MS16B.md`), and this brief's framing of it is
right: the drawn CSS face is **not** Aria. She is `public/models/Aria.glb` (18 MB) rendered by
`AriaTalkingHead`, both already in this repo and already used by the live surface. There is no still
image of her anywhere; `public/videos/aria-intro-poster.jpg` is **a different, male character** and
must never be used. The performance concern is real and unchanged — an 18 MB GLB in an animating
circle on a surface that re-renders per streamed token — and is the most likely reason Phase 3 ends
in a measured PARK with the `.fallback` label rather than a mounted avatar. The drawn face gets
deleted either way.

---

## STATE OF THE TREE

**No source file was modified in either attempt.** `src/` is exactly as MS16B left it: tsc 0 errors,
vitest 710/710, `BUILD_EXIT=0`.

Three files remain modified in the working tree that **are not mine and were not committed**:

```
 M .gitignore        + .vercel, + .env*
 M package.json      + "@vercel/global-config": "^1.5.1"
 M package-lock.json
```

The footprint of a Vercel CLI operation (`vercel link` or similar), not of this sprint. Left
untouched so they are not mistaken for sprint output — commit them deliberately if they were meant
to land.

## GATES

Nothing was built, so nothing new was gated. The pre-push hook ran on each run-log commit:
canon-rail-guard clean, tsc 0 errors, unit tests green (710/710).

### ⚠️ THE PUSH GATE FLAKED ONCE — worth knowing, because this is how `--no-verify` habits start

On attempt 1, the **first** push was **BLOCKED** by the pre-push hook with "unit tests failed". The
**second**, on **byte-identical code**, passed 710/710 with a clean canon rail. Nothing was changed
between them and nothing was bypassed.

Investigated before retrying rather than reflexively pushing again:
- `npx vitest run` → **710/710 passed**
- `npm run test:unit` (the hook's exact command) → **710/710 passed**

The failing run was visibly slower (`import 56.71s, tests 31.65s` versus 7–26s run directly), which
points at contention or a timeout-sensitive test under load rather than a regression.

**My own measurement error, stated:** I piped that first push through `tail -5`, so the hook output
scrolled past and **I never saw which test failed.** I cannot name it and will not guess. If it
recurs, capture the whole thing (`git push > push.log 2>&1`) and the test will be in it.

**No bypass was used.** `--no-verify` is on the NEVER-unattended list, and the correct response to a
blocked push is to find out why — which is what happened.

## WHAT IS NOT DONE

**All five phases, twice.** No code written, no stylesheet lifted, no avatar mounted, no baseline
re-run — because every one of them requires a file that has never been saved to this repository.
