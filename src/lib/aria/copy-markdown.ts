/**
 * S1 PHASE 4 — COPY AN ANSWER AS MARKDOWN.
 *
 * The distinction the phase turns on: an assistant message must be copied as the RAW MARKDOWN the
 * model produced, not as the rendered DOM's text.
 *
 * Copying `innerText` is the easy version and it destroys exactly what makes the copy useful:
 * a table becomes a run of words with the columns gone, `**bold**` loses its emphasis, a code block
 * loses its fence, and headings become indistinguishable from body text. The owner pasting into an
 * email, a supplier message or a doc gets mush. Markdown pastes as markdown and still reads fine as
 * plain text — it is strictly better in both destinations.
 */

/** Sentinels the model emits for the UI's benefit; they are not part of the answer. */
const SENTINELS = [
  /\s*\[DELIVERABLE:[^\]]+\]\s*/g,
  /\s*<json_blocks>[\s\S]*?<\/json_blocks>\s*/g,
]

/**
 * The exact text that goes on the clipboard: the model's markdown, minus UI-only sentinels,
 * with trailing whitespace trimmed. Structure is preserved — fences, pipes, hashes and all.
 */
export function toClipboardMarkdown(raw: string | null | undefined): string {
  let out = String(raw ?? '')
  for (const re of SENTINELS) out = out.replace(re, '\n')
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Does this text still carry its markdown structure?
 *
 * Used by the test to prove the copy round-trips rather than arriving flattened: if a source had a
 * table, a fence or emphasis, the copy must still have it.
 */
export function hasMarkdownStructure(text: string): {
  table: boolean; fence: boolean; heading: boolean; emphasis: boolean; list: boolean
} {
  return {
    table: /^\s*\|.*\|\s*$/m.test(text) && /^\s*\|[\s:|-]+\|\s*$/m.test(text),
    fence: /```/.test(text),
    heading: /^#{1,6}\s+\S/m.test(text),
    emphasis: /\*\*[^*]+\*\*/.test(text),
    list: /^\s*[-*+]\s+\S/m.test(text),
  }
}
