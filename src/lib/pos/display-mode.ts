// ARIA-DISPLAY-2C — the rule that decides whether an incoming customer-display payload is allowed
// to change the backdrop mode.
//
// THE BUG THIS EXISTS TO PIN: DISPLAY-2B put this decision inline in a 500ms setInterval and forgot
// to guard it by timestamp, while the line directly above it (setState) WAS guarded. So the poll
// re-applied the payload's mode twice a second, forever. When the owner flipped the setting, the
// display did receive the change over BroadcastChannel — and then the terminal's stale cached
// payload overwrote it within half a second, every time. The live walk saw "setting flipped,
// display still classic, order mirror working normally", which is exactly this signature: the
// payload path was healthy, and that was the problem.
//
// Extracted because a rule that only exists inside a timer cannot be tested, and this one has
// already shipped wrong once.

export type DisplayMode = 'classic' | 'journey';

export function isDisplayMode(v: unknown): v is DisplayMode {
  return v === 'classic' || v === 'journey';
}

/**
 * Should a payload's mode replace the mode currently on screen?
 *
 * @param payloadMode  the payload's display_mode, possibly absent
 * @param payloadTs    the payload's `timestamp` (Date.now() at write, same machine)
 * @param decidedAt    when the current mode was decided (Date.now() ms), 0 if never
 *
 * Two independent reasons to refuse, and both have bitten:
 *  1. NO MODE IN THE PAYLOAD — POSTopNav writes a bare {status:'idle'} with no display_mode.
 *     Treating absent as 'classic' snaps a journey screen back to the canvas every time the nav
 *     resets it.
 *  2. THE PAYLOAD IS OLDER THAN THE CURRENT DECISION — a stale echo, written before the owner
 *     flipped the setting. This is the DISPLAY-2C bug.
 */
export function shouldAdoptMode(
  payloadMode: unknown,
  payloadTs: number | undefined,
  decidedAt: number,
): boolean {
  if (!isDisplayMode(payloadMode)) return false;
  return (payloadTs ?? 0) > decidedAt;
}
