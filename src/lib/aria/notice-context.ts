/**
 * S8 PHASE 3 — CLICKING ARIA'S OWN NOTICE MUST CARRY THAT NOTICE INTO THE TURN.
 *
 * ── WHAT HAPPENED ───────────────────────────────────────────────────────────────────────────────
 * An owner clicked Aria's own notice — "Briefing pipeline stalled — only 0 rows written in last
 * 24h" — and Aria replied: *"Where did you see this message? What system or service is it related
 * to?"* Amnesia about her own output.
 *
 * ── WHY, CONFIRMED FROM THE CODE AND THE ROW ────────────────────────────────────────────────────
 * `ax-context.ts:111` builds the notice's prompt as `Tell me about "<title>"`, and the click handler
 * sent `ask(n.prompt)` — the display string and nothing else. The notice's `id` was already a real
 * `aria_actions` UUID and was already on screen (React used it as the key); it simply never left the
 * browser. Neither did `subtitle`, which is the row's own `recommendation`.
 *
 * The row it was built from holds all of this:
 *     category         system_health
 *     source           cron:aria-health-monitor
 *     recommendation   "Check the generate-briefings cron. If 0 rows in 24h, the briefing pipeline…"
 *     expected_impact  data integrity
 *     payload          {"value": 0, "details": {…}}
 *
 * So Aria asked "what system or service is it related to?" while the answer sat in the row her own
 * notice was rendered from.
 *
 * ── WHY NOT MATCH ON THE TITLE ──────────────────────────────────────────────────────────────────
 * Because it does not identify anything. THREE rows in production carry that exact title, for three
 * different businesses (Smoke Test Café, Global Liquor, Sip). Titles change, truncate and repeat —
 * S3 found six threads titled identically. The reference travels, or nothing does.
 *
 * ── WHAT THIS MODULE IS ─────────────────────────────────────────────────────────────────────────
 * The reference shape and the pure formatter. The lookup itself lives in the route, because only
 * the route has the caller's verified business id — and the row MUST be re-read server-side and
 * scoped to that business. The client sends an id, never content: a client-supplied "here is what
 * the notice said" would be an injection point, and it would also be a second copy of a truth that
 * already exists in a table.
 */

/** What a click sends. An identity and where to look it up — never text. */
export interface NoticeRef {
  id: string
  source: NoticeSource
}

/**
 * The two record types the Ask Aria surface deep-links from. `computed` notices
 * ("Why might today be quiet so far?") are self-contained questions with no row behind them, and
 * are deliberately absent: there is nothing to look up, and inventing a reference for them would
 * be worse than passing none.
 */
export type NoticeSource = 'aria_action' | 'deliverable'

/** Only the columns the formatter is allowed to speak about. Nothing is inferred from absence. */
export interface NoticeRecord {
  id: string
  title?: string | null
  category?: string | null
  priority?: string | null
  status?: string | null
  source?: string | null
  recommendation?: string | null
  reason?: string | null
  expected_impact?: string | null
  confidence?: string | null
  output_kind?: string | null
  created_at?: string | null
  payload?: unknown
}

const speaks = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

/** A uuid, and nothing else. The route hands this straight to a database filter. */
export function isValidNoticeId(id: unknown): id is string {
  return typeof id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

export function isValidNoticeSource(s: unknown): s is NoticeSource {
  return s === 'aria_action' || s === 'deliverable'
}

/**
 * The grounding block for a turn that began with a click on one of Aria's own notices.
 *
 * Every line traces to a column that was actually present. A missing column produces no line —
 * never "unknown", never a placeholder, and never a guess about what the notice might have meant.
 * `payload` is included as verbatim JSON because it is the notice's own evidence (`{"value": 0}`
 * is why the notice fired), truncated so a large payload cannot crowd out the business context.
 *
 * Returns '' for a record with nothing to say, so the caller appends nothing rather than an
 * empty heading — the same rule the block renderers and the synthesis prompt now follow.
 */
export function formatNoticeContext(rec: NoticeRecord | null | undefined, source: NoticeSource): string {
  if (!rec || typeof rec !== 'object') return ''
  const lines: string[] = []
  const add = (label: string, v: unknown) => { if (speaks(v)) lines.push(label + ': ' + v.trim()) }

  add('title', rec.title)
  add('category', rec.category)
  add('kind', rec.output_kind)
  add('priority', rec.priority)
  add('status', rec.status)
  add('raised_by', rec.source)
  add('confidence', rec.confidence)
  add('recommendation', rec.recommendation)
  add('reason', rec.reason)
  add('expected_impact', rec.expected_impact)
  add('created_at', rec.created_at)
  if (rec.payload !== null && rec.payload !== undefined) {
    try {
      const j = JSON.stringify(rec.payload)
      if (j && j !== '{}' && j !== 'null') lines.push('evidence: ' + j.slice(0, 600))
    } catch { /* an unserialisable payload is simply not quoted */ }
  }
  if (lines.length === 0) return ''

  const what = source === 'aria_action' ? 'a notice Aria raised' : 'a report Aria produced'
  // RULE 19 — give the model the fact, do not forbid the symptom. It asked "where did you see
  // this?" because nothing told it the question came from its own notice. Now something does.
  return '\n\nTHIS_QUESTION_IS_ABOUT_YOUR_OWN_NOTICE (' + what + ', id ' + rec.id + '):\n'
    + lines.join('\n')
    + '\nThe owner reached this question by clicking that notice, so it is yours and you have its'
    + ' record above. Do NOT ask where they saw it or which system it refers to — that is stated'
    + ' here. Answer about this specific record. If a detail is not in the record, say you do not'
    + ' have it rather than guessing.\n'
}
