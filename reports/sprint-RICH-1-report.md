# Sprint RICH-1 — Ask Aria Rich Renderers (10 new block types)
**Date:** 2026-06-11
**Mode:** SOLO
**Build gate:** ✅ `npx tsc --noEmit` → 0 errors | `npx next build` → PASS (EXIT:0)
**Commit:** `0e2e7ed5`

---

## Goal
Add 10 new `AskBlock` union members and matching renderers so Aria can reply with intent-matched rich UI blocks instead of plain text for every response type.

---

## Pre-flight findings

### File path discovery (critical correction)
The spec assumed:
- `src/components/dashboard/BlockRenderer.tsx` = Recharts (switch/OneBlock)
- `src/components/aria/BlockRenderer.tsx` = POS terminal (if-chain)

**Actual files are swapped:**
- `src/components/aria/BlockRenderer.tsx` = Recharts, 839 lines, `OneBlock` switch, `blocks: AskBlock[]` array prop
- `src/components/dashboard/BlockRenderer.tsx` = POS terminal, 416 lines, `if` chain, single `block` prop, `onChoice` prop

All edits were applied to the **correct** files based on actual content.

### ask-types.ts multi-line format
The spec's find string assumed the `task_plan` type was on a single line. The actual file uses a multi-line block format (lines 152–161). Edit adapted to match actual content.

---

## Changes

### FILE 1 — `src/lib/aria/ask-types.ts`
Appended 10 new union members after the `task_plan` block:

| Type | Shape |
|---|---|
| `animated_kpi` | label, value, format?, delta?, delta_label?, variant? a/b/c |
| `bold_metric` | label, value, format?, dark? |
| `bento_grid` | items[]: label, value, sub?, span? full/half, accent? |
| `progress_bars` | title?, items[]: label, value, max?, color? |
| `activity_stream` | title?, items[]: text, time?, dot_color? |
| `alert_card` | title, body, severity? info/warning/critical |
| `ai_reasoning` | question, reasoning, confidence? low/medium/high |
| `clay_chart` | title?, data[]: name+value, color? |
| `kinetic_text` | words[], colors?[] |
| `aurora_summary` | title, value, sub?, format? |

---

### FILE 2 — `src/components/aria/BlockRenderer.tsx` (Recharts, all 10 cases)

10 new `case` blocks added to the `OneBlock` switch before the `default`:

- **`animated_kpi`** — bordered card with accent top stripe, 36px value, delta arrow. Variants a/b/c rotate through sage/forest/violet
- **`bold_metric`** — 56px number, light/dark variants
- **`bento_grid`** — 2-column CSS grid; first tile always forest green, alternating sage/white
- **`progress_bars`** — labelled horizontal bars with colour-coded fill (green/amber/red thresholds)
- **`activity_stream`** — dot timeline with optional timestamps
- **`alert_card`** — dark bg + coloured border + status dot; severity drives palette
- **`ai_reasoning`** — question + boxed reasoning + confidence dot
- **`clay_chart`** — frosted clay surface with Recharts BarChart at 100px height; highlight max bar in forest green; uses `BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer` (already imported)
- **`kinetic_text`** — bouncing words with injected `@keyframes ariaKb` animation
- **`aurora_summary`** — aurora gradient overlay on deep purple bg, large value display

---

### FILE 3 — `src/components/dashboard/BlockRenderer.tsx` (POS terminal, 8 cases)

8 new `if` blocks inserted before the `// Graceful fallback:` comment.
Skipped: `ai_reasoning` (no reasoning UI needed in POS terminal), `clay_chart` (no Recharts in this renderer).
Dark `rgba` palette to match existing POS terminal theme.

- **`animated_kpi`** — dark glass card with border, 32px value
- **`bold_metric`** — 48px value in sage, uppercase label
- **`bento_grid`** — 2-column dark grid with rgba tiles
- **`progress_bars`** — dark bars with colour-coded fill (sage/amber/red)
- **`activity_stream`** — dark dot timeline
- **`alert_card`** — dark bg + coloured border; severity → red/amber/blue
- **`kinetic_text`** — bouncing words with `@keyframes ariaKb`
- **`aurora_summary`** — aurora radial gradient on `#1a0a2e` base

---

### FILE 4 — `src/app/api/aria/ask/route.ts` (system prompt additions)

Two additions to the OUTPUT FORMAT section:

1. **SPREADSHEET OVERRIDE** (added in previous prompt): non-negotiable rule — emit `spreadsheet` first + `data_table` on any export mention.

2. **RICH RENDERER SELECTION** (this sprint): Two intent-inference tables appended:
   - STEP 1: 13-row phrasing → intent mapping
   - STEP 2: 11-row data shape → renderer mapping
   - CRITICAL RENDERER RULES: spreadsheet override reinforced, `kinetic_text` as loading first block, `alert_card` only for real anomalies, ALWAYS 2 paragraphs narrative before `json_blocks`

---

## Schema changes
None.

---

## Files changed

| File | Change |
|---|---|
| `src/lib/aria/ask-types.ts` | +10 union members after task_plan |
| `src/components/aria/BlockRenderer.tsx` | +10 cases in OneBlock switch (+~200 lines) |
| `src/components/dashboard/BlockRenderer.tsx` | +8 if-blocks before fallback (+~155 lines) |
| `src/app/api/aria/ask/route.ts` | RICH RENDERER SELECTION tables + rules added to system prompt |
| `reports/sprint-RICH-1-report.md` | This file |

---

## Acceptance criteria status

| Check | Status |
|---|---|
| `npx tsc --noEmit` → 0 errors | ✅ |
| `npm run build` → PASS | ✅ |
| No TypeScript errors on new block types | ✅ (type-safe via narrowed union) |
| 10 new types in ask-types.ts | ✅ |
| 10 renderers in aria/BlockRenderer.tsx (Recharts) | ✅ |
| 8 renderers in dashboard/BlockRenderer.tsx (POS) | ✅ |
| System prompt updated with intent tables | ✅ |
| ai_reasoning + clay_chart skipped in POS renderer | ✅ |
| RULE 0 (upgrade only, nothing removed) | ✅ all existing cases preserved |
| RULE 5 (protected files untouched) | ✅ |

---

## Founder verify checklist

- [ ] Ask Aria "what was today's revenue" → should render `animated_kpi` or `bold_metric`
- [ ] Ask Aria "show me weekly targets" → should render `progress_bars`
- [ ] Ask Aria "what happened today" → should render `activity_stream`
- [ ] Ask Aria "why did you recommend X" → should render `ai_reasoning`
- [ ] Mention anomaly/alert → renders `alert_card` dark treatment
- [ ] Ask for export/spreadsheet/CSV → `spreadsheet` block first + `data_table` alongside
- [ ] POS terminal ask → same block types render without Recharts errors
- [ ] `clay_chart` / `ai_reasoning` do NOT render in POS terminal (fallback to text)
- [ ] `aurora_summary` renders the radial aurora gradient correctly

---

## Push instruction
```
git push origin main
git log origin/main..HEAD   # must be empty
```
