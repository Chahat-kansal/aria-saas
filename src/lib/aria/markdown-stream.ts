/**
 * S1 PHASE 8 — MAKING PARTIAL MARKDOWN SAFE TO RENDER MID-STREAM.
 *
 * Streaming markdown is always, briefly, invalid. A code fence has an opening ``` and no closing
 * one for as long as the block takes to arrive. A table has a header row but not yet the
 * `| --- |` delimiter that makes it a table. Rendered naively, the answer FLASHES: a paragraph
 * turns into a table turns into a paragraph again, and a half-written fence swallows the rest of
 * the answer as code.
 *
 * This closes those holes for display only. The stored answer is never modified — `toClipboardMarkdown`
 * and the persisted message both use the raw text.
 */

/** Does the text have an odd number of ``` fences, i.e. one still open? */
export function hasUnclosedFence(text: string): boolean {
  const fences = text.match(/^```/gm)
  return (fences?.length ?? 0) % 2 === 1
}

/**
 * A table header with no delimiter row yet is not a table — it is a line of pipes. Rendering it as
 * a paragraph and THEN as a table is the flash. While streaming, hold the incomplete tail back.
 */
export function trailingIncompleteTableRows(text: string): number {
  const lines = text.split('\n')
  let i = lines.length - 1
  // walk back over the trailing pipe-rows
  let pipeRows = 0
  while (i >= 0 && /^\s*\|.*$/.test(lines[i]!)) { pipeRows++; i-- }
  if (pipeRows === 0) return 0

  // if a delimiter row is present among them, the table is renderable
  const tail = lines.slice(lines.length - pipeRows)
  const hasDelimiter = tail.some(l => /^\s*\|[\s:|-]+\|?\s*$/.test(l))
  return hasDelimiter ? 0 : pipeRows
}

/**
 * Prepare streamed text for rendering.
 *
 * While `streaming` is true this closes an open fence and withholds a table that has not yet
 * become one. Once the answer is complete it returns the text untouched — the final DOM is built
 * from exactly what the model wrote.
 */
export function stabiliseStreamingMarkdown(text: string, streaming: boolean): string {
  if (!streaming) return text
  let out = text

  const held = trailingIncompleteTableRows(out)
  if (held > 0) {
    const lines = out.split('\n')
    out = lines.slice(0, lines.length - held).join('\n')
  }

  if (hasUnclosedFence(out)) out += '\n```'
  return out
}
