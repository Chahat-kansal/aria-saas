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
 * Clean a model's title into something safe to store.
 *
 * Models wrap titles in quotes, prefix them with "Title:", and add full stops. All of that has to
 * go, and the result must never be empty — an empty title is worse than a crude one.
 */
export function sanitiseTitle(raw: string | null | undefined, fallback: string): string {
  let t = String(raw ?? '')
    .split('\n')[0]!                       // a title is one line
    .replace(/^\s*title\s*:\s*/i, '')      // "Title: ..."
    .replace(/^["'`\u201C\u2018]+|["'`\u201D\u2019]+$/g, '')  // surrounding quotes
    .replace(/[.\u2026]+$/, '')            // trailing full stop / ellipsis
    .replace(/\s+/g, ' ')
    .trim()

  if (t.length > MAX_TITLE) t = t.slice(0, MAX_TITLE).replace(/\s+\S*$/, '').trim()
  if (!t) return fallbackTitle(fallback)
  return t
}

/** The crude-but-honest title used when generation is unavailable: the question, truncated. */
export function fallbackTitle(question: string): string {
  const q = String(question ?? '').replace(/\s+/g, ' ').trim()
  if (!q) return 'New conversation'
  return q.length > MAX_TITLE ? q.slice(0, MAX_TITLE).replace(/\s+\S*$/, '').trim() + '…' : q
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
