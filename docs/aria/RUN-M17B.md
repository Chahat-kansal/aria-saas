# RUN-M17B · LAND THE SPINE

16 September 2026. Autonomous run, RULE 20. Written incrementally — a halted run still leaves a
readable log.

---

## PHASE 0 — THE BYPASS, AUTHORISED AND BOUNDED ✅

### PREFLIGHT

| | |
|---|---|
| `main` | `f3f11f5c` — M17 phases 0–2 + the one-exit guard defect fix, all pushed |
| parked work | `m17-phase3-parked` **`5013c368`**, intact and reachable |
| on disk | all **15** files present and **byte-identical to the branch** (verified file by file, 15 identical / 0 differing) |
| overlap | `one-exit-rule.ts` and its test are **already identical on both** — the block-comment fix landed separately in `f3f11f5c`, so there is nothing to merge there |
| the only other delta | `docs/aria/RUN-M17.md`. **`main`'s copy is kept**: it carries the park record, which is the honest history. The branch's "✅ phase 3" version is superseded. |

Because the 15 files are already on disk and byte-identical, landing them is an `add`, not a merge —
which also avoids a pointless conflict on `RUN-M17.md`.

**⚠️ Premise correction (small):** the paste says *"Five phases, five commits"* and then lists
**six** headings, PHASE 0 through PHASE 5. RULE 15 says one commit per phase, so this run makes
**six** commits. Nothing else changes.

### THE THREE BYPASSED LINES — NAMED, WITH SOURCE AND DESTINATION

Each verified **byte-identical between source and destination** by script, which is the whole
justification: this is a pure file move, not new code.

| # | rule | source | destination | line |
|---|---|---|---|---|
| 1 | `ask-aria-prompt-outside-rail` | `route.ts:2149` | `strategies/main.ts:730` | `systemPrompt = systemPrompt.replace('You are Aria', memoryBlock + '\n\nYou are Aria')` |
| 2 | `ad-hoc-revenue-sum` | `route.ts:1168` | `strategies/answer-council.ts:147` | `const gtSum = (rows: Array<{ total_amount: number \| null }> \| null) => (rows ?? []).reduce((s, r) => s + Number(r.total_amount ?? 0), 0)` |
| 3 | `ad-hoc-revenue-sum` | `route.ts:1535` | `strategies/main.ts:116` | `const swlmRev = (swlmRows ?? []).reduce(` … `(s, x) => s + Number(x.total_amount ?? 0), 0)` |

**Why each could not simply be fixed inside the move:**

- **1** — the rule fires on any new line containing `You are Aria` under `src/lib/aria/ask/`. This
  line is a `.replace()` **needle**, not a prompt: it inserts the memory block immediately *before*
  the constitution's opening words. The canonical fix is `assembleAriaPrompt()`, and **it cannot
  express this** — it always emits `ARIA_CONSTITUTION` first, so memories would move from *before*
  the constitution to *after* it. That is a behaviour change. **M18 owns it.**
- **2 and 3** — the rule wants `getRevenueSnapshot()` / `getRevenueForRange()`. Both sums already
  use the canonical `status = 'completed'` filter, so the values are *probably* identical — and
  "probably" is not good enough for the council's ground-truth anchors, which feed GROUNDING-TEETH
  Check 6. A wrong anchor makes the council start rejecting valid numbers.

### WHAT THE BYPASS IS NOT

- **Not an allow-list entry.** No file is added to `READ_THE_ERROR_ALLOWLIST`,
  `ASK_ARIA_PROMPT_ALLOWLIST`, `EXEMPT_PATHS` or any other list. An exemption is a permanent hole
  that never existed; a bypass is a single recorded act that expires the moment it is used.
- **Not for new code.** The **20 other violations stay fixed properly** — they were discarded
  Supabase errors, locked RULE 7 requires reading them, and six were hiding real defects (phase 1).
- **Not a licence for the next relocation.** Which is exactly why the wording below matters.

### PROPOSED `CLAUDE.md` WORDING — for the founder to accept or edit

**The contradiction, stated plainly.** RULE 14 says: *"If the canon rail flags something you did not
write (a merge can do this, and a file move has done it before on byte-identical code), report it —
do not `--no-verify` past it silently. **If a bypass is genuinely correct, say so explicitly in the
commit message and in your report.**"* RULE 20's NEVER list says: *"NEVER, UNATTENDED — no
exceptions, not even with a decision table: … `--no-verify` …"*

RULE 20 is later and absolute, so M17 correctly halted. But RULE 14 is right that this case exists,
and **any future sprint that relocates grandfathered code hits the same wall** — the canon rail is a
diff scanner and cannot tell a move from authorship.

Proposed as an addition to RULE 20, immediately under its NEVER list:

> **### THE ONE BOUNDED EXCEPTION — A PURE FILE MOVE  *(added 2026-09-16, M17B)***
>
> `--no-verify` stays on the NEVER list for everything except this, and the boundary is the point:
>
> A bypass is permitted **only** when **all** of the following hold, and it is a single recorded
> act, never a standing permission:
>
> 1. **It is a pure file move.** Every flagged line is **byte-identical** between its source and its
>    destination, and that identity is **proved by script in the run log**, not asserted.
> 2. **Every affected line is enumerated in the run log** with its rule, its source file and line,
>    and its destination file and line. A count is not an enumeration.
> 3. **It is never for new code.** A violation on a line that did not previously exist is a real
>    violation and is fixed, not bypassed. If some flagged lines are moved and others are new, the
>    new ones are fixed first and only the moved remainder may be bypassed.
> 4. **It is never an allow-list entry.** Adding a path to a guard's exemption list creates a
>    permanent hole that never existed. The bypass expires when the commit lands.
> 5. **The commit message says so, in those words**, and names the lines.
>
> **Why this is not a loophole:** the canon rail is a *diff scanner over added lines*. Code that
> predates a rule is grandfathered by time rather than by name, so relocating it presents every line
> as newly authored. Without this exception, no sprint can ever move grandfathered code — which is
> the same as saying the repo can never be restructured. *(M17 phase 3: 23 violations, 0 new code.
> 20 were genuine defects in the moved code and were fixed; 3 were byte-identical moves and are
> enumerated in `RUN-M17B.md`.)*
>
> **RULE 14 is the report requirement; this is its boundary.** Read them together.

**⚠️ This is a PROPOSAL. `CLAUDE.md` is not edited by this run.** The founder accepts, edits or
rejects it.

**GATE: PASS.** Continuing to phase 1.
