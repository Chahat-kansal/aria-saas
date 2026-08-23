import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * MS14 PHASE 4 — HOUSE RULES.
 *
 * The operating rules of a venue, as the OWNER states them: "target GP 68%", "never discount
 * coffee", "peak is Sat 9–12", "we round prices to $0.10". This is the thing a competitor cannot
 * import — an owner who has told Aria how their venue runs has taught it something no CSV export
 * carries.
 *
 * NO NEW TABLE: a house rule is a `kind` in aria_business_memory (227 rows live), which already
 * has `superseded_by` — so a changed rule is a NEW VERSION, not an overwrite, and the previous
 * wording stays readable. The supersede shape here is byte-for-byte the one the pattern-memory
 * cron already uses (is_active=false + deleted_at + deleted_reason='superseded' + superseded_by),
 * so every existing reader — all of which filter is_active AND deleted_at — hides old versions
 * automatically without a single reader change.
 *
 * ARIA NEVER WRITES THE CONTENT. Aria may ask the question; the answer stored is the owner's,
 * verbatim. A rule nobody stated is not a rule — an unanswered question produces NO row, never a
 * default and never an inference. (Inferring rules from data is explicitly out of scope here.)
 */

export const HOUSE_RULE_KIND = 'house_rule'

export interface HouseRule {
  id: string
  content: string
  topic: string | null
  importance: number
  created_at: string
  superseded_by?: string | null
  is_active?: boolean
}

/** Rules currently in force. Mirrors every other memory reader's filter parity. */
export async function listHouseRules(businessId: string): Promise<HouseRule[]> {
  const { data, error } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id, content, topic, importance, created_at')
    .eq('business_id', businessId)
    .eq('kind', HOUSE_RULE_KIND)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('importance', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[house-rules] list failed:', error.message)
    return []
  }
  return (data ?? []) as HouseRule[]
}

/** Every version of every rule, newest first — the history an owner can audit. */
export async function listHouseRuleHistory(businessId: string): Promise<HouseRule[]> {
  const { data } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id, content, topic, importance, created_at, superseded_by, is_active')
    .eq('business_id', businessId)
    .eq('kind', HOUSE_RULE_KIND)
    .order('created_at', { ascending: false })
  return (data ?? []) as HouseRule[]
}

export async function createHouseRule(args: {
  businessId: string
  content: string
  topic?: string | null
  sourceType?: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const content = String(args.content ?? '').trim()
  if (!content) return { ok: false, error: 'A house rule needs the owner’s own words — an empty rule is not a rule.' }

  const { data, error } = await supabaseAdmin
    .from('aria_business_memory')
    .insert({
      business_id: args.businessId,
      kind: HOUSE_RULE_KIND,
      content: content.slice(0, 500),
      topic: args.topic ?? null,
      source_type: args.sourceType ?? 'owner_stated',
      // The owner said it, so it is true for this business: full confidence, high importance —
      // a stated rule should outrank an inferred pattern in any recall ordering.
      confidence: 1,
      importance: 9,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to save house rule' }
  return { ok: true, id: data.id as string }
}

/**
 * Change a rule by SUPERSEDING it: the new wording is inserted as its own row, then the old row
 * is marked superseded and pointed at the new one. The old wording is never destroyed — "we
 * used to round to $0.05" is exactly the sort of thing an owner needs to be able to look up.
 */
export async function editHouseRule(args: {
  businessId: string
  ruleId: string
  newContent: string
}): Promise<{ ok: true; id: string; superseded: string } | { ok: false; error: string }> {
  const newContent = String(args.newContent ?? '').trim()
  if (!newContent) return { ok: false, error: 'A house rule needs the owner’s own words — an empty rule is not a rule.' }

  const { data: existing } = await supabaseAdmin
    .from('aria_business_memory')
    .select('id, business_id, topic, kind')
    .eq('id', args.ruleId)
    .eq('business_id', args.businessId)
    .eq('kind', HOUSE_RULE_KIND)
    .maybeSingle()
  if (!existing) return { ok: false, error: 'House rule not found' }

  // 1) the new version first — if this fails, the old rule is still in force (never a gap)
  const created = await createHouseRule({
    businessId: args.businessId,
    content: newContent,
    topic: (existing as { topic: string | null }).topic ?? null,
    sourceType: 'owner_edited',
  })
  if (!created.ok) return created

  // 2) then retire the old one, pointing at its replacement
  const { error: supErr } = await supabaseAdmin
    .from('aria_business_memory')
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
      deleted_reason: 'superseded',
      superseded_by: created.id,
    })
    .eq('id', args.ruleId)
    .eq('business_id', args.businessId)

  if (supErr) {
    console.error('[house-rules] supersede failed (both versions now active):', supErr.message)
    return { ok: false, error: supErr.message }
  }
  return { ok: true, id: created.id, superseded: args.ruleId }
}

/** Retire a rule without replacing it — the owner's rule no longer applies. */
export async function retireHouseRule(businessId: string, ruleId: string): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('aria_business_memory')
    .update({ is_active: false, deleted_at: new Date().toISOString(), deleted_reason: 'owner_retired' })
    .eq('id', ruleId)
    .eq('business_id', businessId)
    .eq('kind', HOUSE_RULE_KIND)
  return !error
}

/**
 * The block that reaches a prompt. Plain, unembellished, attributed — so a model treats these as
 * the owner's standing instructions rather than as data it may reinterpret.
 */
export function formatHouseRulesBlock(rules: Array<{ content: string }>): string {
  if (!rules || rules.length === 0) return ''
  return [
    '',
    'HOUSE RULES (stated by the owner — these are how THIS venue runs):',
    ...rules.map(r => `• ${r.content}`),
    'Follow these unless they conflict with a safety, grounding, or legal rule above — those always win.',
    'Never propose an action that breaks one of these without saying plainly that it breaks it and why you are raising it anyway.',
  ].join('\n')
}
