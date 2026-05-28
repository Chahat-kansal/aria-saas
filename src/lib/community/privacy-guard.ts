/**
 * Privacy guard for marketplace + business chat.
 *
 * Goals
 * -----
 * Block messages that try to share personal details — phone numbers, emails,
 * physical addresses, card numbers, even when spelled out or split apart.
 *
 * Tricky inputs the filter is designed to catch:
 *   - Spelled-out phone numbers — "call me on oh four one two three four five six seven eight nine"
 *   - Obfuscated emails — "name at gmail dot com", "name [at] gmail [dot] com"
 *   - Split digits — "0 4 1 2  3 4 5 6 7 8 9", "0412-345-678", "0412.345.678"
 *   - Addresses in casual phrasing — "I live at 12 smith street richmond"
 *   - Card-like 13-19 digit sequences regardless of separators
 *
 * Strategy
 * --------
 * The filter applies *layered* normalisation before regex matching:
 *   1. Lowercase + Unicode-normalise (NFKD)
 *   2. Replace number-word tokens ("zero|oh|one|two…|nine") with digits
 *   3. Replace " at " / " (at) " / " [at] " with "@", " dot " with "."
 *   4. Collapse separator runs that look like number splits
 *   5. Run regex patterns against the normalised text
 *
 * Optional LLM second-pass (Haiku) catches addresses + full names that the regex
 * misses. The LLM is only invoked when the regex layer doesn't already block,
 * to keep latency + cost negligible on the majority of safe messages.
 */

// ── Spelled-out digit map ────────────────────────────────────────────
const WORD_DIGITS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', nought: '0', nil: '0', niner: '9',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  // Common AU/NZ "double" / "triple" prefix — e.g. "double four" = 44
  // Handled separately in normaliseSpelledDigits
}

// ── Email-obfuscation tokens ─────────────────────────────────────────
// Order matters: longer patterns first so " (at) " doesn't get partially
// consumed by " at ".
const EMAIL_AT_TOKENS = [
  /\s*\(\s*at\s*\)\s*/gi,
  /\s*\[\s*at\s*\]\s*/gi,
  /\s+at\s+/gi,
  /\s+@\s+/g,
]
const EMAIL_DOT_TOKENS = [
  /\s*\(\s*dot\s*\)\s*/gi,
  /\s*\[\s*dot\s*\]\s*/gi,
  /\s+dot\s+/gi,
]

/**
 * Replace spelled-out single digits and "double/triple X" with numerals.
 * "oh four one two" → "0 4 1 2"
 * "double zero seven" → "0 0 7"
 */
function normaliseSpelledDigits(text: string): string {
  // First, expand "double N" and "triple N" to repeated tokens
  let t = text.replace(/\b(double|triple)\s+([a-z]+)/gi, (_m, qty: string, word: string) => {
    const w = word.toLowerCase()
    if (!(w in WORD_DIGITS)) return _m
    const n = qty.toLowerCase() === 'double' ? 2 : 3
    return (WORD_DIGITS[w] + ' ').repeat(n).trim()
  })

  // Replace standalone digit words (only at word boundaries) with the digit.
  // We're careful: "o" alone is ambiguous, only treat it as 0 inside a sequence
  // of digit-words (e.g. "o four one two" → "0 4 1 2").
  // First pass: replace all unambiguous digit words.
  t = t.replace(/\b(zero|oh|nought|nil|niner|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi, (m: string) => {
    const w = m.toLowerCase()
    return WORD_DIGITS[w] ?? m
  })

  // Second pass: "o" is replaced with "0" only when adjacent to a digit or
  // another such "o". Conservative — single bare "o" stays text.
  // Pattern: \bo\b surrounded by digit-context within +/- 2 chars
  t = t.replace(/(\d[\s.-]*)o\b/gi, '$10')
  t = t.replace(/\bo(\s*[\s.-]*\d)/gi, '0$1')

  return t
}

/**
 * Replace email obfuscation tokens with literal @ and .
 * "name at gmail dot com" → "name@gmail.com"
 */
function normaliseEmailTokens(text: string): string {
  let t = text
  for (const re of EMAIL_AT_TOKENS) t = t.replace(re, '@')
  for (const re of EMAIL_DOT_TOKENS) t = t.replace(re, '.')
  return t
}

/**
 * Collapse separator runs between digit blocks so that "0412 345 678" and
 * "0412.345.678" and "0412-345-678" all become "0412345678" for matching.
 * We preserve the original text — the normalised version is used only for
 * detection.
 */
function collapseDigitSeparators(text: string): string {
  // Replace runs of [spaces|hyphens|dots|parens|underscores] BETWEEN two digits
  // with nothing. Iterate because each replacement can create new adjacencies.
  let prev = ''
  let cur = text
  let safety = 0
  while (prev !== cur && safety < 6) {
    prev = cur
    cur = cur.replace(/(\d)[ \t.\-_()]+(\d)/g, '$1$2')
    safety++
  }
  return cur
}

/**
 * Apply all normalisation layers and return the normalised string.
 * Visible for testing.
 */
export function normaliseForGuard(text: string): string {
  const lower = text.toLowerCase().normalize('NFKD')
  const a = normaliseSpelledDigits(lower)
  const b = normaliseEmailTokens(a)
  const c = collapseDigitSeparators(b)
  return c
}

// ── Detection regexes (run AGAINST the normalised string) ────────────

// AU mobile (04xxxxxxxx), AU landline ((0X)XXXX XXXX), or +61 forms.
// We don't anchor — the normaliser already stripped separators, so a 10-digit
// or 11-digit run is enough.
const AU_PHONE_RE     = /(?:\+?61|0)\d{8,10}/

// Any sequence of 9+ digits — catches international numbers and broken splits
// that weren't AU-formatted.
const GENERIC_LONG_DIGIT_RE = /\d{9,}/

// Standard email regex (post-normalisation; "at"/"dot" already became @/.)
const EMAIL_RE        = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/

// Card-like 13-19 digit sequences (Luhn check is overkill for chat).
const CARD_RE         = /\b\d{13,19}\b/

// Simple AU address regex — "<number> <words> <street/road/ave/lane/etc>"
const AU_ADDRESS_RE   = /\b\d{1,5}\s+[a-z]+(?:\s+[a-z]+)?\s+(?:street|st|road|rd|avenue|ave|lane|ln|drive|dr|court|ct|place|pl|crescent|cres|highway|hwy|parade|pde|terrace|tce|boulevard|blvd|circuit|cct|close|cl)\b/i

// Postcode after a state token — common AU "Richmond VIC 3121" pattern.
const AU_STATE_POSTCODE_RE = /\b(?:nsw|vic|qld|sa|wa|tas|act|nt)\s+\d{4}\b/i

export interface GuardResult {
  blocked: boolean
  reason?: string
  /** Optional debug — which rule fired (not shown to users). */
  rule?: string
}

const FRIENDLY_REASON = 'To keep you safe, personal details can\'t be shared in chat. Arrange the rest in person at the shop.'

/**
 * Synchronous regex-based check. Returns { blocked: true, reason } on first hit.
 * This is the only guard you need for the hot path — Haiku is an optional add-on.
 */
export function checkPrivacyRegex(text: string): GuardResult {
  if (!text) return { blocked: false }
  const n = normaliseForGuard(text)

  if (AU_PHONE_RE.test(n))           return { blocked: true, reason: FRIENDLY_REASON, rule: 'au_phone' }
  if (GENERIC_LONG_DIGIT_RE.test(n)) return { blocked: true, reason: FRIENDLY_REASON, rule: 'long_digits' }
  if (EMAIL_RE.test(n))              return { blocked: true, reason: FRIENDLY_REASON, rule: 'email' }
  if (CARD_RE.test(n))               return { blocked: true, reason: FRIENDLY_REASON, rule: 'card' }
  if (AU_ADDRESS_RE.test(n))         return { blocked: true, reason: FRIENDLY_REASON, rule: 'au_address' }
  if (AU_STATE_POSTCODE_RE.test(n))  return { blocked: true, reason: FRIENDLY_REASON, rule: 'state_postcode' }

  return { blocked: false }
}

/**
 * Optional second-pass LLM check for addresses + full names that the regex
 * layer doesn't catch (e.g. "my house is the third one on cherry street").
 * Falls back to "not blocked" on any failure — never crashes the chat.
 */
export async function checkPrivacyLLM(text: string): Promise<GuardResult> {
  if (!process.env.ANTHROPIC_API_KEY) return { blocked: false }
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 60,
      system: 'You spot personal details in a short chat message between a customer and an Australian small business. Block ONLY if the message contains: a residential address (street + number, even worded casually), a full personal name shared as contact info (not just a first-name greeting), or any other obvious PII not already covered by phone/email/card regex. Reply with ONLY one JSON object: {"block": true|false, "reason": "<short reason>"}. Default to {"block": false}.',
      messages: [{ role: 'user', content: text.slice(0, 600) }],
    })
    const out = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) return { blocked: false }
    const parsed = JSON.parse(m[0]) as { block?: boolean; reason?: string }
    if (parsed.block === true) return { blocked: true, reason: FRIENDLY_REASON, rule: 'llm:' + (parsed.reason ?? 'pii') }
    return { blocked: false }
  } catch {
    return { blocked: false }
  }
}

/**
 * Convenience: regex-first, then LLM second-pass if no block.
 */
export async function checkPrivacyFull(text: string): Promise<GuardResult> {
  const r = checkPrivacyRegex(text)
  if (r.blocked) return r
  return checkPrivacyLLM(text)
}
