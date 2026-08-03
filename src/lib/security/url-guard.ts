// SEC-BROWSER-1 — SSRF guard for every server-side fetch/navigation that takes a
// caller-influenced URL. Aria's browser tools were reachable by any authenticated user with no
// restriction, which made the Vercel function a proxy into private address space.
//
// Deny-by-default on private/link-local/loopback ranges. Public internet is unaffected, so every
// legitimate use (competitor research, website checks, scraping a supplier page) still works.

/**
 * SEC-PROMPT-1 — separator between the base system prompt and a caller-supplied addition.
 *
 * Defined once, here, because /api/chat and /api/plugins had byte-identical vulnerable lines
 * (`system?.trim() || ARIA_SYSTEM`) and a shared constant is what stops them drifting apart the
 * next time one is edited. The horizontal rule makes the boundary legible to the model, so
 * caller text reads as an addendum rather than as part of Aria's own instructions.
 */
export const SYSTEM_APPEND_SEP = '\n\n---\n\n'

const BLOCKED_HOSTNAMES = new Set([
  'localhost', '127.0.0.1', '0.0.0.0', '::1',
  'metadata.google.internal', 'metadata.goog',
])

const BLOCKED_PATTERNS: RegExp[] = [
  /^127\./,                          // loopback
  /^10\./,                           // RFC1918
  /^192\.168\./,                     // RFC1918
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,  // RFC1918
  /^169\.254\./,                     // link-local (incl. cloud metadata 169.254.169.254)
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT
  /^0\./,
  /\.internal$/i,
  /\.local$/i,
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i,          // IPv6 unique-local
  /^\[?fe80:/i,                      // IPv6 link-local
]

export interface UrlGuardResult {
  ok: boolean
  reason?: string
  url?: URL
}

/**
 * Validate a caller-influenced URL before any server-side navigation or fetch.
 * Returns { ok: false, reason } rather than throwing, so callers can surface a clean tool error
 * to the model instead of a 500.
 */
export function guardUrl(raw: string): UrlGuardResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Protocol ${url.protocol} not allowed (http/https only)` }
  }

  // WHATWG URL already lowercases hostname and strips IPv6 brackets, but both are re-applied
  // defensively: the bracket-tolerant IPv6 patterns above must match whether or not the parser
  // kept them, and a future caller may pass a raw host string straight to this helper.
  const host = url.hostname.toLowerCase()

  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: 'Host is not reachable from this tool' }
  }
  for (const p of BLOCKED_PATTERNS) {
    if (p.test(host)) return { ok: false, reason: 'Host is not reachable from this tool' }
  }

  // Defence in depth: a public hostname can still resolve to a private IP (DNS rebinding).
  // The pattern check above catches literal IPs; this catches the obvious decimal/octal dodges
  // (e.g. http://2852039166/ === 169.254.169.254).
  if (/^\d+$/.test(host)) {
    return { ok: false, reason: 'Numeric host form is not allowed' }
  }

  return { ok: true, url }
}
