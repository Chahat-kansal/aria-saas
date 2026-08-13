// ARIA-ATTACH-CUSTOMER-1 — the keyboard-wedge scan buffer, extracted so its timing rules can be
// tested instead of argued about.
//
// A wedge scanner types a barcode as fast keystrokes then presses Enter. The buffer has to tell
// "a scan" apart from "a person touching the keyboard", using only inter-key timing. Two rules do
// that, and both have an edge case that is invisible until it eats a character:
//   · a gap larger than IDLE_RESET_MS starts a NEW scan
//   · IDLE_RESET_MS of silence abandons a partial scan
//
// THE CASE THAT MATTERS: the FIRST keystroke of any scan always arrives after a long idle gap —
// that is what "first" means. If the gap check resets the buffer and returns without appending,
// every scan silently loses its first character. It would be near-invisible on product scanning
// (a 13-digit EAN missing a digit just misses the catalogue) and fatal for a 10-digit customer
// code, which stops being 10 digits and never reaches the customer branch at all.

export const IDLE_RESET_MS = 100

export interface WedgeState {
  /** Characters collected so far for the in-progress scan. */
  buffer: string
  /** Timestamp of the last accepted character, 0 when nothing is in progress. */
  lastKeyAt: number
}

export function emptyWedge(): WedgeState {
  return { buffer: '', lastKeyAt: 0 }
}

/**
 * Feed one printable character. Returns the NEW state — never mutates.
 *
 * The order is the whole thing: reset FIRST, then append. The current character belongs to the new
 * scan, not the abandoned one, so it must survive the reset that its own arrival triggered.
 */
export function feedKey(state: WedgeState, key: string, now: number): WedgeState {
  const idle = now - state.lastKeyAt > IDLE_RESET_MS
  const base = idle ? '' : state.buffer
  return { buffer: base + key, lastKeyAt: now }
}

/**
 * Enter pressed: hand back the code and clear. Codes shorter than `minLength` are stray typing.
 *
 * `now` applies the SAME idle rule as feedKey. The inline version this replaces used a separate
 * 150ms setTimeout to abandon a stale buffer — a second mechanism, with a different constant, doing
 * the same job as the 100ms gap check. Two idle rules that disagree is how a buffer ends up in a
 * state neither of them predicts; the window between 100ms and 150ms belonged to both and to
 * neither. One rule, one constant, and no timer to fire after the component unmounts.
 */
export function takeCode(
  state: WedgeState,
  now: number = Number.POSITIVE_INFINITY,
  minLength = 4,
): { code: string | null; next: WedgeState } {
  const stale = now - state.lastKeyAt > IDLE_RESET_MS
  const code = stale ? '' : state.buffer.trim()
  return { code: code.length >= minLength ? code : null, next: emptyWedge() }
}
