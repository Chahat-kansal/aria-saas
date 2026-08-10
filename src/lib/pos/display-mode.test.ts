import { describe, it, expect } from 'vitest'
import { shouldAdoptMode, isDisplayMode } from '@/lib/pos/display-mode'

// ARIA-DISPLAY-2C — the acceptance case that FAILED in a real browser, reproduced as logic.
//
// The live walk was: display open on classic, owner flips to journey in another window, display
// keeps rendering classic while the order mirror works normally. That combination is the tell —
// the payload path was healthy, and the healthy payload path was what kept overwriting the change.

describe('shouldAdoptMode', () => {
  // ── THE REGRESSION, STATED DIRECTLY ───────────────────────────────────────────────────────────
  it('a payload written BEFORE the flip must not undo it (the DISPLAY-2B bug)', () => {
    const flippedAt = 1_000_000
    // The terminal cached display_mode at mount and keeps re-writing the old value; the display
    // re-reads that same payload every 500ms.
    const stalePayloadTs = flippedAt - 5_000
    expect(shouldAdoptMode('classic', stalePayloadTs, flippedAt)).toBe(false)
  })

  it('...and it must not undo it on the NEXT tick either, or the tick after', () => {
    // The old code re-applied the payload's mode on every interval tick, not just once. Re-reading
    // the identical stale payload must stay refused however many times it is seen.
    const flippedAt = 1_000_000
    const stale = flippedAt - 5_000
    for (let tick = 0; tick < 10; tick++) {
      expect(shouldAdoptMode('classic', stale, flippedAt)).toBe(false)
    }
  })

  it('a payload written AFTER the flip is authoritative — the terminal caught up', () => {
    const flippedAt = 1_000_000
    expect(shouldAdoptMode('journey', flippedAt + 1, flippedAt)).toBe(true)
    // ...including a later flip back to classic from the terminal's own payload.
    expect(shouldAdoptMode('classic', flippedAt + 60_000, flippedAt)).toBe(true)
  })

  it('exactly equal timestamps do not re-adopt — strictly newer wins', () => {
    // Guards against a payload re-applying itself forever when clocks land on the same ms.
    expect(shouldAdoptMode('classic', 1_000_000, 1_000_000)).toBe(false)
  })

  // ── DISPLAY-2B's CORRECT BEHAVIOUR, WHICH THIS FIX MUST NOT BREAK ────────────────────────────
  it('a payload with NO display_mode never changes the mode', () => {
    // POSTopNav writes a bare {status:'idle', timestamp}. Even with a very NEW timestamp it must
    // not reset a journey screen — absent is not "classic".
    expect(shouldAdoptMode(undefined, 9_999_999, 0)).toBe(false)
    expect(shouldAdoptMode(null, 9_999_999, 0)).toBe(false)
    expect(shouldAdoptMode('', 9_999_999, 0)).toBe(false)
  })

  it('a junk mode value is refused rather than rendered', () => {
    expect(shouldAdoptMode('JOURNEY', 9_999_999, 0)).toBe(false)
    expect(shouldAdoptMode('dark', 9_999_999, 0)).toBe(false)
  })

  it('first payload after a cold load is adopted (decidedAt starts at 0)', () => {
    // A display that just booted has decided nothing, so the terminal's payload must win.
    expect(shouldAdoptMode('journey', 1, 0)).toBe(true)
    expect(shouldAdoptMode('classic', 1, 0)).toBe(true)
  })

  it('a payload with no timestamp cannot beat a real decision', () => {
    expect(shouldAdoptMode('classic', undefined, 1_000_000)).toBe(false)
  })
})

describe('isDisplayMode', () => {
  it('accepts only the two CHECK-constrained values', () => {
    // Mirrors pos_settings_display_mode_check: display_mode = ANY (ARRAY['classic','journey']).
    expect(isDisplayMode('classic')).toBe(true)
    expect(isDisplayMode('journey')).toBe(true)
    for (const v of ['Classic', 'journey ', '', null, undefined, 0, {}]) {
      expect(isDisplayMode(v)).toBe(false)
    }
  })
})
