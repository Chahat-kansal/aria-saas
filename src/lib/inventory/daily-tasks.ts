import type { SupabaseClient } from '@supabase/supabase-js'
import { computeParReadonly } from '@/lib/inventory/par-levels'
import { resolveOutletId } from '@/lib/inventory/outlet-stock'

// INV-STAFF-APP-2 — today's task list from REAL signals (no fabricated weather/data): below-reorder items
// (par), an ABC cycle-count rotation (Class-A by velocity, rotated by weekday), and unacknowledged expiry
// alerts. Each task carries a grounded hypothesis citing real velocity/cover/expiry. Idempotent per day.

export interface TaskRow {
  id: string
  task_type: string
  product_id: string | null
  title: string
  detail: string | null
  hypothesis: string | null
  priority: number
  status: string
  completed_by: string | null
}

function aestDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

async function shape(supabase: SupabaseClient, businessId: string, outletId: string | null, due: string): Promise<TaskRow[]> {
  const { data } = await supabase.from('inventory_tasks')
    .select('id, task_type, product_id, title, detail, hypothesis, priority, status, completed_by')
    .eq('business_id', businessId).eq('due_date', due)
    .order('priority', { ascending: false }).order('created_at', { ascending: true })
  return ((data ?? []) as TaskRow[]).filter(() => true)
}

/** Generate (idempotently) and return today's tasks for a business/outlet. */
export async function generateDailyTasks(supabase: SupabaseClient, businessId: string, outletIdIn?: string | null): Promise<TaskRow[]> {
  const outletId = await resolveOutletId(supabase, businessId, outletIdIn ?? null)
  const due = aestDate()

  // Already generated today? Return them (idempotent — never regenerate dupes).
  const existing = await shape(supabase, businessId, outletId, due)
  if (existing.length > 0) return existing

  const par = await computeParReadonly(supabase, businessId)
  const inserts: Array<Record<string, unknown>> = []

  // 1) Below-reorder → a count to confirm before ordering (highest priority).
  for (const r of par.rows.filter(x => x.below_reorder).slice(0, 10)) {
    inserts.push({
      business_id: businessId, outlet_id: outletId, task_type: 'count', product_id: r.product_id,
      title: `Count ${r.name}`,
      detail: `${r.on_hand} on hand · reorder at ${r.reorder_point}`,
      hypothesis: `Sells ${r.units_per_day}/day${r.days_of_cover != null ? ` · only ${r.days_of_cover} days cover left` : ''} — count to confirm before reordering.`,
      priority: 30, generated_by: 'aria', due_date: due,
    })
  }

  // 2) ABC cycle-count rotation — Class-A items, rotated by weekday so each gets a weekly verify.
  const aItems = par.rows.filter(r => r.abc_tier === 'A' && !r.below_reorder).sort((a, b) => b.units_per_day - a.units_per_day)
  const weekday = new Date().getDay() // 0..6
  const picks = aItems.filter((_, i) => i % 7 === weekday % 7).slice(0, 4)
  for (const r of picks) {
    inserts.push({
      business_id: businessId, outlet_id: outletId, task_type: 'cycle_count', product_id: r.product_id,
      title: `Cycle-count ${r.name}`,
      detail: `Class-A · high value · weekly verify (not a full stocktake)`,
      hypothesis: `Class-A · ${r.units_per_day}/day — a quick weekly accuracy check on your top sellers.`,
      priority: 20, generated_by: 'aria', due_date: due,
    })
  }

  // 3) Expiring — unacknowledged expiry alerts (best-effort; table may be empty).
  try {
    const { data: exp } = await supabase.from('pos_expiry_alerts')
      .select('product_id, days_until_expiry, quantity_at_risk, message')
      .eq('business_id', businessId).eq('acknowledged', false).order('days_until_expiry', { ascending: true }).limit(10)
    const names = new Map(par.rows.map(r => [r.product_id, r.name]))
    for (const e of exp ?? []) {
      inserts.push({
        business_id: businessId, outlet_id: outletId, task_type: 'expiring', product_id: e.product_id,
        title: `Check ${names.get(e.product_id as string) ?? 'item'} expiry`,
        detail: e.message ?? null,
        hypothesis: `${e.days_until_expiry} days to expiry · ${e.quantity_at_risk} units at risk — pull, discount, or mark waste.`,
        priority: 25, generated_by: 'aria', due_date: due,
      })
    }
  } catch { /* table shape/absent → skip */ }

  if (inserts.length) {
    // onConflict targets the inv_tasks_dedupe_uq constraint → re-runs never duplicate a product/type/day task.
    const { error } = await supabase.from('inventory_tasks').upsert(inserts, { onConflict: 'business_id,outlet_id,product_id,task_type,due_date', ignoreDuplicates: true })
    if (error) throw new Error(`generateDailyTasks upsert failed: ${error.message}`)
  }
  return shape(supabase, businessId, outletId, due)
}

/** Lightweight counts for groundTruth: open tasks today + open review-queue items. */
export async function taskAndReviewCounts(supabase: SupabaseClient, businessId: string): Promise<{ open_tasks: number; open_reviews: number }> {
  const due = aestDate()
  const [{ count: tasks }, { count: reviews }] = await Promise.all([
    supabase.from('inventory_tasks').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('due_date', due).eq('status', 'open'),
    supabase.from('inventory_review_queue').select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'open'),
  ])
  return { open_tasks: tasks ?? 0, open_reviews: reviews ?? 0 }
}
