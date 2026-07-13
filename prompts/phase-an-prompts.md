# PHASE-AN A–E — apply the 22 Design Spells to surfaces
> SPELLS-1 already shipped the library (`f5de94c3`, src spells lib + /docs/spells). These 5 prompts APPLY it.
> ANIMATION ONLY — change NO logic, NO layout, NO data, NO copy. Additive. Respect prefers-reduced-motion.
> Standing rules from RUN-QUEUE.md header apply (RULE 0, build gate tsc+build, ONE commit, STOP before push).
> CX-flagged spells (5 pull-refresh · 6 achievements · 11 scratch-reveal · 16 confetti) stay BEHIND a flag — do NOT apply until CX ships.

## Shared pre-flight (every AN prompt)
1. pwd = C:\Users\kansa\aria-saas-audit
2. Confirm the shipped spell library: locate the SPELLS-1 file (src/lib/spells or src/lib/anim) + read its exports. Quote the available spell names.
3. grep/find the target components named in the sprint. If a target component isn't found → SKIP that one spell, log it, continue (don't invent a component).
4. Confirm a prefers-reduced-motion guard exists (or add one wrapper) so every spell no-ops under reduced motion.

═══════════════════════════════════════════════════════════
# AN-A — dashboard navigation
Apply: spell 1 icon-micro · spell 21 ripple · spell 22 drag-reorder.
- Target: dashboard nav/sidebar items, dashboard tiles, dashboard widget grid.
- 1 icon-micro → nav icons on hover/active. 21 ripple → tile press. 22 drag-reorder → dashboard widgets (visual reorder only; if persistence isn't already wired, animate but do NOT add new persistence — log that as a follow-up).
- DO NOT touch protected files (AnimatedBg/FlyToCart/CursorGlow). No layout shift.
Commit: `feat(an-a): dash nav micro-interactions (icon/ripple/drag-reorder)`

# AN-B — Ask Aria + sidebar
Apply: spell 4 spring-sidebar · spell 3 modal-spring · spell 2 listening-ring.
- Target: dashboard sidebar open/close, Ask-Aria modal/panel, the orb/voice listening state.
- 2 listening-ring → only on the existing listening state (do not fabricate a new state).
Commit: `feat(an-b): ask-aria + sidebar spring/listening animations`

# AN-C — feedback elements
Apply: spell 13 bouncy-toast · spell 9 rubber-slider · spell 10 bouncy-dropdown.
- Target: all toast/confirmation surfaces, the revenue-target slider, time/date picker dropdowns.
- 13 → every confirmation toast app-wide. 9 → revenue target input. 10 → existing dropdown/time pickers.
Commit: `feat(an-c): feedback animations (toast/slider/dropdown)`

# AN-D — stats & onboarding
Apply: spell 12 number-counter · spell 14 year-review · spell 20 keyboard-onboarding.
- Target: stat/KPI numbers (count-up on change/mount), any wrap-up/review card, desktop onboarding flow.
- 12 → KPI numbers (mount + on-update). Pair with the data-alive count-up already used on the dashboard if present (reuse, don't duplicate).
Commit: `feat(an-d): stats count-up + review + onboarding animations`

# AN-E — staff surfaces
Apply: spell 15 swipe-dismiss · spell 17 activity-pulse · spell 19 bottom-sheet.
- Target: staff inbox items (swipe to dismiss), staff/team activity indicators (pulse), Ask-Aria mobile (bottom sheet).
- 15 → staff inbox rows. 17 → team activity. 19 → mobile Ask-Aria only.
Commit: `feat(an-e): staff surface animations (swipe/pulse/bottom-sheet)`

═══════════════════════════════════════════════════════════
## NOT in A–E (handle later, not now)
- Reels/landing extras: spell 7 filter-chips (reels), 8 character-entry (landing), 18 printing (receipts/payslips) — apply when those surfaces are in active work.
- CX-flagged: 5, 6, 11, 16 — build behind the CX flag, after CX P1–P5 ships.

## Per-prompt build gate
tsc --noEmit → 0 · npm run build → PASS · reduced-motion verified · ≤22 fn configs unchanged · ONE commit · STOP before push.
Report: which spells applied to which components, which were SKIPPED (component not found), reduced-motion confirmation.
