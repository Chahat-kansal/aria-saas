# RUN-S7 — FINISH THE CLASS

**Autonomous run, 2026-08-29.** Five phases, five commits. The brief was to make two classes of
defect *impossible* rather than fix three instances of them.

---

## THE THREE THINGS TO KNOW

**1. The empty-chrome bug was never a second renderer. It was 31 block types nobody had guarded.**
The paste said the defect "survives in renderers S6 didn't touch." There are only two renderers and
S6 touched both — both already called the shared guard. The guard knew **3 of 34 block types** and
answered "not empty" for the rest. That is why `TOP CUSTOMERS — ALL LAPSED 60+ DAYS` still printed:
a `data_table` with a title and columns and no rows walked straight past it. One predicate, one
edit, both renderers and all four consumers fixed at once.

**2. The rail found four more instances on its first run — in a half of the type file that every
scan so far, including mine, had been blind to.** `ask-types.ts` is written in two formatting eras.
Phases 1 and 2 anchored their field scan to `^`, read the multi-line half, and silently skipped the
11 single-line variants. Four of them had the defect. The phase-1 inventory has been corrected in
place (13 → 17) rather than left standing, and the rail now carries an anti-vacuity assertion so an
under-reaching scan fails loudly instead of reporting all-clear.

**3. Neither contrast defect named in the paste exists; 22 others do.** `Operational status unclear`
appears nowhere in the codebase, and the tan element (the owner's avatar, `--tan`) measures 4.86:1
and passes. Measuring the surface properly in Chromium found **22 text nodes below WCAG AA at every
width** — including the owner's own message bubble and all three avatar badges. All 22 are fixed.

> **Nothing was parked. Nothing was left half-done.** The one thing worth a second look is in
> phase 4: the `--sky` stop was removed from four gradients. It is a visible change to Aria's
> avatar and to the owner's message bubble — still blue, still a gradient, one shade deeper.

---

## PHASE 1 — INVENTORY (no code) · commit `b12bc5f7`

| | |
|---|---|
| files changed | `docs/aria/S7-block-renderer-inventory.md` (new, +94) |
| sibling sweep | every file importing `AskBlock`: **6 hits**, 2 renderers + 4 consumers that delegate |
| mutation check | n/a — no code |
| gates | tsc 0 · vitest green · hook ran ✅ |
| NOT done | nothing |

**Premise corrected before anything was built.** Both renderers already carried
`if (isContentFreeBlock(block)) return null` — `dashboard/BlockRenderer.tsx:19` and
`aria/BlockRenderer.tsx:455`. The class had not moved; it had never been covered.

**Later found to have undercounted by four** — see phase 3. The doc now says so at the top.

---

## PHASE 2 — ONE PREDICATE, 13 SHAPES · commit `d01029a4`

| | |
|---|---|
| files changed | `src/lib/aria/block-content.ts` (+31), `src/lib/aria/block-content-shapes.test.ts` (new, +135) |
| sibling sweep | searched for a second definition of "empty" — **0 hits**. One predicate, three call sites, no fourth written |
| mutation check | add `'columns'` to `data_table`'s body list → **red** |
| gates | tsc 0 · vitest 1153/1153 · hook ran ✅ |
| NOT done | did not touch either renderer — neither needed it |

**The trap, and it is the whole phase: `data_table`'s body is `rows`, not `columns`.** Columns *are*
the header. Counting a non-empty `columns` array as content would have reproduced the exact reported
defect while looking like a fix — a table header with nothing under it. Same for `spreadsheet`'s
`headers`. The mutation probe pins it.

**S6's conservative rule is preserved and tested:** an unknown block type is still never dropped.
**Zero counts as content:** a chart of `[0,0,0]` renders. The provenance work already established
that 0 is a figure, not an absence.

**Two defects in my own edit, caught before committing.** An operator-precedence bug —
`k !== 'type' && speaks(val) || isFiniteNumber(val)` parses as `(k !== 'type' && speaks(val)) || …`,
so a `type` key holding a number would have counted as content — and an orphaned doc comment.

---

## PHASE 3 — THE RAIL · commit `002ab670`

| | |
|---|---|
| files changed | `src/lib/aria/block-chrome-rail.test.ts` (new, +150), `block-content.ts` (+14), `block-content-shapes.test.ts` (+6), `S7-block-renderer-inventory.md` (+26/−3) |
| sibling sweep | every `type: 'x'` variant in `ask-types.ts`: **34 parsed, 19 examined, 4 unjudged** |
| mutation check | three, all red — see below |
| gates | tsc 0 · vitest 1162/1162 across 89 files · `next build` **BUILD_EXIT=0** · hook ran ✅ |
| NOT done | did not extend the rail to non-block surface chrome — that is phase 4's class, deliberately |

**The rail failed on its own first run, which is the point.** It does not check that a guard line
exists — that check passed all along while the empty table printed. It checks that every block type
which *can* print a header over an empty body is a type the predicate actually judges.

### What it found

| type | chrome it prints | body | judged before |
|---|---|---|---|
| `progress_bars` | uppercase title in a panel | `items` | ❌ |
| `activity_stream` | uppercase title in a panel | `items` | ❌ |
| `clay_chart` | solid accent card + title bar over an empty 100px chart | `data` | ❌ |
| `bento_grid` | padded grid box (no title) | `items` | ❌ |

All four verified in the JSX, not inferred from the type definition.

### The mutations

| mutation | result |
|---|---|
| delete the guard from `dashboard/BlockRenderer.tsx` | **red** — 2 tests, "has no guard" |
| remove `clay_chart` from `BODY_FIELDS` | **red** — names `clay_chart (body: data)` |
| narrow the scan back to `^` | **red** — "the scan never reached these judged types: bento_grid, progress_bars, activity_stream, clay_chart" |

That third one is the anti-vacuity assertion and it is the one worth keeping. A scan that matches
nothing passes a "nothing unjudged" test while proving nothing.

### A measurement error I made and fixed

The first guard assertion searched the whole file for a JSX return and reported `components/aria` as
defective. It was not — helper components with their own returns sit above `OneBlock`, so the test
was measuring a different function. Scoped to the enclosing function, with the episode written next
to it in the test file. **Failure pattern #5, produced twice by this sprint's own tooling.**

### What the rail cannot catch — stated in the file, not buried

- Chrome emitted by **surface code** rather than a block renderer (phase 4's class).
- A body whose emptiness cannot be read from the type — a JSON string, a getter.
- Whether the content is **correct**. Only whether there is any.
- A renderer that never imports `AskBlock`. The completeness check covers the four known consumers.

---

## PHASE 4 — CONTRAST · commit `410368d8`

| | |
|---|---|
| files changed | `src/styles/ask-aria-transition.css` (+78, appends only) |
| sibling sweep | every text node on the surface: **62 measured** at each of 1280/1440/1920 |
| mutation check | delete two overrides → the audit reports exactly those two nodes red again |
| gates | tsc 0 · vitest 1162/1162 · `next build` BUILD_EXIT=0 · hook ran ✅ |
| NOT done | did not touch `--sky`, `--tan` or `--amber` themselves; did not change any wording |

### The paste's premise was wrong twice, and correcting it is most of the phase

- **`Operational status unclear` does not exist.** Not in `src/`, not anywhere. The status pill says
  `Connected` / `Reading your till` / `Looking at your day` (S6 phase 5), all on white at 6.81:1.
- **The tan element passes.** `--tan` is the owner's avatar chip, `#4a3719` on `#C9A37A` = **4.86:1**.
  The `$36.50` beside it (`.tt b`) is **16.83:1**, one of the most readable things on the surface.

So the two named defects were not fixed, because neither is real. **22 others were.**

### How the numbers were got

Chromium via Playwright loaded the real stylesheet through the real cascade; each text node's
**computed** colour was measured against its own composited background, with translucent cards
composited and gradients evaluated at their **worst** stop. Screenshots at all three widths.

**My first version of that script was also wrong** — `bgOf` started at the *parent*, so white text
on a blue button was compared against the card behind it and reported as `1:1`. Corrected to start
at the element itself before any of its output was trusted. Same failure pattern as phase 3.

### What was actually below AA — 22 nodes, identical at all three widths

| group | was | now | how |
|---|---|---|---|
| **`--ink3` carrying words** — the `→`, `HOW MUCH ROPE`, the datestamp, the `Aria`/`You` labels, the skill line, the thread subtitle, the composer icons and placeholder, the `⌘⏎` hint, the oath line (13 rules) | 2.17–2.57:1 | 4.61–5.46:1 | → `--ink2` |
| **amber as text** — an estimated figure, an unreadable figure, the `estimated` label on a total | 2.24:1 | 5.46–5.65:1 | → `--amber-ink` `#8A5D07` |
| **red as text** — the streaming error line | 3.87:1 | 8.11:1 | → `--red-ink` `#8E2C2B` |
| **an opacity, not a colour** — the error card's note | 4.19:1 | 7.22:1 | dropped `opacity:.75` |
| **white on amber count badges** — `Awaiting you 52`, the nav tab badge | 2.36:1 | 5.75:1 | badge background → `--amber-ink` |
| **gradient light stops** — Aria's avatar (×3) and the owner's own message bubble | 2.54 / 3.98:1 | 5.17:1 | `--sky` / `#3B7BF0` → `--blue-d`→`--blue` |
| **an opacity again** — the takings line, working mode only | 3.91:1 | 5.37:1 | dropped `opacity:.85` |

**Result: 0 below AA at 1280, 1440 and 1920.**

### Two rules I was given, and how they were kept

- **"Never invent a colour."** None was. `--ink2`, `--blue` and `--blue-d` are the sheet's own
  tokens. `#8A5D07` and `#8E2C2B` were **already in this stylesheet**, used in exactly this way
  (`.oh`, `.ex.warn`, `.ax-incomplete`, `.ax-degraded`, `.ax-error-msg`); phase 4 only gives them
  names. `--ink3`, `--sky`, `--amber` and `--red` are all still defined and still used.
- **"Amber and red carry meaning. Do not repurpose either."** Nothing was recoloured to escape a
  contrast problem and no meaning moved: estimated/awaiting is still amber, warning is still red.
  Only the shade carrying the *letters* changed. The estimated underline keeps `#F3DDB3`, so the
  tier is still told by the rule under the figure as well as by the colour of it.

### The rail that caught me

My first attempt edited the lifted rules in place. **`ax-1.test.ts` failed and it was right** — the
mockup style block is byte-for-byte contract. The entire fix moved into an APPENDS block at the end
of the sheet: same specificity, later in the cascade, wins without one `!important`, and nothing
above the banner is altered. The test was **not** rewritten to accommodate me.

### What was NOT verified, and it matters

The measurement ran against a **harness page** carrying the real stylesheet and the real class
structure — not the live authenticated `/dashboard/ask-aria`. That proves every colour pair in the
cascade. It does **not** prove the composed page: a colour arriving from a component's inline style,
or a class combination the harness does not build, would be missed. The one inline colour found by
reading (`--tan` on the owner avatar) was added to the harness and measured. **Founder check:** open
the real surface once and confirm nothing reads *darker* than intended, particularly Aria's avatar
and the owner's message bubble.

---

## PHASE 5 — THE RUN LOG · this commit

This file.

### Confirmed still rendering after all four phases

- **The provenance underline.** `AnswerMarkdown.tsx:60` still emits `n2` / `n2 est`, screenshotted:
  `A$36.50` blue/verified, `A$42.00` amber/estimated, still visually distinct tiers.
- **The council line.** S6's `brain_readouts` / `council_split` judgements are unchanged and
  explicitly re-asserted in `block-content-shapes.test.ts`; the S6 phase-4 headline
  (`54 things stood out. — 52 need a decision.`) renders.
- **An unknown block type is still never dropped.**

---

## THINGS THAT CHANGE A LATER MEGA-SPRINT

1. **`ask-types.ts` has two formatting eras and it has now caused one real miss.** Any future tool
   that scans it must not anchor fields to `^`. Worth normalising the file in a sprint of its own —
   **not done here**, it is outside this sprint's domain and would have been a tidy-up.
2. **`next build` OOMs on this machine at the default heap.** The first attempt died at
   `BUILD_EXIT=134` (V8 heap exhaustion in the type-check worker) while **the task wrapper reported
   "exit code 0"** — precisely the trap RULE 3 documents. All builds here used
   `--max-old-space-size=8192`. If CI ever runs the same command at the default, expect this.
3. **`--ink3` is now a non-text token by contract.** A future component that reaches for it for a
   label re-creates the class. Worth a rail if it recurs — one instance is not yet a pattern.
4. **The contrast harness is scratch, not committed.** Making it a permanent test would need a
   Playwright fixture and a decision about where it lives. Flagged, **not** built unattended.

---

## GATES, FINAL

| gate | result |
|---|---|
| `npx tsc --noEmit` | **0 errors** |
| `npx vitest run` | **1162 passed, 89 files, exit 0** (exit code read directly, never through a pipe) |
| `npx next build` | **BUILD_EXIT=0**, read from the log, not the wrapper |
| pre-push hook | ran on every push |
| browser contrast | **0 below AA** at 1280 / 1440 / 1920 |
