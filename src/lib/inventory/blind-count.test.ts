import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// MS7 PHASE 2 — blind counting on the staff app.
//
// Blind counting is standard inventory control: a counter who can see the expected figure is
// confirming it, not verifying it. The staff app broke this in the strongest possible way — it
// PRE-FILLED the count box with the expected quantity, showed "Aria expects: N" beside a live
// variance while the number was being typed, and printed "expect N" in the cycle list before a
// product was even opened. The default action — open the count, press submit — recorded a perfect
// match having counted nothing.
//
// The POS surface (pos/inventory/stocktake/new) has always done it correctly: empty input, system
// figure revealed only in the post-count variance table. This phase brings the staff app to that
// existing pattern rather than inventing one.
//
// Asserted against the source because the property is "this value is not reachable in the DOM
// during entry" — there is no pure function to test, and a jsdom render of a 2,700-line page with
// live Supabase calls would test the mocking, not the control.

const PAGE = readFileSync(join(process.cwd(), 'src', 'app', 'inventory', '[slug]', 'page.tsx'), 'utf8')
const code = PAGE.split('\n')
  .filter(l => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*') && !l.trimStart().startsWith('/*') && !l.trimStart().startsWith('{/*'))
  .join('\n')

describe('the count box starts empty, never on the expected figure', () => {
  it('the task count input is not pre-filled', () => {
    // Was: setCountVal(first.expected ?? 0)
    expect(code).not.toMatch(/setCountVal\(\s*first\.expected/)
    expect(code).toMatch(/if \(first\) setCountVal\(0\)/)
  })

  it('the stocktake count input is not pre-filled', () => {
    // Was: setStCountVal(expected)
    expect(code).not.toMatch(/setStCountVal\(expected\)/)
    expect(code).toMatch(/setStCountVal\(0\)/)
  })
})

describe('the expected figure is not shown during entry', () => {
  it('the "Aria expects" panel is gated behind the count being recorded', () => {
    // The panel still exists and still shows the same three figures — only the moment moved.
    // countMsg is set when the count comes back from the server, so the panel is hidden until then.
    expect(code).toMatch(/visibility:\s*countMsg\s*\?\s*'visible'\s*:\s*'hidden'/)
  })

  it('no live variance chip while the stocktake count is being typed', () => {
    // Was: varChip(stCountVal - stPick.expected, null) rendered beside the input, updating per
    // keystroke — which told the counter the answer as they typed it.
    expect(code).not.toMatch(/varChip\(stCountVal - stPick\.expected/)
  })

  it('the cycle list no longer prints the expected quantity', () => {
    // Was: "expect {c.expected_qty} · Nd since count" on every row of today's list, visible before
    // a product was even selected.
    expect(code).not.toMatch(/expect \{c\.expected_qty\}/)
  })
})

describe('what deliberately stays', () => {
  it('days-since-count stays in the cycle list', () => {
    // It explains WHY an item is on today's list without telling anyone what they should find.
    expect(code).toMatch(/days_since\}d since count/)
    expect(code).toMatch(/never counted/)
  })

  it('the expected figure is still carried in state for the post-submit reveal', () => {
    // Removing it from state would have broken the variance the owner reviews. The control is
    // about when it is DISPLAYED, not about discarding it.
    expect(code).toMatch(/setStPick\(\{ id, name, expected \}\)/)
  })

  it('the recorded-lines list still reveals variance after submit', () => {
    // The POS pattern: count first, reveal after. This is the reveal.
    expect(code).toMatch(/varChip\(l\.variance_qty/)
  })

  it('the POS surface is untouched — it was already correct', () => {
    const pos = readFileSync(
      join(process.cwd(), 'src', 'app', 'pos', 'inventory', 'stocktake', 'new', 'page.tsx'), 'utf8')
    // Empty input on load, and the system figure appears only in the variance review table.
    expect(pos).toMatch(/counted:\s*''/)
  })
})
