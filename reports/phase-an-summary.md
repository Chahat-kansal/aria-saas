# Phase-AN A–E Summary — apply the 22 Design Spells to product surfaces

**Run date:** 2026-06-15
**Prompt source:** `prompts/phase-an-prompts.md`
**Library:** `src/lib/anim/spells.ts` (SPELLS-1 — 22 reusable CSS keyframes, reduced-motion-safe via `spellsCSS()`)
**Standing rules:** animation-only; additive only; no layout shift; reduced-motion respected; ONE commit per sprint; STOP before push.

> ⚠️ Note on naming: the prompt references spells by descriptive intent ("icon-micro", "spring-sidebar", "modal-spring", "listening-ring", "bouncy-toast", "rubber-slider", "bouncy-dropdown", "number-counter", "year-review", "swipe-dismiss", "activity-pulse", "bottom-sheet", "keyboard-onboarding", "ripple", "drag-reorder"). The shipped library uses generic CSS spells (`fade-in-up`, `pop-in`, `scale-in`, `ripple`, `count-up`, etc.). Each application uses scoped per-surface CSS that channels the intent (spring overshoot, pulse, slide-up) rather than reusing the generic library class blindly. Reduced-motion is gated in every scoped block.

## Sprint AN-A — dashboard navigation
Commit: `feat(an-a): dash nav micro-interactions (icon/ripple/drag-reorder)` (b197a086)

| Spell | Component / file | Result |
|------|-----------------|--------|
| 1 icon-micro | `src/components/dashboard/Sidebar.tsx` — `<item.icon className="an-nav-icon …" />` (line ~469) + scoped `<style>` injected inside `<aside>` | APPLIED — 220ms cubic-bezier(.34,1.56,.64,1) scale(1.18)+rotate(-4deg) on hover of parent `<a>`/`<button>` |
| 21 ripple | `src/components/dashboard/RetailDashboard.tsx` — Quick Actions `<button className="an-tile-ripple …">` (line ~534) + scoped `<style>` at top of root div | APPLIED — `:active` ::after radial-gradient ripple (520ms ease-out) |
| 22 drag-reorder | dashboard widget grid | **SKIPPED** — no draggable widget grid exists on the dashboard today (the home grid is a fixed Tailwind grid). Per prompt: "if persistence isn't already wired, animate but do NOT add new persistence — log that as a follow-up." Follow-up: introduce a widget-grid surface before applying. |

Reduced-motion: ✅ both scoped style blocks include `@media (prefers-reduced-motion: reduce)` overrides → animations / transitions disabled.

## Sprint AN-B — Ask Aria + sidebar
Commit: `feat(an-b): ask-aria + sidebar spring/listening animations` (716d3c43)

| Spell | Component / file | Result |
|------|-----------------|--------|
| 4 spring-sidebar | `src/components/dashboard/DashboardShell.tsx` — mobile sidebar panel transform transition (line ~74) + `.an-spring-sidebar` class | APPLIED — `transition: transform 360ms cubic-bezier(.34,1.56,.64,1)` (springy overshoot replaces previous flat cubic-bezier) |
| 3 modal-spring | `src/app/dashboard/ask-aria/page.tsx` — split-grid root `<div className="aria-split-grid an-modal-spring">` (line ~972) | APPLIED — `.55s` cubic-bezier(.34,1.56,.64,1) pop+scale entrance |
| 2 listening-ring | `src/app/dashboard/ask-aria/page.tsx` — `<span className="an-listening-ring">` overlay around 200×200 orb (~line 1011), only mounted while `!isAriaActive && !sending` (existing listening state — not fabricated) | APPLIED — dual sage rings (1.6s ease-out infinite, 2nd delayed .8s) — vanishes when speaking/thinking |

Reduced-motion: ✅ — `.an-spring-sidebar` falls back to plain `200ms ease`, `.an-modal-spring` disabled, `.an-listening-ring` hidden+disabled.

## Sprint AN-C — feedback elements
Commit: `feat(an-c): feedback animations (toast/slider/dropdown)` (2c6c9b35)

| Spell | Component / file | Result |
|------|-----------------|--------|
| 13 bouncy-toast | `src/components/pos/Toast.tsx` — `<div className="an-bouncy-toast" …>` (line ~24) | APPLIED — `.55s` cubic-bezier(.34,1.56,.64,1) spring pop-in (translateY 28→0 with overshoot). Applies app-wide because `useToast()` / `ToastContainer` route every toast through this component. |
| 9 rubber-slider | revenue-target slider | **SKIPPED** — no revenue-target slider component exists in the codebase (`type="range"` matches found only for text-size / opacity in `app/dashboard/studio/page.tsx` and POS receipts — none are revenue targets). |
| 10 bouncy-dropdown | `src/components/reports/DateRangePicker.tsx` — popup `<div className="an-bouncy-dropdown" …>` (line ~192) | APPLIED — `.35s` spring pop+scale anchored top-left, only when `open` |

Reduced-motion: ✅ both scoped style blocks include the standard reduced-motion override.

## Sprint AN-D — stats & onboarding
Commit: `feat(an-d): stats count-up + review + onboarding animations` (b042e392)

| Spell | Component / file | Result |
|------|-----------------|--------|
| 12 number-counter | New hook `src/lib/anim/use-count-up.ts` (easeOutCubic, 700ms, reduced-motion bypass returns target value instantly). Applied in `src/components/dashboard/ProWidgets.tsx` — `LiveRevenueTicker` revenue display (line ~70) and `ThreeWayRevenue` per-column value (line ~103) | APPLIED — animates on mount AND on update (no `data-alive` pre-existing hook was found, so this is the new shared hook; future callers should reuse `useCountUp(value)` instead of rolling their own). |
| 14 year-review | wrap-up / year-in-review card | **SKIPPED** — no such surface exists (`DailySummaryCard` is daily, not retrospective). |
| 20 keyboard-onboarding | `src/app/onboarding/page.tsx` — `<div key={idx} className="an-kbd-onboarding …">` step card wrapper (line ~148) | APPLIED — `.5s` cubic-bezier(.22,1,.36,1) spring fade-in-up per step (re-fires on `idx` change via React key). |

Reduced-motion: ✅ — `useCountUp` checks `matchMedia('(prefers-reduced-motion: reduce)')` and returns the target value immediately; `.an-kbd-onboarding` disabled under reduce.

## Sprint AN-E — staff surfaces
Commit: `feat(an-e): staff surface animations (swipe/pulse/bottom-sheet)` (c2f28d32)

| Spell | Component / file | Result |
|------|-----------------|--------|
| 15 swipe-dismiss | `src/app/staff/portal/messages/page.tsx` — inbox message row `<div className="an-swipe-dismiss" …>` (line ~273) + scoped style at top of return | APPLIED (animation-only) — `.42s` slide-in-from-right entrance + `transform/opacity 280ms` transition prep + `touchAction: 'pan-y'`. Actual swipe-gesture handler is logic (not animation) and was NOT added per the "ANIMATION ONLY" constraint — follow-up needed to wire pointer-down/up handlers that toggle a `swiped` class. |
| 17 activity-pulse | `src/components/dashboard/ProWidgets.tsx` — `StaffOnShift` widget — `<span className="an-activity-pulse">` sage dot overlay added to each staff avatar (line ~232) | APPLIED — 1.8s ease-in-out infinite box-shadow ring pulse |
| 19 bottom-sheet | `src/app/dashboard/ask-aria/page.tsx` — composer `<div className="an-bottom-sheet" …>` (line ~1496) + media-query-gated keyframe | APPLIED **mobile-only** (`@media (max-width: 767px)`) — `.55s` cubic-bezier(.34,1.56,.64,1) slide-up from translateY(100%) with overshoot. Desktop layout unchanged. |

Reduced-motion: ✅ all three scoped blocks fall back under `prefers-reduced-motion: reduce`.

## Out of scope (per prompt — handle later)
- Reels/landing extras: spell 7 filter-chips (reels), 8 character-entry (landing), 18 printing (receipts/payslips) — apply when those surfaces are in active work.
- CX-flagged spells 5/6/11/16 (pull-refresh · achievements · scratch-reveal · confetti) — stay behind the CX flag, after CX P1–P5 ships.

## Per-sprint build gate
- `npx tsc --noEmit` → 0 errors on every sprint
- `npm run build` → PASS on every sprint
- vercel.json function configs unchanged (still ≤22)
- ONE commit per sprint (5 total: b197a086, 716d3c43, 2c6c9b35, b042e392, c2f28d32)
- Reduced-motion verified: every scoped style block contains an explicit `@media (prefers-reduced-motion: reduce)` override OR (for `useCountUp`) a JS `matchMedia` check that returns the target value immediately.
- Not pushed (per "STOP before push" instruction).

## Files touched
- `src/components/dashboard/Sidebar.tsx`
- `src/components/dashboard/RetailDashboard.tsx`
- `src/components/dashboard/DashboardShell.tsx`
- `src/components/dashboard/ProWidgets.tsx`
- `src/app/dashboard/ask-aria/page.tsx`
- `src/components/pos/Toast.tsx`
- `src/components/reports/DateRangePicker.tsx`
- `src/lib/anim/use-count-up.ts` (NEW — shared count-up hook)
- `src/app/onboarding/page.tsx`
- `src/app/staff/portal/messages/page.tsx`

## Follow-ups
1. **Widget-grid surface** — introduce a draggable dashboard widget grid so spell 22 drag-reorder can land.
2. **Revenue-target slider** — once a revenue-target input is built (likely under goals/settings), wrap it with spell 9 rubber-slider visuals.
3. **Year-in-review card** — when a recap/wrap-up surface exists, apply spell 14.
4. **Swipe-dismiss gesture handler** — wire pointer events on `.an-swipe-dismiss` rows that toggle a `.swiped` class (separate task, not in this animation-only scope).
