# RUN-S6 — structure that promises nothing

**Run date:** 2026-08-29 · autonomous (RULE 20) · branch `main`
**Seven commits** — five phases plus one test rewrite and one workflow fix I caused.

---

## THE ONE-SCREEN SUMMARY

| phase | commit | outcome |
|---|---|---|
| 0 — gate | — | provenance **1** · 290 conversations · 52 pending · swap in place |
| 1 — the council | `aa9931f4` | **REAL, not removed** — the bug was printing the header before checking |
| 2 — anchors | `922270bf` | junk came from **four bare `number[]` spreads** + label-key collisions |
| — test rewrite | `2dab2e0e` | S3's chain assertions moved to the new assembly |
| 3 — the chip | `0a4bc6a8` | cut at the **source**, not by CSS — same helper as S3 |
| 4 — 54 and 52 | `16c6b892` | **neither was wrong** — labelling fix + the rail |
| 5 — unsupported claims | `d0ba72c7` | three continuity claims removed, domains kept |

### The three things you most need to know

**1. The council is real and stays.** `council.ts:457-461` asks the model for `brain_readouts` and
`council_split` by name, with example payloads, and the route passes `ask_blocks` straight through.
The defect was that **both renderers print their chrome before looking at the body** — an empty
`items: []` renders a header and four coloured role labels over nothing. Fixed at the source and at
both renderers, with **one** definition of "empty".

**2. Neither 54 nor 52 was wrong.** Queried live: 52 pending decisions + a zero-till notice + a
low-stock notice (7 lines) = 54 things noticed. S3's fix is working; what was missing was any
indication of *why* they differ. So this was a labelling fix — and the rail the sprint asked for now
exists, because a comment stating the rule has failed to stop it twice.

**3. Two premises in the paste were wrong, and one of my own habits was.** Details below — including
that I committed twice with a red suite because `vitest | tail && git commit` takes its exit status
from `tail`.

---

## PHASE 1 — THE COUNCIL: REAL

**Option (a), and the code settles it rather than my judgement.** `council.ts:457-461`:

```
- "brain_readouts": what each advisor found in plain owner language...
  {"type":"brain_readouts","items":[{"role":"growth","icon":"📈","text":"..."}]}
- "council_split": only when advisors genuinely disagree...
```

The model is asked for sections by name; `route.ts:1309` passes `council.ask_blocks` through
untouched. **Sections are real when the model produces them.** So the scaffold does not come out —
what comes out is the assumption that it always has content.

**Where it broke:**
```
dashboard/BlockRenderer.tsx:86-105   prints the "Council read" panel + header, THEN (block.items ?? []).map()
dashboard/BlockRenderer.tsx:108-126  prints Growth / Risk / Strategy boxes from fields that may be undefined
```
The stored message for `7372a1a6` confirms the trigger — its assistant keys are
`ts, role, content, downloads, provenance`. One paragraph. The model answered in prose; the panel
promised an analysis anyway.

**Fixed at the source AND at both renderers, with one definition.** There are two `BlockRenderer`s
plus the route — three places to decide "is this empty?" is three places to disagree.
`isContentFreeBlock()` is the single answer. Deliberately conservative: **an unknown block type is
never dropped**, because losing a real answer is far worse than an empty panel.

---

## PHASE 2 — WHERE THE JUNK ANCHORS CAME FROM

**`route.ts:1143`** spreads four bare `number[]` sets into the anchor list:
```
...topCustLTVs, ...healthAnchors, ...goalAnchors, ...benchmarkAnchors, ...hypothesisAnchors,
```
They carry no per-value provenance — chart axes, percentage deltas, constants. **That is where
`-800`, `-600`, `-100` and `100` came from.**

**And a second cause the paste did not name.** `anchorLabels` was keyed by `String(value)`, so two
metrics sharing a value collapse to one key with last-write-wins. That is why **7 labels became 4**:
on this business revenue-today, the weekly target and a promo count are all `0`. The stored turn has
**nine zeros, not five**. An owner clicking `0` would read whichever label landed last — a coin-flip
presented as a fact.

`buildProvenance()` fixes both: unlabelled values never enter, and an **ambiguous** value is dropped
entirely rather than labelled by coin-flip. Anchors and labels are now the same length by
construction, and every stored anchor resolves.

**Grounding is not weakened.** `anchorValues` still reaches the verifier unchanged — Check 6
validates against as wide a corpus as possible, and narrowing it to tidy the UI would trade one bug
for a worse one. Two tests pin both halves. **Zero is still a legitimate anchor** when it means one
thing; the rule drops ambiguity, not awkward numbers.

The existing row for `7372a1a6` keeps its 33/4 — **history records what happened**, it is not rewritten.

---

## PHASE 3 — THE CHIP WAS CUT AT THE SOURCE

**I checked the CSS first and it was innocent.** The AX stylesheet has exactly two
`white-space:nowrap` rules — thread titles (`:305`, with ellipsis, intentional) and a tabular figure
(`:367`). `.nt` and `.ax-followup` wrap freely with no max-width, and `ChatSuggestions` slices the
*array* to 4, never the strings.

**The cut was in the data:** `ax-context.ts:105` built the subtitle as
`(a.recommendation ?? '').slice(0, 140)` — no word boundary, no ellipsis. The owner cannot tell
whether Aria stopped talking or the text stopped fitting.

**Same helper, not a second one.** S3 fixed this class for titles; the rule is now `truncateAtWord()`
in `thread-title.ts`, and `fallbackTitle()` was rewritten to call it so the two surfaces cannot drift.

**Measured in Chromium** at 1280/1440/1920, surface narrowed by the 220px sidebar, with real long
recommendation text — both the text and the layout, because fixing one without the other still
leaves a lie:
```
text    2 of 3 ellipsised, the short one untouched, none cut mid-word
layout  every width: overflowsChip=false, scrollClipped=false
```
`docs/aria/S6-chip-measurements.txt`.

---

## PHASE 4 — WHICH OF 54/52 WAS WRONG: NEITHER

```
pending decisions (aria_actions, status='pending')   52   <- the badge
completed sales today                                 0   -> 1 notice
lines at/below reorder point                          7   -> 1 notice
things noticed = 52 + 2                              54   <- the headline
```

**The paste calls this the bug's third appearance. It is not.** S3 removed the real defect (the
headline counting a capped list); both numbers are now correct and simply count different things.
Per the decision table, that is a **labelling** fix:

> "54 things stood out — 52 need a decision."

The clause is suppressed when the two are equal, so nobody reads *"52 things stood out — 52 need a
decision."*

### What the new rail catches
**No identifier named `*Total` may be assigned the `.length` of anything.** That is the shape the
defect took both times: a name promising completeness, fed by a capped list. It carries its own
mutation probe, because an assertion that scans for a pattern can pass by matching nothing at all.

**What it cannot catch**, written into the file: a count query that is itself wrong; a page size
applied inside an RPC or view; a total computed in a file it does not read; and `.length` of a list
that legitimately *is* the whole set — which is why it is scoped to `*Total` names.

---

## PHASE 5 — EVERY UNSUPPORTED CLAIM FOUND

| claim | what the data says | new wording |
|---|---|---|
| *"I've been watching your stock, your money and your people **all day**"* | Aria reads on load and when asked. Nothing runs all day. | "Nothing through the till yet today. Connected to your till, stock and people." (takings first when there are any) |
| *"Watching your till"* — idle pill, directly above "Takings today A$0.00" | same | "Connected" |
| *"**Always on** · connected records only"* | the same claim in miniature | "Connected records only" |

**What was NOT wrong, and why this is not an apology.** I checked the domains before touching the
words: **95 products, 1,802 completed sales all-time, 4 active staff, 51 customers.** "Stock, money
and people" is *backed*. Only the continuity claim was false, so only that went — *"I have no data"*
would be its own untruth on a business with 1,802 sales.

The sweep is written as a **class**, not three string checks: any first-person continuous-activity
claim (watching / monitoring / keeping an eye on / all day / always on) fails the test.

---

## GATES

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **1128 passed / 1128** across 87 files, **exit code read directly, not through a pipe**
- `npx next build` — **BUILD_EXIT** read from `build-s6.log`
- **Mutations, all RED:** rendering a heading with no content (both renderers) · storing an
  unlabelled anchor · restoring the raw 140-char slice · pointing the headline at the capped list ·
  a `*Total` fed by a `.length` · reinstating a "watching your…" claim

### Four things I got wrong, recorded rather than buried

**0. I broke the build, and only the build caught it.** My import prepend in phase 1 landed ABOVE
`'use client'` in both `BlockRenderer`s, which violates the project's own rule that `'use client'`
must be line 1. **`tsc` passed. All 1,128 tests passed.** Only `next build` failed —
`BUILD_EXIT=1`, "The 'use client' directive must be placed before other expressions".

And the wrapper reported **exit code 0** while the log said `BUILD_EXIT=1`. That is precisely the
trap the standing rule names, live, in this run: had I trusted the notification I would have pushed
a broken build. Imports moved below the directive; re-run clean at `BUILD_EXIT=0`, 0 compile
failures.



**1. I committed twice with a red suite** — phase 2 here, and phase 4 in S5. The cause is my own
command shape:
```
npx vitest run 2>&1 | tail -5 && git add ... && git commit ...
```
The pipe makes the exit status that of `tail`, which is always 0, so `&&` proceeds over a red suite.
Now: capture to a file, read the real exit code, then stage. **This is the same lesson as "read
`BUILD_EXIT` from the log, never the wrapper"** — I was applying it to builds and not to tests.

**2. A mutation probe passed while proving nothing.** In phase 5, replacing the bare string
`'Connected'` hit my *own explanatory comment* first — which the test's comment-stripper removes —
so the probe went green against an unchanged render. Re-anchored on the ternary `: 'Connected')`.
Only visible if you check that a probe can actually go red.

**3. Four of S3's chain assertions broke** when phase 2 replaced the anchor assembly. Rewritten to
the new shape, **not deleted**, each with a note that the behaviour moved. One improved: the
non-finite guard moved into `buildProvenance()`, where a real unit test covers it instead of a regex
over a 2,700-line route.

### Not observed
I cannot authenticate to this deployment, so **no council answer was watched rendering**, and the
next real turn is what will store the corrected anchor shape. Provenance stands at **1 of 290** — the
value S5 was waiting for, now confirmed, and the first turn after this deploy is what proves the rest.
