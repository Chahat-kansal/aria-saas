import { truncateAtWord } from '@/lib/aria/thread-title'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getRevenueSnapshot } from '@/lib/aria/revenue-snapshot'
import { todayAEST } from '@/lib/date-au'

/**
 * MS16 PHASE 6 — the context panel and the empty state, from live data only.
 *
 * THE RULE, applied without exception: a figure appears WITH its provenance, or it does not appear.
 * There is no placeholder anywhere in this module. Sip's revenue today is $0.00 and this renders
 * $0.00 — a real zero is a measurement, and swapping it for a dash to make the panel look populated
 * is the fabrication this codebase has spent eight sprints digging out.
 *
 * `null` means "not known" and renders amber. `0` means zero. They are never conflated.
 *
 * EVERY FILTER BELOW WAS VERIFIED AGAINST THE LIVE DATABASE (2026-08-25), because the first draft of
 * this file got three of them wrong from memory:
 *   - aria_actions.status — live values are pending · executed · dismissed · expired · auto_rejected
 *     · completed. There is NO 'proposed'. Awaiting-you means `pending`.
 *   - aria_business_memory.kind — live values are fact · concern · pattern · decision · goal ·
 *     preference · tried. There is NO 'house_rule'; tags come from `topic` instead.
 *   - getRevenueSnapshot(businessId, dateStr) takes TWO arguments and returns
 *     { revenue, transaction_count }, not { today_dollars, today_count }.
 */

// The types and the zero-rule formatter live in ax-context-types.ts so the panel components can
// import them WITHOUT dragging supabaseAdmin (and the service-role key) into the browser bundle.
// Re-exported here so server callers have one import path and there is still only one definition.
export type { AxProvenance, AxFigure, AxNotice, AxContext } from './ax-context-types'
export { formatAxFigure } from './ax-context-types'

import type { AxFigure, AxNotice, AxContext } from './ax-context-types'

export async function buildAxContext(businessId: string): Promise<AxContext> {
  const today: AxFigure[] = []
  const awaiting: AxNotice[] = []
  const didToday: Array<{ text: string; at: string | null }> = []
  const noticed: AxNotice[] = []

  // ── WHO ARIA IS TALKING TO ────────────────────────────────────────────────────────────────────
  // The contract greets by name ("Evening, Chahat."). A missing name drops the comma-clause rather
  // than substituting "there" or the business name — a wrong name is worse than no name.
  let ownerName: string | null = null
  let businessName: string | null = null
  try {
    const { data } = await supabaseAdmin
      .from('businesses')
      .select('name, trading_name, owner_name')
      .eq('id', businessId)
      .limit(1)
      .maybeSingle()
    const row = data as { name?: string | null; trading_name?: string | null; owner_name?: string | null } | null
    ownerName = row?.owner_name?.trim() || null
    businessName = row?.trading_name?.trim() || row?.name?.trim() || null
  } catch (e) {
    console.error('[ax-context] business identity failed:', (e as Error).message)
  }

  // ── TODAY ────────────────────────────────────────────────────────────────────────────────────
  // Through the ONE canonical snapshot (RULE 6) rather than a fresh pos_sales query, so this panel
  // cannot disagree with every other revenue figure in the product.
  try {
    const snap = await getRevenueSnapshot(businessId, todayAEST())
    today.push({ label: 'Revenue today', value: snap.revenue, format: 'currency', provenance: 'measured' })
    today.push({ label: 'Sales today', value: snap.transaction_count, format: 'count', provenance: 'measured' })
  } catch (e) {
    // A failed read is UNKNOWN, not zero. This is the distinction the whole panel turns on.
    console.error('[ax-context] revenue snapshot failed:', (e as Error).message)
    today.push({
      label: 'Revenue today', value: null, format: 'currency', provenance: 'unknown',
      note: 'Your till data could not be read just now.',
    })
  }

  // ── AWAITING YOU — real pending decisions ────────────────────────────────────────────────────
  // THE COUNT IS ITS OWN QUERY. The list below is capped at 6 for the panel; using that cap as the
  // badge reported "6" while 55 decisions were actually pending. A count and a page size are not
  // the same number and must not share a source.
  let awaitingTotal = 0
  try {
    const { count, error } = await supabaseAdmin
      .from('aria_actions')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
    awaitingTotal = count ?? 0
  } catch (e) {
    console.error('[ax-context] pending count failed:', (e as Error).message)
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('aria_actions')
      .select('id, title, recommendation, priority, created_at')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(6)
    if (error) throw new Error(error.message)

    for (const a of (data ?? []) as Array<{ id: string; title: string | null; recommendation: string | null; priority: string | null }>) {
      awaiting.push({
        id: String(a.id),
        title: a.title ?? 'A decision is waiting',
        // S6 PHASE 3 — was `.slice(0, 140)`: a raw cut with no word boundary and no ellipsis, so a
        // notice chip rendered cut off mid-sentence and the owner could not tell whether Aria had
        // stopped talking or the text had stopped fitting. Same rule as the thread titles now.
        subtitle: truncateAtWord(a.recommendation, 140),
        tone: a.priority === 'high' ? 'amber' : 'blue',
        prompt: `Tell me about "${a.title ?? ''}"`,
        // S8 PHASE 3 — `id` is already the real aria_actions UUID; this says so, so the click can
        // send it. Before, the id reached the DOM as a React key and went no further, while the
        // council got `Tell me about "<title>"` and asked the owner where they had seen it.
        source: 'aria_action' as const,
        rank: a.priority === 'high' ? 90 : 60,
      })
    }
  } catch (e) {
    console.error('[ax-context] pending actions failed:', (e as Error).message)
  }

  // ── ARIA DID TODAY — the real action log, not a narrative ────────────────────────────────────
  try {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString()
    const { data, error } = await supabaseAdmin
      .from('aria_action_log')
      .select('action_type, executed_at')
      .eq('business_id', businessId)
      .gte('executed_at', since)
      .order('executed_at', { ascending: false })
      .limit(6)
    if (error) throw new Error(error.message)
    for (const row of (data ?? []) as Array<{ action_type: string; executed_at: string }>) {
      didToday.push({ text: String(row.action_type).replace(/_/g, ' '), at: row.executed_at })
    }
  } catch (e) {
    console.error('[ax-context] action log failed:', (e as Error).message)
  }

  // ── WHAT ARIA NOTICED — the empty state's ranked list ────────────────────────────────────────
  // Every entry is a fact drawn from the rows above. If nothing fires, `quiet` is true and the UI
  // says so instead of offering four generic prompts.
  noticed.push(...awaiting.map(a => ({ ...a, rank: a.rank + 5 })))

  const revenueToday = today.find(f => f.label === 'Revenue today')
  if (revenueToday?.provenance === 'measured' && revenueToday.value === 0) {
    noticed.push({
      id: 'no-sales-today',
      source: 'computed' as const,
      title: 'Nothing has gone through the till today',
      subtitle: 'That is a real zero, not missing data. Worth a look if you expected trade by now.',
      tone: 'amber', prompt: 'Why might today be quiet so far?', rank: 70,
    })
  }

  // Low stock against each line's OWN reorder level where it has one — not a guessed threshold.
  try {
    const { data, error } = await supabaseAdmin
      .from('pos_outlet_inventory')
      .select('product_id, items_on_hand, items_reorder_level')
      .eq('business_id', businessId)
      .not('items_reorder_level', 'is', null)
      .limit(200)
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as Array<{ product_id: string; items_on_hand: number | null; items_reorder_level: number | null }>
    const low = rows.filter(r => (r.items_on_hand ?? 0) <= (r.items_reorder_level ?? 0)).slice(0, 3)

    if (low.length > 0) {
      // Names in a second query rather than a PostgREST embed — the embed alias is one more thing
      // that can be silently wrong, and a missing name here would print "undefined" at the owner.
      const { data: prods } = await supabaseAdmin
        .from('pos_products')
        .select('id, name')
        .in('id', low.map(r => r.product_id))
      const names = ((prods ?? []) as Array<{ name: string | null }>).map(p => p.name).filter(Boolean) as string[]
      if (names.length > 0) {
        noticed.push({
          id: 'low-stock',
          source: 'computed' as const,
          title: `${names.length} ${names.length === 1 ? 'line is' : 'lines are'} at or below your reorder level`,
          subtitle: names.join(', '),
          tone: 'violet', prompt: 'What should I reorder?', rank: 80,
        })
      }
    }
  } catch (e) {
    console.error('[ax-context] low stock failed:', (e as Error).message)
  }

  noticed.sort((a, b) => b.rank - a.rank)

  // ── TAGS — the business's own vocabulary, from what Aria has actually remembered ─────────────
  const tags: string[] = []
  try {
    const { data, error } = await supabaseAdmin
      .from('aria_business_memory')
      .select('topic')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .not('topic', 'is', null)
      .order('last_referenced_at', { ascending: false })
      .limit(60)
    if (error) throw new Error(error.message)
    for (const r of (data ?? []) as Array<{ topic: string | null }>) {
      if (r.topic && !tags.includes(r.topic)) tags.push(r.topic)
      if (tags.length >= 8) break
    }
  } catch (e) {
    console.error('[ax-context] memory tags failed:', (e as Error).message)
  }

  // S3 PHASE 5 — THE HEADLINE COUNT MUST NOT BE A FUNCTION OF A PAGE SIZE.
  //
  // `noticed` is the RENDER list, and 6 of its entries come from `awaiting`, which is capped at 6
  // for the panel. So "8 things stood out" was 6-capped-decisions + 2 other notices, sitting beside
  // a tab reading 55. That is the SAME defect MS17 fixed for the badge — "a count and a page size
  // are not the same number and must not share a source" — still live one line higher up.
  //
  // noticedTotal replaces the capped slice with the true pending count and leaves everything else
  // as counted. The two numbers still differ, and SHOULD: "Awaiting you" counts decisions waiting,
  // the headline counts everything Aria noticed, which includes notices that are not decisions
  // (a zero-till day, lines below reorder). Different questions, differently labelled, both true.
  const noticedTotal = awaitingTotal + (noticed.length - awaiting.length)
  return { ownerName, businessName, awaitingTotal, noticedTotal, today, awaiting, didToday, tags, noticed, quiet: noticed.length === 0 }
}
