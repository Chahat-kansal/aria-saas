import { supabaseAdmin } from '@/lib/supabase-admin'

export type AriaActionInsert = {
  business_id: string
  category: string
  title: string
  recommendation?: string | null
  reason?: string | null
  expected_impact?: string | null
  confidence?: string | null
  status?: string
  source?: string | null
  priority?: string | null
  triggered_by?: string | null
  payload?: Record<string, unknown> | null
  [key: string]: unknown
}

/**
 * Dedup key: business_id + category + title ILIKE first-60-chars.
 * Only deduplications 'pending' rows — completed/executed/proposed always insert.
 * If match found: refresh created_at + fields (prevents daily duplicates).
 * If no match: insert.
 */
export async function upsertAriaAction(row: AriaActionInsert): Promise<void> {
  const status = row.status ?? 'pending'

  if (status !== 'pending') {
    await supabaseAdmin.from('aria_actions').insert({ ...row, status })
    return
  }

  const titlePrefix = row.title.slice(0, 60)
  const { data: existing } = await supabaseAdmin
    .from('aria_actions')
    .select('id')
    .eq('business_id', row.business_id)
    .eq('category', row.category)
    .eq('status', 'pending')
    .ilike('title', titlePrefix + '%')
    .limit(1)

  const existingId = (existing as Array<{ id: string }> | null)?.[0]?.id

  if (existingId) {
    await supabaseAdmin.from('aria_actions').update({
      title: row.title,
      recommendation: row.recommendation,
      reason: row.reason,
      expected_impact: row.expected_impact,
      confidence: row.confidence,
      priority: row.priority,
      payload: row.payload,
      source: row.source,
      created_at: new Date().toISOString(),
    }).eq('id', existingId)
  } else {
    await supabaseAdmin.from('aria_actions').insert({ ...row, status })
  }
}

/**
 * Bulk upsert with per-row dedup. Processes sequentially.
 * Returns counts of inserted vs refreshed rows.
 */
export async function bulkUpsertAriaActions(
  rows: AriaActionInsert[],
): Promise<{ inserted: number; refreshed: number }> {
  let inserted = 0
  let refreshed = 0

  for (const row of rows) {
    const status = row.status ?? 'pending'

    if (status !== 'pending') {
      await supabaseAdmin.from('aria_actions').insert({ ...row, status })
      inserted++
      continue
    }

    const titlePrefix = row.title.slice(0, 60)
    const { data: existing } = await supabaseAdmin
      .from('aria_actions')
      .select('id')
      .eq('business_id', row.business_id)
      .eq('category', row.category)
      .eq('status', 'pending')
      .ilike('title', titlePrefix + '%')
      .limit(1)

    const existingId = (existing as Array<{ id: string }> | null)?.[0]?.id

    if (existingId) {
      await supabaseAdmin.from('aria_actions').update({
        title: row.title,
        recommendation: row.recommendation,
        reason: row.reason,
        expected_impact: row.expected_impact,
        confidence: row.confidence,
        priority: row.priority,
        payload: row.payload,
        source: row.source,
        created_at: new Date().toISOString(),
      }).eq('id', existingId)
      refreshed++
    } else {
      await supabaseAdmin.from('aria_actions').insert({ ...row, status })
      inserted++
    }
  }

  return { inserted, refreshed }
}
