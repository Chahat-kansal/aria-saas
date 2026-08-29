# S7 PHASE 1 — every block renderer on the Ask Aria surface

Derived by reading the code and parsing `src/lib/aria/ask-types.ts` with a balanced-brace scan.
**No code changed in this phase.**

---

## THE PREMISE NEEDS CORRECTING BEFORE ANYTHING IS BUILT

The paste says the bug survives "in renderers S6 didn't touch." **S6 touched both renderers — there
are only two.** Both already call the shared guard on entry:

```
src/components/dashboard/BlockRenderer.tsx:19    if (isContentFreeBlock(block)) return null
src/components/aria/BlockRenderer.tsx:455        if (isContentFreeBlock(block)) return null
```

**The bug did not move to another renderer. It was never covered for 31 of 34 block types.**

`isContentFreeBlock()` judges exactly three — `brain_readouts`, `council_split`, `lead` — and
returns `false` (render it) for everything else. So `TOP CUSTOMERS — ALL LAPSED 60+ DAYS` is a
`data_table` with a `title` and `columns` but no `rows`: the guard runs, says "not empty", and the
renderer prints the header.

That reframes phase 2. It is not "add the guard to more renderers" — every renderer has it. It is
**"teach the one predicate the other 31 shapes."**

---

## TABLE A — THE RENDERERS

| # | renderer | file | block branches | guard on entry | prints chrome first? |
|---|---|---|---|---|---|
| 1 | `BlockRenderer` (dashboard) | `src/components/dashboard/BlockRenderer.tsx` | 24 `block.type ===` branches | ✅ `:19` | **only for the 3 types the predicate knows** |
| 2 | `OneBlock` (aria) | `src/components/aria/BlockRenderer.tsx` | 33 `case` branches | ✅ `:455` | **same** |

**Consumers, for completeness** — none of these is a third renderer:

| surface | renders blocks via |
|---|---|
| `/dashboard/ask-aria` (AX, the default) | `AskAriaTransition.tsx:660` → dashboard renderer |
| `/dashboard/ask-aria/classic` | `classic/page.tsx` → dashboard renderer |
| `AriaBriefingCard` | `:383` → dashboard renderer (delegates, no own branches) |
| `/pos/ask` | `pos/ask/page.tsx:9` → aria renderer |

**So: 2 renderers, 4 consumers, 1 shared predicate.** The predicate is the only place to fix this.

---

## TABLE B — BLOCK TYPES THAT CAN PRINT CHROME OVER NOTHING

34 types exist. **12 have a header/label plus an array body**, and are unjudged today. Plus
`spreadsheet`, which has column headers and rows but no title — the same failure without the label.

> ## ⚠️ CORRECTED IN PHASE 3 — THIS TABLE UNDERCOUNTED BY FOUR
>
> **17, not 13.** The scan that produced this table was line-anchored (`/^\s*(\w+):/m`).
> `ask-types.ts` is written in **two formatting eras**: multi-line variants above line ~160, and
> single-line ones (`| { type: 'x'; title?: string; items: Array<{...}> }`) below it. A line-anchored
> field scan reads the first era and is **blind to the second — 11 of the 34 types**.
>
> Four of those eleven have the defect and are listed in the table below. All four were verified in
> the JSX, not inferred: `progress_bars` and `activity_stream` print an uppercase title into a panel
> and then `items.map()`; `clay_chart` draws a solid accent-coloured card with a title bar over an
> empty 100px chart container; `bento_grid` has no title but still draws a padded grid box around
> nothing.
>
> The phase-3 rail now carries an **anti-vacuity assertion** for exactly this: every type the
> predicate claims to judge must be one the rail's own scan actually reached. Reverting the scan to
> the line-anchored version makes the rail fail with
> `the scan never reached these judged types: bento_grid, progress_bars, activity_stream, clay_chart`
> instead of reporting all-clear. That is failure pattern #5 — a diagnostic that measures the wrong
> thing and calls it a finding — caught by the rail built to catch the class it belongs to.

| block type | chrome it prints | body that can be empty | judged today? |
|---|---|---|---|
| `data_table` | `title`, `columns` | **`rows`** | ❌ ← **the screenshot** |
| `comparison_table` | `title`, `left_label`, `right_label` | `rows` | ❌ |
| `action_card` | `title`, `body` | `buttons` | ❌ |
| `action_list` | `icon`, `prompt` | `items` | ❌ |
| `menu_list` | `title` | `items` | ❌ |
| `metric_row` | `label` | `items` | ❌ |
| `task_plan` | `title`, `label` | `steps` | ❌ |
| `infographic` | `title`, `subtitle`, `heading` | `sections` | ❌ |
| `slides` | `title`, `heading` | `slides` | ❌ |
| `chart` | `title` | `labels` / `values` | ❌ |
| `bar` | `title`, axis labels | `data` | ❌ |
| `styled_chart` | `title`, axis labels | `data` | ❌ |
| `spreadsheet` | `filename`, `headers` | `rows` | ❌ |
| `progress_bars` | `title` | `items` | ❌ ← **missed here, found in phase 3** |
| `activity_stream` | `title` | `items` | ❌ ← **missed here, found in phase 3** |
| `clay_chart` | `title` bar in the accent colour | `data` | ❌ ← **missed here, found in phase 3** |
| `bento_grid` | padded grid box (no title) | `items` | ❌ ← **missed here, found in phase 3** |
| `brain_readouts` | "Council read" panel | `items` | ✅ S6 |
| `council_split` | Growth/Risk/Strategy boxes | text + `choices` | ✅ S6 |
| `lead` | — | `content` | ✅ S6 |

⚠️ **`data_table`'s body is `rows`, not `columns`.** Columns *are* the header — a table with columns
and no rows is exactly the reported defect, so treating a non-empty `columns` as content would
reproduce it.

---

## THE ANSWER TO THE PHASE

> **Renderers: 2. Renderers with the defect: 2 — but not for the reason assumed.**
> Both are guarded; the guard is blind to 31 of 34 types, **17** of which can print a header over an
> empty body. That is one fix in one predicate, not two renderers to patch.
>
> *(13 when this was written; corrected to 17 in phase 3 — see the box above.)*

## WHAT THIS INVENTORY DOES NOT COVER

- **Non-block chrome.** The tan card and the grey status bar in the screenshot are not blocks — they
  are surface furniture in `AskAriaTransition`/CSS. They are phase 4 (contrast), and defect 2 and 3
  in the paste are correctly identified there as a *different class*.
- **Renderers outside Ask Aria** (POS receipts, inventory, ordering archetypes). They render their
  own domain objects, not `AskBlock`, and are out of scope.
- **Whether a block's content is *correct*** — only whether there is any.
