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
