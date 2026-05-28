import type { SupabaseClient } from '@supabase/supabase-js'

export interface InvoiceStats {
  pendingCount: number      // sent, not yet paid, not overdue
  pendingTotal: number
  overdueCount: number      // unpaid + past due_date
  overdueTotal: number
  oldestDays: number        // age of the oldest overdue invoice
  paidCount: number         // paid in the last 30 days
  paidTotal: number
  draftCount: number        // drafts not yet sent
  topOverdue: { id: string; name: string; amount: number; days: number } | null
  overdueIds: string[]
}

interface Row { id: string; status: string | null; total: number | string | null; due_date: string | null; paid_at: string | null; bill_to_name: string | null; issue_date: string | null }

// Single source of truth for invoice stats — reused by the daily briefing,
// weekly report, and the invoices dashboard banner.
export async function getInvoiceStats(db: SupabaseClient, businessId: string): Promise<InvoiceStats> {
  const { data } = await db.from('invoices')
    .select('id,status,total,due_date,paid_at,bill_to_name,issue_date')
    .eq('business_id', businessId)
  const rows = (data ?? []) as Row[]

  const todayStr = new Date().toISOString().slice(0, 10)
  const cutoff30 = new Date(Date.now() - 30 * 86400000)

  const stats: InvoiceStats = {
    pendingCount: 0, pendingTotal: 0, overdueCount: 0, overdueTotal: 0, oldestDays: 0,
    paidCount: 0, paidTotal: 0, draftCount: 0, topOverdue: null, overdueIds: [],
  }
  const overdue: Array<{ id: string; name: string; amount: number; days: number }> = []

  for (const r of rows) {
    const total = Number(r.total) || 0
    const isPaid = r.status === 'paid' || !!r.paid_at
    if (isPaid) {
      const when = r.paid_at ? new Date(r.paid_at) : r.issue_date ? new Date(r.issue_date) : null
      if (when && when >= cutoff30) { stats.paidCount++; stats.paidTotal += total }
      continue
    }
    if (r.status === 'draft') { stats.draftCount++; continue }

    // Unpaid + sent.
    const isOverdue = !!r.due_date && r.due_date < todayStr
    if (isOverdue) {
      const days = Math.floor((Date.now() - new Date(r.due_date as string).getTime()) / 86400000)
      stats.overdueCount++; stats.overdueTotal += total
      stats.oldestDays = Math.max(stats.oldestDays, days)
      overdue.push({ id: r.id, name: r.bill_to_name || 'a customer', amount: total, days })
    } else {
      stats.pendingCount++; stats.pendingTotal += total
    }
  }

  overdue.sort((a, b) => b.amount - a.amount)
  stats.topOverdue = overdue[0] ?? null
  stats.overdueIds = overdue.map(o => o.id)
  return stats
}

const money = (n: number) => '$' + n.toFixed(2)

// Briefing/report prompt block built from the stats.
export function formatInvoiceBriefingBlock(s: InvoiceStats): string {
  const lines = [
    'INVOICE STATUS:',
    `- Outstanding: ${s.pendingCount} invoices worth ${money(s.pendingTotal)}`,
    `- Overdue: ${s.overdueCount} invoices worth ${money(s.overdueTotal)}${s.overdueCount > 0 ? ` (oldest ${s.oldestDays} days)` : ''}`,
    `- Paid (last 30 days): ${s.paidCount} invoices worth ${money(s.paidTotal)}`,
    `- Drafts not sent: ${s.draftCount}`,
  ]
  if (s.topOverdue) {
    lines.push(`Top priority: ${money(s.topOverdue.amount)} overdue from ${s.topOverdue.name} — ${s.topOverdue.days} days late, follow up today.`)
  }
  return lines.join('\n')
}

// True when there's anything worth surfacing in a briefing.
export function hasInvoiceSignal(s: InvoiceStats): boolean {
  return s.overdueCount > 0 || s.pendingCount > 0 || s.draftCount > 0 || s.paidCount > 0
}
