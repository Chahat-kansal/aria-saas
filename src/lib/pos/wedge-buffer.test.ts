import { describe, it, expect } from 'vitest'
import { feedKey, takeCode, emptyWedge, IDLE_RESET_MS, type WedgeState } from '@/lib/pos/wedge-buffer'

// ARIA-ATTACH-CUSTOMER-1 — the regression test for "the first keystroke after an idle gap is
// retained". A wedge scan's first character ALWAYS arrives after a long idle gap; if the gap check
// resets and returns without appending, every scan loses its first character. On a 10-digit
// customer code that is fatal — it stops being ten digits and never reaches the customer branch.

/** Type a whole code at `gapMs` between keys, starting `idleBefore` after the last activity. */
function scan(code: string, opts: { from?: WedgeState; startAt?: number; gapMs?: number } = {}) {
  let s = opts.from ?? emptyWedge()
  let t = opts.startAt ?? 10_000
  for (const ch of code) { s = feedKey(s, ch, t); t += opts.gapMs ?? 30 }
  return { state: s, endedAt: t }
}

describe('feedKey — the first keystroke after an idle gap', () => {
  it('RETAINS the first character of a cold scan', () => {
    // THE REGRESSION. If this fails, every scan is one character short.
    const { state } = scan('2636627747')
    expect(state.buffer).toBe('2636627747')
    expect(state.buffer.length).toBe(10)
  })

  it('retains it even when the previous scan was long ago', () => {
    const first = scan('1111111111').state
    const { state } = scan('2636627747', { from: first, startAt: 999_999 })
    expect(state.buffer).toBe('2636627747')
  })

  it('the reset drops the STALE buffer, not the arriving character', () => {
    // A partial scan abandoned mid-way must not contaminate the next one — and must not eat its
    // first character either. Both halves of that, in one assertion.
    const stale: WedgeState = { buffer: 'ABANDONED', lastKeyAt: 1_000 }
    const s = feedKey(stale, '9', 1_000 + IDLE_RESET_MS + 1)
    expect(s.buffer).toBe('9')
  })

  it('a gap at exactly the threshold does not reset — strictly greater does', () => {
    const base: WedgeState = { buffer: 'AB', lastKeyAt: 1_000 }
    expect(feedKey(base, 'C', 1_000 + IDLE_RESET_MS).buffer).toBe('ABC')      // continues
    expect(feedKey(base, 'C', 1_000 + IDLE_RESET_MS + 1).buffer).toBe('C')    // new scan
  })

  it('a slow human typing the same digits never accumulates a scan', () => {
    // 400ms between keys — every character starts a new "scan" of length 1, so nothing reaches the
    // 4-char floor. This is the rule that stops normal typing being read as a barcode.
    const { state } = scan('2636627747', { gapMs: 400 })
    expect(state.buffer).toBe('7')
    expect(takeCode(state).code).toBeNull()
  })
})

describe('takeCode', () => {
  it('hands back a full scan and clears', () => {
    const { state, endedAt } = scan('2636627747')
    const { code, next } = takeCode(state, endedAt)
    expect(code).toBe('2636627747')
    expect(next).toEqual(emptyWedge())
  })

  it('ignores stray typing below the minimum length', () => {
    expect(takeCode({ buffer: 'ab', lastKeyAt: 1 }, 1).code).toBeNull()
  })

  it('ABANDONS a long-stale buffer instead of firing it as a scan', () => {
    // The job the removed 150ms timer was doing. Half-typed 'ABCDEFG', walk away, come back and
    // press Enter — that must not ring up as a scan. One idle rule now covers both directions.
    const stale: WedgeState = { buffer: 'ABCDEFG', lastKeyAt: 1_000 }
    expect(takeCode(stale, 1_000 + IDLE_RESET_MS + 1).code).toBeNull()
    expect(takeCode(stale, 1_000 + IDLE_RESET_MS).code).toBe('ABCDEFG')   // still fresh
  })

  it('a cleared buffer after Enter does not leak into the next scan', () => {
    const first = takeCode(scan('1111111111').state).next
    const { state } = scan('2636627747', { from: first, startAt: 50_000 })
    expect(state.buffer).toBe('2636627747')
  })
})
