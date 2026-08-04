import { nowAEST } from '@/lib/date-au'

// FIX-HYDRATION-1 — the greeting that produced React #418/#423/#425 on /menu/:slug.
//
// THE BUG: MenuClient.tsx:32 computed `new Date().getHours()` inside the render pass, with no
// timezone. Vercel runs UTC; the customer's browser runs Melbourne. The Sentry event was 9:33pm
// AEST = 11:33 UTC, so the server rendered "Good morning" (h=11) and the browser rendered
// "Good evening" (h=21). Same node, different text — #425 exactly. #418 and #423 are the cascade:
// a mismatch outside a Suspense boundary makes React discard the server HTML and re-render the
// whole root on the client.
//
// WHY AN EXPLICIT TIMEZONE ALONE IS NOT THE FIX: it narrows the window but does not close it. A
// server render at 11:59:59 and a hydration at 12:00:01 still disagree, and that failure is rarer,
// which makes it worse — it survives testing and appears in production. The value has to be
// computed ONCE and passed down, so both renders emit the same string by construction.

export type Greeting = 'morning' | 'afternoon' | 'evening'

/**
 * Pure hour -> greeting. Deterministic by definition: no clock, no zone, no I/O.
 * Boundaries chosen to match the original implementation exactly, so this is a move, not a
 * behaviour change: <12 morning, <17 afternoon, else evening.
 */
export function greetingForHour(hour: number): Greeting {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

/**
 * Server-side entry point: resolve the business's local hour, then derive.
 *
 * Call this in a SERVER component and pass the result down as a prop. Do not call it in a client
 * component — that reintroduces the very divergence it exists to remove.
 *
 * `tz` flows through date-au's resolveZone(), which defaults to Melbourne — deliberately the same
 * default as every other date helper, rather than the hardcoded 'Australia/Sydney' that three menu
 * pages had grown independently (see the C2 note in the sprint report).
 */
export function currentGreeting(tz?: string | null): Greeting {
  // .getUTCHours(), NOT .getHours(). nowAEST() returns a Date shifted so its UTC FIELDS read as
  // wall-clock in the target zone (date-au.ts shiftedNow); reading local fields off it applies the
  // machine's offset a second time. Caught by greeting.test.ts on the first run — the guard found a
  // bug in this file before the file had ever shipped.
  return greetingForHour(nowAEST(tz).getUTCHours())
}
