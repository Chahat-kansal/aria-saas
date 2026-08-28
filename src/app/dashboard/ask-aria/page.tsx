'use client'
import '@/styles/ask-aria-transition.css'
import AskAriaTransition from '@/components/ask-aria-ax/AskAriaTransition'

/**
 * S5 PHASE 5 — THE SWAP.
 *
 * `/dashboard/ask-aria` now serves the built surface. Every navigation entry point in the product
 * already pointed here — AriaFloatingPanel, AriaCommandBar, RetailDashboard, MorningCommandCentre,
 * DailyBriefingModal, AriaSays, ProWidgets, SpotlightTour, ComingSoonPage — and none pointed at
 * `/ax`, which is why four sprints of work never reached the owner. `/ax` was never broken (13
 * serverless renders, 13x 200 over 7 days); nothing simply routed anyone to it.
 *
 * WHAT THIS BRINGS TO THE OWNER FOR THE FIRST TIME: the stall watchdog, classified errors with a
 * Retry button, provenance tiers with click-to-source, regenerate/edit, rename, pin, thread search,
 * draft persistence, and the Awaiting/Made-for-you rooms.
 *
 * ── THE OLD SURFACE IS NOT DELETED. IT MOVED TO /dashboard/ask-aria/classic ──────────────────────
 * S5 phase 4 migrated 1 of the 6 capabilities that existed only on it (`?q=` auto-send) and PARKED
 * the other 5, so the decision table's rule applies: a parked capability means no retirement.
 * Still only on `classic`:
 *
 *   · approve/reject a proposed action  — parked as money/authorisation, not on difficulty
 *   · artifact rendering (AriaArtifact)
 *   · save an artifact to Files          — writes aria_task_outputs (26 real rows)
 *   · artifact parse-failure reporting
 *   · scheduled reports                  — aria_scheduled_reports has 1 real row
 *
 * Reaching them is a URL away, and the run log says so. Retiring `classic` is a separate decision
 * that belongs after those five are migrated and exercised — deliberately NOT in this commit, so a
 * revert is one line.
 *
 * The stylesheet import stays page-scoped, never in a layout: it carries `*`, `body` and `:root`
 * rules from the design contract and would otherwise reach every route beneath it.
 */
export default function AskAriaPage() {
  return <AskAriaTransition />
}
