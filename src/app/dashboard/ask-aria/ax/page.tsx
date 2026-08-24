'use client'
import '@/styles/ask-aria-transition.css'
import AskAriaTransition from '@/components/ask-aria-ax/AskAriaTransition'

/**
 * MS16 · AX-1 — Ask Aria: welcome → working, on the locked design, with real data.
 *
 * THE STYLESHEET IS IMPORTED HERE AND NOWHERE ELSE. It carries `*`, `body` and `:root` rules lifted
 * byte-for-byte from the contract, so it must not reach any other route. Importing it in a layout
 * would put `body{overflow:hidden;height:100vh}` and a different `--violet` on every page under it.
 *
 * WHY THIS SITS AT /dashboard/ask-aria/ax RATHER THAN REPLACING /dashboard/ask-aria: the swap
 * retires a 1,646-line surface carrying deliverables, artifacts, the skill picker, voice input,
 * audit-log cards, action preview/fork cards and file upload. RULE 0 forbids losing any of it, and
 * this environment cannot render a page to prove none was lost. Parked for the founder's eyes —
 * see docs/aria/RUN-MS16.md.
 */
export default function AskAriaAxPage() {
  return <AskAriaTransition />
}
