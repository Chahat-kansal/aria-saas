import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * TS-1 PHASE 5 — LABELS THAT EXPIRE.
 *
 * `pos_tags` gained subject_type / subject_id / expires_at / rule / source / created_by in
 * migration 20260901103017. A label can therefore be attached to a specific thing, carry a rule,
 * and stop applying on its own.
 *
 * ── THE CALLER AUDIT, DONE BEFORE WRITING ANY OF THIS ──────────────────────────────────────────
 * There was exactly ONE reader of pos_tags in the whole codebase: /api/pos/classifications, a
 * generic brand/family/tag CRUD route. It does `select('*')` with NO expiry filter and writes only
 * { business_id, name } — so it cannot create a subject-scoped or expiring label, and it would
 * happily return an expired one. There was no label read path to extend, so this module IS the
 * read path. The classifications route is fixed separately and narrowly, for tags only.
 *
 * ── EXPIRY IS A READ RULE, NEVER A DELETE ──────────────────────────────────────────────────────
 * An expired label stays in the table. It is history: "this was a priority customer until March"
 * is a true and useful statement, and deleting the row destroys it. Every read here filters on
 * `expires_at is null OR expires_at > now()`, which is the whole mechanism.
 */

/** Named columns. `select('*')` is never used, here or anywhere this module reads. */
const LABEL_COLUMNS = 'id, business_id, name, subject_type, subject_id, expires_at, rule, source, created_by, created_at'

export interface Label {
  id: string
  business_id: string | null
  name: string
  subject_type: string | null
  subject_id: string | null
  expires_at: string | null
  rule: Record<string, unknown> | null
  source: string
  created_by: string | null
  created_at: string | null
}

export interface ListLabelsParams {
  business_id: string
  subject_type?: string
  subject_id?: string
  /**
   * Include labels whose expiry has passed. Default FALSE. Exists so an audit screen can show
   * "what did we call this customer last year" — the history the no-delete rule preserves. It is
   * opt-in precisely so no ordinary read gets stale labels by forgetting a filter.
   */
  include_expired?: boolean
}

/**
 * Read the labels that currently APPLY.
 *
 * A NULL expires_at means "no end date" and always applies — that is the common case and must not
 * be excluded by a naive `expires_at > now()`, which is false for NULL.
 */
export async function listLabels(params: ListLabelsParams): Promise<Label[]> {
  const { business_id, subject_type, subject_id, include_expired = false } = params

  let q = supabaseAdmin
    .from('pos_tags')
    .select(LABEL_COLUMNS)
    .eq('business_id', business_id)

  if (subject_type) q = q.eq('subject_type', subject_type)
  if (subject_id) q = q.eq('subject_id', subject_id)
  // THE EXPIRY RULE. `or` because a null expiry is not an expired one.
  if (!include_expired) q = q.or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

  const { data, error } = await q.order('name')

  // RULE 7 — an error is not an empty label set. Returning [] here would tell the caller
  // "this customer has no labels" when the truth is "we could not find out".
  if (error) {
    console.error('[labels] listLabels failed:', error.message)
    throw new Error('labels_unavailable: ' + error.message)
  }
  return (data ?? []) as Label[]
}

export interface ApplyLabelParams {
  business_id: string
  name: string
  subject_type: string
  subject_id: string
  /** When it stops applying. Null/omitted means it does not expire. */
  expires_at?: string | null
  rule?: Record<string, unknown> | null
  /** CHECK-constrained to 'owner' | 'aria'. Defaults to the column default, 'owner'. */
  source?: 'owner' | 'aria'
  created_by?: string | null
}

/**
 * Attach a label to a subject.
 *
 * `pos_tags_unique_subject` is UNIQUE (business_id, name, subject_type, COALESCE(subject_id, …)),
 * so re-applying the same label to the same subject is an upsert, not a duplicate row — and the
 * DATABASE decides that, not a preceding "does this label exist?" read.
 */
export async function applyLabel(params: ApplyLabelParams): Promise<Label | null> {
  const { data, error } = await supabaseAdmin
    .from('pos_tags')
    .upsert({
      business_id: params.business_id,
      name: params.name,
      subject_type: params.subject_type,
      subject_id: params.subject_id,
      expires_at: params.expires_at ?? null,
      rule: params.rule ?? null,
      ...(params.source ? { source: params.source } : {}),
      created_by: params.created_by ?? null,
    }, { onConflict: 'business_id,name,subject_type,subject_id' })
    .select(LABEL_COLUMNS)
    .maybeSingle()

  if (error) {
    console.error('[labels] applyLabel failed:', error.message)
    return null
  }
  return (data ?? null) as Label | null
}

/**
 * True when a label applies right now. Exported so a caller filtering an already-fetched list
 * uses the SAME rule the query uses, rather than writing `expires_at > now` and quietly dropping
 * every never-expiring label.
 */
export function labelApplies(label: Pick<Label, 'expires_at'>, at: Date = new Date()): boolean {
  if (!label.expires_at) return true
  return new Date(label.expires_at).getTime() > at.getTime()
}
