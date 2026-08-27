/**
 * S1 PHASE 6 — AUTOMATIC THREAD TITLES.
 *
 * A thread list where every row says "how did last week go and should I reo…" is unusable. A short
 * real title is what makes history navigable.
 *
 * ── TWO RULES, BOTH ENFORCED BY STRUCTURE RATHER THAN BY A FLAG ────────────────────────────────
 *
 * 1. ONE CALL PER THREAD, EVER. Titling on every message would multiply the chat's cost by the
 *    length of the conversation for no benefit — the title stops being useful after the first
 *    exchange anyway, because that is what the thread is about.
 *
 * 2. AN OWNER-EDITED TITLE IS NEVER OVERWRITTEN.
 *
 * Both fall out of one decision: the title is written EXACTLY ONCE, when the conversation row is
 * created, and never updated again. There is no `title_edited` column and none is needed — code
 * that never issues a title UPDATE cannot clobber a rename. That is a stronger guarantee than a
 * flag, which can be forgotten.
 */

/** Hard ceiling. A thread row is narrow; anything longer is truncated by CSS anyway. */
export const MAX_TITLE = 48

/**
 * The prompt. Deliberately tiny: it wants a label, not a summary, and it is run on the cheapest
 * model available. The answer is included because the question alone is often ambiguous
 * ("and oat milk?").
 */
export function buildTitlePrompt(question: string, answer: string): string {
  return [
    'Write a short title for this conversation between a cafe owner and their business assistant.',
    '',
    'Rules:',
    '- 2 to 6 words. Never a full sentence.',
    '- Plain words. No quotes, no emoji, no trailing punctuation.',
    '- Describe the SUBJECT, not the action. "Last week\'s takings", not "Answering a question".',
    '- If it is small talk, say so plainly, e.g. "Greeting".',
    '',
    'Question: ' + String(question ?? '').slice(0, 400),
    'Answer: ' + String(answer ?? '').slice(0, 600),
    '',
    'Title:',
  ].join('\n')
}

/**
 * S3 PHASE 2 — A RAW MODEL RESPONSE MUST NEVER REACH THE TITLE COLUMN.
 *
 * Two live rows proved this was not theoretical:
 *
 *   { "title": "Revenue Shortfall Analysis",     <- stored verbatim, as the thread's name
 *   {"title":"POS Payment Sync
 *
 * And the old cleaner did WORSE than pass them through. Probed against the shipped code before
 * changing it, which is the only reason all three cases are covered rather than the obvious one:
 *
 *   pretty JSON   ->  "{"        the first line was just a brace
 *   compact JSON  ->  the entire JSON string
 *   fenced JSON   ->  "json"     the fence's language tag became the title
 *
 * A model asked for a plain string sometimes answers with an object. That is not an error to paper
 * over with another regex — it is a shape to PARSE, with a safe fallback when parsing fails.
 */
function unwrapCodeFence(s: string): string {
  const m = s.match(/^\s*```[a-zA-Z]*\s*\n?([\s\S]*?)\n?\s*```\s*$/)
  return m ? m[1]! : s
}

/**
 * Pull a title out of a model response that turned out to be JSON.
 *
 * Returns null when there is nothing trustworthy to take — the caller then falls back to the
 * owner's own question, which is always honest. It never returns a fragment of the JSON.
 */
export function extractTitleFromJson(raw: string): string | null {
  const body = unwrapCodeFence(String(raw ?? '')).trim()
  if (!body.startsWith('{') && !body.startsWith('[')) return null

  const tryParse = (text: string): unknown => { try { return JSON.parse(text) } catch { return undefined } }

  // A truncated object (the model hit its token cap mid-answer) is the common real case, so a
  // failed parse is retried with the dangling tail closed off rather than given up on.
  let parsed = tryParse(body)
  if (parsed === undefined) {
    const lastComma = body.lastIndexOf(',')
    if (lastComma > 0) parsed = tryParse(body.slice(0, lastComma) + '}')
  }
  if (parsed === undefined) {
    // Last resort: read the first "title": "..." pair. Still a parse of the SHAPE, not a substring
    // of the blob — anything that is not a quoted string value is refused.
    const m = body.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    if (!m) return null
    const v = m[1]!.replace(/\\"/g, '"').trim()
    return v || null
  }

  const obj = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | undefined
  if (!obj || typeof obj !== 'object') return null
  for (const key of ['title', 'name', 'label', 'subject']) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

/** Anything still carrying JSON punctuation is a leaked response, not a title. */
export function looksLikeLeakedJson(t: string): boolean {
  return /[{}]/.test(t) || /^\s*"?\w+"?\s*:/.test(t) || /^(json|javascript|ts|typescript)$/i.test(t)
}

/**
 * Clean a model's title into something safe to store.
 *
 * Models wrap titles in quotes, prefix them with "Title:", and add full stops. All of that has to
 * go, and the result must never be empty — an empty title is worse than a crude one.
 */
export function sanitiseTitle(raw: string | null | undefined, fallback: string): string {
  const source = String(raw ?? '')

  // PARSE FIRST. Splitting a JSON object on its first newline is what produced "{".
  const fromJson = extractTitleFromJson(source)
  const base = fromJson ?? unwrapCodeFence(source)

  let t = base
    .split('\n')[0]!                       // a title is one line
    .replace(/^\s*title\s*:\s*/i, '')      // "Title: ..."
    .replace(/^["'`“‘]+|["'`”’]+$/g, '')  // surrounding quotes
    .replace(/[.…]+$/, '')            // trailing full stop / ellipsis
    .replace(/\s+/g, ' ')
    .trim()

  // FAIL CLOSED. If the model's shape defeated both the parser and the cleaner, the owner's own
  // question is a better title than a leaked fragment of a response they never saw.
  if (looksLikeLeakedJson(t)) return fallbackTitle(fallback)

  if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE).replace(/\s+\S*$/, '').trim()
  if (!t) return fallbackTitle(fallback)
  return t
}

/**
 * S3 PHASE 2 — THE SECOND FAILURE: A TITLE MUST TELL ONE THREAD FROM ANOTHER.
 *
 * Six live threads were titled "Tell me about ..." and four were indistinguishable in the list. A
 * title that six rows share is a working feature that is useless — the owner still has to open each
 * one to find out which is which, which is the exact job the title exists to save them.
 *
 * The cause is not the truncation, it is WHERE the truncation lands. These questions come from the
 * Awaiting room's one-click launcher, so they all begin with the same stock opener and the subject
 * — the only part that differs — is pushed past the cut. Stripping the opener puts the subject
 * first, using the owner's OWN WORDS and inventing nothing:
 *
 *   before  Tell me about "Briefing pipeline stalled - only...   (identical across three threads)
 *   after   Briefing pipeline stalled - only 0 rows written...   (distinct)
 *
 * Quotes wrapping the whole subject are dropped for the same reason: they cost four characters of
 * a 48-character budget and carry no information.
 */
const STOCK_OPENERS = [
  /^tell me (more )?about\s+/i,
  /^can you tell me (more )?about\s+/i,
  /^what (can you )?tell me about\s+/i,
  /^(so )?what about\s+/i,
  /^(please )?explain\s+/i,
  /^i want to know about\s+/i,
]

/** Strips a stock opener and wrapping quotes so the SUBJECT leads. Never returns empty. */
export function subjectOf(question: string): string {
  let q = String(question ?? '').replace(/\s+/g, ' ').trim()
  for (const re of STOCK_OPENERS) {
    const stripped = q.replace(re, '')
    // Only accept the strip if something survives it — "Tell me about" alone stays as it is.
    if (stripped !== q && stripped.trim()) { q = stripped.trim(); break }
  }
  // Drop quotes only when they wrap the WHOLE subject; an internal quote is meaningful.
  const wrapped = q.match(/^["'`“‘](.+)["'`”’]$/)
  if (wrapped && wrapped[1]!.trim()) q = wrapped[1]!.trim()
  return q
}

/** The crude-but-honest title used when generation is unavailable: the question, truncated. */
/**
 * S3 PHASE 6 — a truncation must never leave a quote hanging open.
 *
 * The conversation header showed `Tell me about "Revenue below weekly target` — a raw 42-character
 * slice that cut the closing quote off. An unbalanced quote reads as a rendering fault, and the
 * same cut can happen to any truncated title, so the trim lives with the truncation rather than
 * beside the one caller that noticed.
 */
export function closeDanglingQuote(t: string): string {
  let out = t
  for (const q of ['"', '“', '‘', "'"]) {
    // an odd count means one was opened and never closed by the cut
    const count = out.split(q).length - 1
    if (count % 2 === 1) out = out.replace(new RegExp(q + '(?=[^' + q + ']*$)'), '').trimEnd()
  }
  return out
}

export function fallbackTitle(question: string): string {
  const q = subjectOf(question)
  if (!q) return 'New conversation'
  if (q.length <= MAX_TITLE) return q
  const cut = q.slice(0, MAX_TITLE).replace(/\s+\S*$/, '').trim()
  return closeDanglingQuote(cut) + '…'
}

/**
 * Should a title be generated for this write?
 *
 * ONLY when the conversation row is being created. An existing thread is never re-titled, which is
 * what makes a rename permanent and keeps the cost at one call per thread.
 */
export function shouldGenerateTitle(input: {
  isNewConversation: boolean
  question: string
}): boolean {
  return input.isNewConversation && String(input.question ?? '').trim().length > 0
}
