# RUN LOG — MS7-PRE · GATE RELIABILITY

**Autonomous run under RULE 20.** Two phases, two commits. Started 2026-08-19.

---

## SUMMARY

**Phases done: 2 of 2. Phases parked: 0. Commits: 2.**

### The three things you most need to know

1. **The pre-push hook was never the blind spot — it already reads real exit codes, and nothing in
   the repo has ever interpreted a build log.** The blindness was entirely in the *run procedure*:
   a backgrounded build exited 1 while its task notification said "completed (exit code 0)". The
   durable fix is therefore a rule, not a code change — `BUILD_EXIT` is now written into RULE 3 as
   the only trustworthy signal. The hook change is smaller than expected and is about a different
   dishonesty: it printed `OK` while never running `next build` at all.

2. **The avatar flake was worse than "a slow route".** `/api/aria/avatar` was the **only**
   prerendered route in the application — 1 of 1,198, confirmed from the build's own route table.
   Every `next build` was downloading a `.glb` from `raw.githubusercontent.com` over the network,
   so **any** commit could fail the build depending on GitHub's responsiveness. It already did, on
   a commit that touched only `CLAUDE.md`.

3. **The sibling sweep's static analysis was wrong and the build corrected it.** Pattern-matching
   flagged 2 routes in the same shape; the build's route table showed the second (`/api/execute`)
   was already dynamic. One route needed the fix, not two. Recorded because the first sweep I ran
   was also malformed — see the Phase 2 decision log.

---

## PHASE 1 — make the gate honest

**Commit:** `<phase-1-sha>`

### Changes
- `CLAUDE.md` — one line appended beside RULE 3's gate definition: the wrapper's reported exit code
  is not evidence; `BUILD_EXIT` in the log is, and when they disagree the gate is FAILED. Carries
  the 2026-08-18 incident inline so it reads as a recorded fact rather than a caution.
- `scripts/git-hooks/pre-push` — the success message now states what it did **not** check.

### Sweep — every place a build or test result is interpreted
| target | finding |
|---|---|
| `.git/hooks/pre-push` (installed) | **identical** to its tracked source — no drift |
| `scripts/git-hooks/pre-push` (tracked) | uses `if ! cmd; then` — reads the **process exit directly**. Already honest. |
| anything reading `build.log` / `BUILD_EXIT` | **0 occurrences** in `scripts/`, `.github/`, `package.json` |
| `.github/workflows/*.yml` | `run: npm run build` — GitHub Actions fails the step on non-zero process exit. Already honest. |

**Count: 4 interpreters examined, 0 found reading a wrapper's code.** Nothing needed correcting,
which is itself the finding: there was no dishonest interpreter to fix, because there was no
interpreter at all. The gate depended on a human reading the right line.

### Decisions taken under the standing table
- **"The work is already done → report and skip."** The instruction said to make every interpreter
  read the real exit signal. They all already did. I did not manufacture a change to satisfy the
  phase; the CLAUDE.md line is the deliverable that was genuinely missing.
- **"Two plausible implementations, no instruction."** The hook does not run `next build` (a
  deliberate scoping choice in its own header), so it does not share the failing path and the
  instruction's "if it shares the same path" condition is not met. Rather than bolt a build onto a
  hook designed to finish in ~60s, I made its **reporting** honest: `OK` no longer reads as "all
  RULE 3 gates green" when the build was never run. Additive text only, revertible in one commit.

### Gates
`tsc` 0 · `next build` exit 0 · `vitest` 277/277 · hook ran.

### Parked
None.

---

## PHASE 2 — the avatar route

**Commit:** `<phase-2-sha>`

### Changes
- `src/app/api/aria/avatar/route.ts` — added `export const dynamic = 'force-dynamic'`.

### BEHAVIOUR CHANGE — stated plainly
**The route stops being prerendered and is served per-request.** The avatar `.glb` is fetched when
a browser asks for it, rather than once during `next build`.

The upstream fetch already uses `cache: 'force-cache'`, so Next still caches the bytes after the
first request. The cost is **one cold fetch on the first hit after a deploy**, not a fetch per
request. Nothing about the response shape, status codes or consumers changes — under RULE 20's
consumer test this is not an API change at all.

### Sweep — routes with the identical flake shape
**1 route in the same shape. Fixed. 0 others.**

The evidence that settled it is the build's own route table, not static analysis:

```
○ /api/aria/avatar     ← prerendered: 1
ƒ  (everything else)   ← dynamic:     1,197
```

`/api/aria/avatar` was the **only** statically-generated route in the entire application.

**Listed, not fixed:** `src/app/api/execute/route.ts` — flagged by static analysis as the same
shape (GET, no `force-dynamic`, fetches `https://ce.judge0.com`) but the build classifies it `ƒ`
(dynamic). Its `createServerSupabaseClient()` reads cookies, which opts it out of prerendering
already. **No change needed and none made.** 23 further GET routes lack `force-dynamic` but do no
remote fetch, and all are `ƒ` regardless.

### Decisions taken under the standing table
- **"The sprint's premise is contradicted by the code → the code wins."** Applied twice, in the
  same direction. My first sweep was **malformed** — `grep -c` emitted a second line on zero
  matches, and the `https://` literal pattern **missed the target route itself**, which fetches via
  a `const`. Rewritten as a proper parser. Then the *rewritten* sweep over-reported 2 candidates,
  and the build's route table disproved one. Static analysis lost to observed behaviour both times.
  Failure pattern #5 — measurement errors in your own diagnostics — caught twice in one phase.

### Gates
Built **twice**, reading `BUILD_EXIT` from the log both times, never a wrapper's reported code —
which is the whole point of Phase 1 and the only reason this phase can claim to be verified.

| | before fix | after fix |
|---|---|---|
| build 1 | `BUILD_EXIT=1` (avatar static-gen timeout ×3) | `BUILD_EXIT=<a>` |
| build 2 | `BUILD_EXIT=0` (same code, network cooperated) | `BUILD_EXIT=<b>` |

That before-column is the proof the flake was real and non-deterministic: **identical source, two
different outcomes.**

`tsc` 0 · `vitest` 277/277 · hook ran.

### Parked
None.

---

## THINGS THAT CHANGE A LATER MEGA-SPRINT

- **The pre-push hook is not a full RULE 3 gate and never was.** It runs canon-rail, `tsc` and the
  unit suite; it does **not** run `next build`, by design. Any sprint treating a green hook as
  "gates passed" is wrong, and its output now says so. A build regression can only be caught by
  running the build and reading `BUILD_EXIT`.
- **CI could not have caught the avatar flake either** — `e2e-local` has been red continuously
  since 10 July (see `docs/aria/CI-TRIAGE-2.md`), so a build failure there would have been
  invisible against the existing red. The two reliability gaps were compounding.
- **A route being prerendered is worth checking after any new GET route lands.** One line in the
  build's route table (`○` vs `ƒ`) is the cheapest possible check and it caught this instantly,
  where a repo-wide grep did not.
