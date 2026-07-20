// BRIEF-FIX-1 (BUG 2) — the one shared format contract between briefing generation and every
// briefing surface that shows plain single-line text (card titles, recommendation titles/
// descriptions, anywhere a label or short string is rendered, not a formatted paragraph).
//
// Full-prose surfaces (AriaBriefingCard's briefing body) render markdown-lite properly instead —
// that's an existing feature (bold spans, "Heading:" blocks), now extended to also handle literal
// "#"/"##"/"###" headings (see parseBriefing() in AriaBriefingCard.tsx). This function is for every
// OTHER surface: those must never show raw markdown syntax at all, so it strips markdown down to
// plain text rather than trying to render it.
//
// Safe to import from both server routes and 'use client' components — no server-only imports.
export function stripMarkdownToPlainText(text: string): string {
  if (!text) return text
  return text
    .replace(/^#{1,6}\s+/gm, '')                     // heading markers
    .replace(/\*\*(.+?)\*\*/g, '$1')                  // bold (**text**)
    .replace(/__(.+?)__/g, '$1')                      // bold (__text__)
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')  // italic (*text*), not part of **
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')     // italic (_text_), not part of __
    .replace(/`([^`]+)`/g, '$1')                      // inline code
    .replace(/\n+/g, ' ')                             // single-line context — collapse all breaks
    .replace(/\s{2,}/g, ' ')
    .trim()
}
