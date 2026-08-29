import type { AskBlock } from './ask-types'

/**
 * S6 PHASE 1 — A HEADING WITH NOTHING UNDER IT IS A FAKE CONTROL.
 *
 * ── WHAT WENT WRONG ─────────────────────────────────────────────────────────────────────────────
 * The surface rendered `COUNCIL READ` with GROWTH · RISK · STRATEGY · CONTEXT beneath it and
 * nothing under any of them. Both council block renderers print their chrome — the panel, the
 * header, the coloured role labels — BEFORE looking at whether there is any text to show:
 *
 *   dashboard/BlockRenderer.tsx:86-105   `Council read` header, then `(block.items ?? []).map(...)`
 *   dashboard/BlockRenderer.tsx:108-126  Growth / Risk / Strategy boxes from block.growth etc.
 *
 * So an empty `items: []`, or a `council_split` whose fields came back undefined, renders as four
 * labelled headings promising an analysis that does not exist. That is the same defect this sprint
 * series has found five times over: something presents as working when it isn't.
 *
 * ── THE COUNCIL IS MEANT TO RETURN SECTIONS. THIS IS NOT A SCAFFOLD BEING RETIRED ───────────────
 * council.ts:457-461 explicitly asks the model for `brain_readouts` and `council_split` with their
 * content, and route.ts:1309 passes `council.ask_blocks` straight through. So sections are real
 * when the model produces them — the failure is that nothing checked whether it had.
 *
 * ── WHY THIS IS ONE FUNCTION AND NOT A GUARD IN EACH RENDERER ──────────────────────────────────
 * There are TWO block renderers (components/dashboard and components/aria) plus the route that
 * emits blocks. Three places to decide "is this empty?" is three places to disagree, which is this
 * codebase's most-repeated failure. The route drops empty blocks so they never reach a client, and
 * both renderers refuse to draw one that arrives anyway — from an older deploy, a replayed
 * conversation, or a path nobody has thought about yet.
 */

/** Text that is present and actually says something. */
function speaks(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}

/** An array that contains at least one entry carrying something. */
function hasEntries(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false
  return v.some(entry => {
    if (entry === null || entry === undefined) return false
    if (typeof entry === 'string') return entry.trim().length > 0
    if (typeof entry === 'number') return Number.isFinite(entry)
    if (typeof entry === 'object') {
      return Object.entries(entry as Record<string, unknown>)
        // `&&` binds tighter than `||`, so this needs the parentheses: without them a `type` key
        // holding a number would count as content and keep an otherwise-empty entry alive.
        .some(([k, val]) => k !== 'type' && (speaks(val) || (typeof val === 'number' && Number.isFinite(val))))
    }
    return true
  })
}

/**
 * S7 PHASE 2 — WHICH FIELD IS THE BODY, PER BLOCK TYPE.
 *
 * S6 taught this predicate three shapes. The live screenshot showed a fourth — a `data_table`
 * carrying `TOP CUSTOMERS — ALL LAPSED 60+ DAYS` with columns and no rows — and the phase-1
 * inventory found 13 types in total that can print a header over an empty body.
 *
 * ⚠️ `data_table`'s body is `rows`, NOT `columns`. Columns ARE the header: a table with columns and
 * no rows is exactly the reported defect, so counting a non-empty `columns` as content would
 * reproduce the bug while looking like a fix. Same reasoning for `spreadsheet`'s `headers`.
 *
 * A type listed here is content-free when NONE of its body fields carries an entry. A type NOT
 * listed is never dropped — S6's conservative rule, kept deliberately: losing a real answer is far
 * worse than showing an empty panel, and this map is a claim about shapes we have actually read.
 *
 * Exported so the phase-3 rail can assert its own scan reaches at least every type claimed here —
 * an under-reaching scan would report "nothing unjudged" and mean nothing by it.
 */
export const BODY_FIELDS: Record<string, string[]> = {
  data_table:       ['rows'],
  spreadsheet:      ['rows'],
  comparison_table: ['rows'],
  action_card:      ['buttons'],
  action_list:      ['items'],
  menu_list:        ['items'],
  metric_row:       ['items'],
  task_plan:        ['steps'],
  infographic:      ['sections'],
  slides:           ['slides'],
  chart:            ['values', 'metrics'],
  bar:              ['data'],
  styled_chart:     ['data'],

  // S7 PHASE 3 — FOUND BY THE RAIL, MISSED BY PHASES 1 AND 2.
  // ask-types.ts is written in two eras: multi-line variants above line ~160, single-line ones
  // below it. Both earlier scans were line-anchored, so they read the multi-line half and were
  // blind to the single-line half — which is 11 of the 34 types. These four are the same defect
  // as data_table, sitting in the half nobody had looked at:
  //   progress_bars / activity_stream — uppercase title, then items.map() into an empty panel
  //   clay_chart                      — a solid accent-coloured card with a title bar and an
  //                                     empty 100px chart container under it
  //   bento_grid                      — no title, but a padded grid box drawn around nothing
  bento_grid:       ['items'],
  progress_bars:    ['items'],
  activity_stream:  ['items'],
  clay_chart:       ['data'],
}

/**
 * True when a block would render its chrome and promise content it does not have.
 *
 * Only block types with a header-plus-body shape are judged. Everything else returns false — a
 * block type this function has not been taught about is NEVER silently dropped, because losing a
 * real answer is far worse than showing an empty panel.
 */
export function isContentFreeBlock(block: AskBlock | null | undefined): boolean {
  if (!block || typeof block !== 'object') return true
  const b = block as Record<string, unknown>

  const bodyFields = BODY_FIELDS[String(b.type)]
  if (bodyFields) return !bodyFields.some(f => hasEntries(b[f]))

  switch (b.type) {
    case 'brain_readouts': {
      // The header renders unconditionally; the body is items.map(). No speaking item, no panel.
      const items = Array.isArray(b.items) ? b.items : []
      return !items.some(i => speaks((i as Record<string, unknown>)?.text))
    }
    case 'council_split': {
      // Three labelled boxes (Growth / Risk / Strategy) plus the question. If none of them speaks,
      // the owner gets four labels and a border.
      return !(speaks(b.question) || speaks(b.growth) || speaks(b.risk) || speaks(b.strategy))
    }
    case 'lead':
      return !speaks(b.content)
    default:
      return false
  }
}

/** Removes blocks that would render a promise they cannot keep. Order is preserved. */
export function dropContentFreeBlocks(blocks: AskBlock[] | null | undefined): AskBlock[] {
  if (!Array.isArray(blocks)) return []
  return blocks.filter(b => !isContentFreeBlock(b))
}
