// INV-AGENT-1 — Owner Conversational Agent for inventory.
// SURFACE + ROUTE-TO-GATED-ACTION only. No stock writes, no PO sends.
// Reads from existing groundTruth functions + targeted DB queries — never recomputes from scratch.
import type { SupabaseClient } from '@supabase/supabase-js'
import { replenishmentGroundTruth } from '@/lib/inventory/replenishment-agent'
import { exceptionGroundTruth } from '@/lib/inventory/exception-agent'
import type { PlannedAction, ActionType } from '@/lib/aria/ask/action-planner'
import { resolveCostBatch } from '@/lib/inventory/resolve-cost'

export type InvIntent =
  | 'approve_po'
  | 'flag_summary'
  | 'reorder_summary'
  | 'waste_query'
  | 'dead_stock'
  | 'count_attribution'
  | 'expiry'
  | 'task_summary'
  | 'none'

export function classifyInventoryIntent(message: string): InvIntent {
  // approve_po must come before reorder_summary (both contain "order")
  if (/\bapprove\b/i.test(message) &&
      /\b(order|po|draft|purchase|oat|replenish|reorder|supplier)\b/i.test(message)) return 'approve_po'
  if (/^approve\b/i.test(message.trim())) return 'approve_po'

  if (/\b(exception|flag|alert|review.?queue|what.?s wrong|what needs.*attention|anything wrong|any issues|any flags|short.?deliver|waste.?spike|velocity.?drop|count.?variance)\b/i.test(message)) return 'flag_summary'

  if (/\b(reorder|replenish|low.?cover|need.?order|below.?cover|what.?s low|draft.*order|needs.*reorder)\b/i.test(message)) return 'reorder_summary'

  if (/\bwaste\b/i.test(message) && /\b(high|spike|why|cost|dollar|week|day|tuesday|monday|last|recent|7d|trend)\b/i.test(message)) return 'waste_query'
  if (/^why.{0,40}\bwaste\b/i.test(message)) return 'waste_query'

  if (/\b(dead.?stock|slow.?mov|not.?sell|sitting|stale|no.?sale)\b/i.test(message)) return 'dead_stock'

  if (/\b(what.{0,20}did.{0,20}count|who.{0,20}count|count.{0,20}attribution|today.?s count|count.{0,20}today|staff.{0,20}count)\b/i.test(message) ||
      /\bcounted\b/i.test(message)) return 'count_attribution'

  if (/\b(expir|fefo|use.?by|best.?before|expiring.?soon)\b/i.test(message)) return 'expiry'

  if (/\b(what.{0,20}task|open.?task|inventory.{0,20}task)\b/i.test(message)) return 'task_summary'

  return 'none'
}

export interface InvHandleResult {
  handled: boolean
  text: string
  cost_cents: number
  approve_action?: PlannedAction
}

export async function handleInventoryQuestion(
  sb: SupabaseClient,
  bid: string,
  message: string,
  intent: InvIntent,
): Promise<InvHandleResult> {
  switch (intent) {
    case 'approve_po': return handleApprovePO(sb, bid, message)
    case 'flag_summary': return handleFlagSummary(sb, bid)
    case 'reorder_summary': return handleReorderSummary(sb, bid)
    case 'waste_query': return handleWasteQuery(sb, bid)
    case 'dead_stock': return handleDeadStock(sb, bid)
    case 'count_attribution': return handleCountAttribution(sb, bid, message)
    case 'expiry': return handleExpiry(sb, bid)
    case 'task_summary': return handleTaskSummary(sb, bid)
    default: return { handled: false, text: '', cost_cents: 0 }
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleApprovePO(
  sb: SupabaseClient, bid: string, message: string,
): Promise<InvHandleResult> {
  const { data: drafts } = await sb.from('purchase_order_drafts')
    .select('id, total_cost_cents, items, aria_reasoning, week_starting, created_at')
    .eq('business_id', bid)
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!drafts || drafts.length === 0) {
    return {
      handled: true,
      text: 'There are no purchase order drafts awaiting approval right now. Aria generates new drafts weekly — check back after your next stock scan, or go to **Inventory → Buying** to create one manually.',
      cost_cents: 0,
    }
  }

  // Try to match a specific draft by product name mentioned in the message
  let targetDraft = drafts[0]
  const msgLower = message.toLowerCase()
  for (const draft of drafts) {
    const draftItems = (draft.items as Array<{ product_name?: string }> | null) ?? []
    const hasMatch = draftItems.some(i => {
      if (!i.product_name) return false
      const firstWord = (i.product_name as string).toLowerCase().split(' ')[0]
      return firstWord.length >= 3 && msgLower.includes(firstWord)
    })
    if (hasMatch) { targetDraft = draft; break }
  }

  const items = (targetDraft.items as Array<{
    product_name?: string; suggested_qty?: number; manual_qty?: number; unit_cost_cents?: number
  }> | null) ?? []
  const totalDollars = Number(targetDraft.total_cost_cents ?? 0) / 100
  const topItems = items.slice(0, 3).map(i =>
    `${i.product_name ?? 'item'} ×${i.manual_qty ?? i.suggested_qty ?? 0}`
  ).join(', ')
  const reasoning = typeof targetDraft.aria_reasoning === 'string'
    ? targetDraft.aria_reasoning.slice(0, 180)
    : ''

  const previewText = [
    `I found a draft purchase order for **$${totalDollars.toFixed(2)}** (${items.length} item${items.length !== 1 ? 's' : ''}: ${topItems}${items.length > 3 ? ` + ${items.length - 3} more` : ''}).`,
    reasoning ? `\n${reasoning}` : '',
    `\nReply **"yes"** to approve this order.`,
  ].filter(Boolean).join('')

  const planned: PlannedAction = {
    type: 'approve_po_draft' as ActionType,
    title: `Approve draft PO ($${totalDollars.toFixed(2)})`,
    description: previewText,
    preview: [
      `$${totalDollars.toFixed(2)} total`,
      `${items.length} item${items.length !== 1 ? 's' : ''}`,
      topItems,
    ],
    affected_count: items.length,
    payload: {
      draft_id: targetDraft.id as string,
      total_cost_cents: Number(targetDraft.total_cost_cents ?? 0),
      items_count: items.length,
    },
    estimated_impact: `$${totalDollars.toFixed(2)} purchase order`,
    reversible: false,
    risk: 'medium',
    requires_confirmation: true,
  }

  return { handled: true, text: previewText, cost_cents: 0, approve_action: planned }
}

async function handleFlagSummary(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const [summary, flagsResult] = await Promise.all([
    exceptionGroundTruth(sb, bid).catch(() => null),
    sb.from('inventory_review_queue')
      .select('flag_type, description, status, created_at')
      .eq('business_id', bid)
      .in('status', ['open', 'investigating'])
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  if (!summary || summary.total_open === 0) {
    return { handled: true, text: 'No open inventory exceptions right now — everything looks clean.', cost_cents: 0 }
  }

  const lines: string[] = [`**${summary.total_open} open inventory flag${summary.total_open !== 1 ? 's' : ''}:**`]
  if (summary.counts.short_delivery > 0) lines.push(`• ${summary.counts.short_delivery} short deliver${summary.counts.short_delivery > 1 ? 'ies' : 'y'}`)
  if (summary.counts.waste_spike > 0) lines.push(`• ${summary.counts.waste_spike} waste spike${summary.counts.waste_spike > 1 ? 's' : ''}`)
  if (summary.counts.velocity_drop > 0) lines.push(`• ${summary.counts.velocity_drop} velocity drop${summary.counts.velocity_drop > 1 ? 's' : ''}`)
  if (summary.counts.count_variance > 0) lines.push(`• ${summary.counts.count_variance} count variance${summary.counts.count_variance > 1 ? 's' : ''}`)

  if (summary.highest_dollar_exception) {
    const h = summary.highest_dollar_exception
    lines.push(`\n**Highest priority:** ${h.type.replace(/_/g, ' ')} — ${h.description} ($${h.dollars.toFixed(2)})`)
  }

  const topFlags = flagsResult.data ?? []
  if (topFlags.length > 0) {
    lines.push('\n**Recent open flags:**')
    for (const f of topFlags) {
      lines.push(`• [${(f.flag_type as string).replace(/_/g, ' ')}] ${((f.description as string) ?? '').slice(0, 100)}`)
    }
  }

  lines.push('\nGo to **Inventory → Review Queue** to accept, investigate, or dismiss these flags.')
  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleReorderSummary(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const [replen, draftsResult] = await Promise.all([
    replenishmentGroundTruth(sb, bid).catch(() => null),
    sb.from('purchase_order_drafts')
      .select('id, total_cost_cents, items, status, created_at')
      .eq('business_id', bid)
      .in('status', ['pending_approval', 'approved'])
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  if (!replen && (!draftsResult.data || draftsResult.data.length === 0)) {
    return {
      handled: true,
      text: 'No reorder data available yet. Aria generates replenishment drafts weekly based on sales velocity and current stock levels.',
      cost_cents: 0,
    }
  }

  const lines: string[] = []

  if (replen) {
    if (replen.items_below_cover > 0) {
      lines.push(`**${replen.items_below_cover} item${replen.items_below_cover !== 1 ? 's' : ''} below cover level**`)
      if (replen.proposed_spend_dollars != null) {
        lines.push(`Proposed reorder spend: **$${replen.proposed_spend_dollars.toFixed(2)}**`)
      }
      if (replen.unassigned_supplier_count > 0) {
        lines.push(`Note: ${replen.unassigned_supplier_count} item${replen.unassigned_supplier_count !== 1 ? 's have' : ' has'} no supplier assigned — can't auto-generate PO for those.`)
      }
    } else {
      lines.push('All tracked items are within cover level — no urgent reorders needed.')
    }
  }

  const allDrafts = draftsResult.data ?? []
  const pendingDrafts = allDrafts.filter(d => d.status === 'pending_approval')
  if (pendingDrafts.length > 0) {
    lines.push('')
    lines.push(`**${pendingDrafts.length} draft order${pendingDrafts.length !== 1 ? 's' : ''} awaiting approval:**`)
    for (const d of pendingDrafts) {
      const dItems = (d.items as Array<unknown> | null) ?? []
      const total = Number(d.total_cost_cents ?? 0) / 100
      lines.push(`• $${total.toFixed(2)} (${dItems.length} items) — say "approve order" to approve`)
    }
  }

  if (replen && replen.open_draft_count > 0 && pendingDrafts.length === 0) {
    lines.push(`\n${replen.open_draft_count} draft order${replen.open_draft_count !== 1 ? 's' : ''} already approved this week.`)
  }

  lines.push('\nGo to **Inventory → Buying** to review and manage orders.')
  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleWasteQuery(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const since28 = new Date(Date.now() - 28 * 86400000).toISOString()

  const { data: wasteRows } = await sb.from('pos_waste_log')
    .select('product_id, reason, cost_cents, recorded_at')
    .eq('business_id', bid)
    .not('cost_cents', 'is', null)
    .gt('cost_cents', 0)
    .gte('recorded_at', since28)
    .order('recorded_at', { ascending: false })
    .limit(300)

  if (!wasteRows || wasteRows.length === 0) {
    return { handled: true, text: 'No waste with cost recorded in the last 28 days.', cost_cents: 0 }
  }

  const totalCents = wasteRows.reduce((s, r) => s + Number(r.cost_cents ?? 0), 0)

  // Group by product
  const byProduct = new Map<string, { id: string; cents: number }>()
  const byReason = new Map<string, number>()
  for (const r of wasteRows) {
    const pid = r.product_id as string
    const cents = Number(r.cost_cents ?? 0)
    const existing = byProduct.get(pid) ?? { id: pid, cents: 0 }
    byProduct.set(pid, { ...existing, cents: existing.cents + cents })
    const reason = (r.reason as string) ?? 'unspecified'
    byReason.set(reason, (byReason.get(reason) ?? 0) + cents)
  }

  // Fetch product names
  const productIds = [...byProduct.keys()]
  const { data: prods } = productIds.length > 0
    ? await sb.from('pos_products').select('id, name').in('id', productIds)
    : { data: [] }
  const nameMap = new Map((prods ?? []).map(p => [p.id as string, p.name as string]))

  const topProductEntry = [...byProduct.entries()].sort((a, b) => b[1].cents - a[1].cents)[0]
  const topReasonEntry = [...byReason.entries()].sort((a, b) => b[1] - a[1])[0]

  const topProductName = topProductEntry ? (nameMap.get(topProductEntry[0]) ?? 'Unknown') : 'none'
  const topProductDollars = topProductEntry ? topProductEntry[1].cents / 100 : 0
  const topReasonName = topReasonEntry ? topReasonEntry[0] : 'unspecified'
  const topReasonDollars = topReasonEntry ? topReasonEntry[1] / 100 : 0

  const lines = [
    `**Waste last 28 days: $${(totalCents / 100).toFixed(2)}**`,
    `Top wasted item: **${topProductName}** ($${topProductDollars.toFixed(2)})`,
    `Dominant reason: **${topReasonName}** ($${topReasonDollars.toFixed(2)})`,
    '',
    'Go to **Inventory → Waste** to log or review waste entries.',
  ]

  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleDeadStock(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: tasks } = await sb.from('inventory_tasks')
    .select('title, description, product_id, metadata, task_type')
    .eq('business_id', bid)
    .in('task_type', ['slow_mover', 'dead_stock'])
    .eq('status', 'open')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(10)

  if (!tasks || tasks.length === 0) {
    return {
      handled: true,
      text: 'No slow movers or dead stock flagged today. All tracked items have recent sales activity.',
      cost_cents: 0,
    }
  }

  const lines: string[] = [`**${tasks.length} slow mover${tasks.length !== 1 ? 's' : ''} identified today:**`]
  for (const t of tasks.slice(0, 6)) {
    const meta = t.metadata as { stuck_dollars?: number; days_no_sale?: number } | null
    const stuckDollars = meta?.stuck_dollars
    const daysNoSale = meta?.days_no_sale
    let detail = ''
    if (stuckDollars) detail += ` — $${Number(stuckDollars).toFixed(2)} stuck`
    if (daysNoSale) detail += ` (${daysNoSale}d no sales)`
    lines.push(`• ${(t.title as string) ?? 'Item'}${detail}`)
  }
  if (tasks.length > 6) lines.push(`• ... and ${tasks.length - 6} more`)

  lines.push('\nConsider markdowns or bundle deals. Go to **Inventory → Tasks** to review and complete.')
  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleCountAttribution(
  sb: SupabaseClient, bid: string, message: string,
): Promise<InvHandleResult> {
  // Extract possible staff names from message (capitalised words, not sentence starters)
  const words = message.split(/\s+/)
  const possibleNames: string[] = []
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^a-zA-Z]/g, '')
    if (w.length >= 3 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) {
      possibleNames.push(w.toLowerCase())
    }
  }

  const { data: takes } = await sb.from('pos_stock_takes')
    .select('id, started_by, completed_at, items_counted, items_with_variance, status')
    .eq('business_id', bid)
    .eq('status', 'committed')
    .gte('completed_at', new Date(Date.now() - 7 * 86400000).toISOString())
    .order('completed_at', { ascending: false })
    .limit(30)

  if (!takes || takes.length === 0) {
    return { handled: true, text: 'No committed stocktakes in the last 7 days.', cost_cents: 0 }
  }

  // Fetch staff names for all started_by IDs — pos_stock_takes.started_by is a pos_staff.id UUID
  const staffIds = [...new Set(takes.map(t => t.started_by as string).filter(Boolean))]
  const { data: staffRows } = staffIds.length > 0
    ? await sb.from('pos_staff').select('id, name').in('id', staffIds)
    : { data: [] }
  const staffNameMap = new Map((staffRows ?? []).map(s => [
    s.id as string,
    (s.name as string | null) ?? 'Staff',
  ]))

  // Group by started_by
  const byStaff = new Map<string, { name: string; takes: number; items: number; variances: number }>()
  for (const t of takes) {
    const sid = t.started_by as string
    if (!sid) continue
    const name = staffNameMap.get(sid) ?? sid
    const existing = byStaff.get(sid) ?? { name, takes: 0, items: 0, variances: 0 }
    byStaff.set(sid, {
      name,
      takes: existing.takes + 1,
      items: existing.items + Number(t.items_counted ?? 0),
      variances: existing.variances + Number(t.items_with_variance ?? 0),
    })
  }

  let staffList = [...byStaff.values()]

  // Filter by name if mentioned in message
  if (possibleNames.length > 0) {
    const filtered = staffList.filter(s =>
      possibleNames.some(n => s.name.toLowerCase().includes(n))
    )
    if (filtered.length > 0) staffList = filtered
  }

  if (staffList.length === 0) {
    return { handled: true, text: 'No matching staff counts found in the last 7 days.', cost_cents: 0 }
  }

  const lines: string[] = ['**Count attribution (last 7 days):**']
  for (const s of staffList.slice(0, 6)) {
    const accuracy = s.items > 0 ? Math.round((1 - s.variances / s.items) * 100) : null
    lines.push(`• **${s.name}**: ${s.takes} stocktake${s.takes !== 1 ? 's' : ''}, ${s.items} items${accuracy !== null ? `, ${accuracy}% accuracy` : ''}`)
  }

  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleExpiry(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const in14Days = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const { data: expiring } = await sb.from('pos_products')
    .select('id, name, expiry_date, qty_backroom, shelf_capacity')
    .eq('business_id', bid)
    .eq('is_active', true)
    .not('expiry_date', 'is', null)
    .lte('expiry_date', in14Days)
    .gte('expiry_date', today)
    .order('expiry_date', { ascending: true })
    .limit(10)

  if (!expiring || expiring.length === 0) {
    return {
      handled: true,
      text: 'No products expiring in the next 14 days (among products with expiry dates set).',
      cost_cents: 0,
    }
  }

  // MS11 PHASE 1 — resolved cost, not the raw column, and no unknown summed as zero. The old
  // reduce put `cost_price ?? 0` under an "est. $ at risk" headline: fabricated price*0.4 where
  // recorded, fabricated $0.00 where not.
  const expiryCostMap = await resolveCostBatch(sb, bid, null)
  let atRiskPriced = 0
  let unpricedAtRisk = 0
  for (const p of expiring) {
    const qty = Number(p.qty_backroom ?? p.shelf_capacity ?? 0)
    const rc = expiryCostMap.get(p.id as string)
    if (rc?.cost != null && rc.cost > 0) atRiskPriced += qty * rc.cost
    else unpricedAtRisk++
  }
  const atRiskStr = unpricedAtRisk === expiring.length
    ? 'value unknown — no costs recorded'
    : `est. $${atRiskPriced.toFixed(2)} at risk${unpricedAtRisk > 0 ? ` across priced items; ${unpricedAtRisk} more with no recorded cost` : ''}`

  const lines: string[] = [
    `**${expiring.length} product${expiring.length !== 1 ? 's' : ''} expiring in ≤14 days** (${atRiskStr}):`,
  ]
  for (const p of expiring) {
    const expDate = p.expiry_date as string
    const daysLeft = Math.ceil((new Date(expDate).getTime() - Date.now()) / 86400000)
    const rc = expiryCostMap.get(p.id as string)
    const costStr = rc?.cost != null && rc.cost > 0 ? ` — $${rc.cost.toFixed(2)} cost` : ''
    lines.push(`• **${p.name}** — expires ${expDate} (${daysLeft}d)${costStr}`)
  }
  lines.push('\nApply FEFO — use these items first. Consider markdown or donation for near-expiry stock.')

  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}

async function handleTaskSummary(sb: SupabaseClient, bid: string): Promise<InvHandleResult> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: tasks } = await sb.from('inventory_tasks')
    .select('task_type, title, status, priority')
    .eq('business_id', bid)
    .eq('status', 'open')
    .gte('created_at', today.toISOString())
    .limit(20)

  if (!tasks || tasks.length === 0) {
    return {
      handled: true,
      text: "No open inventory tasks today. Either everything's done, or load the Inventory app to trigger generation.",
      cost_cents: 0,
    }
  }

  const byType = new Map<string, number>()
  for (const t of tasks) {
    const tt = t.task_type as string
    byType.set(tt, (byType.get(tt) ?? 0) + 1)
  }

  const lines: string[] = [`**${tasks.length} open inventory task${tasks.length !== 1 ? 's' : ''} today:**`]
  for (const [type, count] of [...byType.entries()]) {
    lines.push(`• ${count}× ${type.replace(/_/g, ' ')}`)
  }
  lines.push('\nGo to **Inventory → Tasks** to assign and complete.')

  return { handled: true, text: lines.join('\n'), cost_cents: 0 }
}
