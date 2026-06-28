import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOutletId, adjustOutletStock } from '@/lib/inventory/outlet-stock'
import { resolveCostFor, resolveCostBatch } from '@/lib/inventory/resolve-cost'

// INV-ADJUST-1 — a deliberate manual stock correction (make the book match reality for a KNOWN reason).
// DISTINCTION: a COUNT verifies → review (no direct move); WASTE is a known loss → decrements; an ADJUST is a
// discretionary correction → it DOES move items_on_hand directly, attributed. Because it is discretionary (not
// evidence-backed like a count), it is PERMISSION-GATED to manager/owner/admin (or an explicit permissions
// grant) — not every staffer. It writes the SAME attributed rail (pos_stock_adjustments) the count-accept and
// waste paths use. The canonical mover (adjustOutletStock) runs exactly ONCE; the row is the audit record. A
// reason is MANDATORY (a correction without a reason is how stock silently drifts).

export const ADJUST_REASONS = ['found_stock', 'damaged', 'theft', 'supplier_error', 'data_correction', 'opening_balance', 'other'] as const
// Reuses the existing role set (pos/manager-verify): manager/owner/admin. permissions jsonb can grant an override.
const ADJUST_ROLES = ['manager', 'owner', 'admin']

export function canAdjustStock(role: string | null | undefined, permissions: unknown): boolean {
  if (ADJUST_ROLES.includes((role ?? '').toLowerCase())) return true
  const p = (permissions ?? {}) as Record<string, unknown>
  return p.can_adjust_stock === true || p.stock_adjust === true || p.inventory_admin === true
}

export async function staffCanAdjust(supabase: SupabaseClient, businessId: string, staffId: string): Promise<{ allowed: boolean; role: string }> {
  const { data } = await supabase.from('pos_staff').select('role, permissions').eq('id', staffId).eq('business_id', businessId).maybeSingle()
  const role = (data?.role as string | null) ?? 'staff'
  return { allowed: canAdjustStock(role, data?.permissions), role }
}

export type AdjustMode = 'set' | 'add' | 'remove'

export type AdjustOutcome =
  | { ok: false; error: 'permission' | 'no_reason' | 'no_change'; role?: string }
  | { ok: true; adjustment_id: string | null; delta: number; on_hand_before: number; new_on_hand: number | null; reason: string; idempotent: boolean; staff_name: string }

interface AdjustParams {
  businessId: string
  outletIdIn?: string | null
  productId: string
  productName?: string | null
  mode: AdjustMode
  value: number
  reason?: string | null
  staffId: string
  staffName: string
  /** UUID minted client-side at enqueue time. When present, enables exactly-once idempotency via explicit row ID. */
  idempotency_key?: string | null
}

export async function applyAdjustment(supabase: SupabaseClient, p: AdjustParams): Promise<AdjustOutcome> {
  // PERMISSION GATE — discretionary correction → manager/owner/admin (or granted) only.
  const perm = await staffCanAdjust(supabase, p.businessId, p.staffId)
  if (!perm.allowed) return { ok: false, error: 'permission', role: perm.role }

  // Reason MANDATORY.
  const reason = (p.reason ?? '').trim()
  if (!reason) return { ok: false, error: 'no_reason' }

  const outletId = await resolveOutletId(supabase, p.businessId, p.outletIdIn ?? null)
  const { data: inv } = await supabase.from('pos_outlet_inventory').select('items_on_hand')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('outlet_id', outletId ?? '').maybeSingle()
  const before = Number(inv?.items_on_hand ?? 0)

  // Two entry modes → one signed delta.
  const n = Math.round(Number(p.value) || 0)
  const delta = p.mode === 'set' ? Math.max(0, n) - before : p.mode === 'add' ? Math.abs(n) : -Math.abs(n)
  if (delta === 0) return { ok: false, error: 'no_change' }

  // Idempotency — two paths:
  // 1. Explicit UUID key (offline queue replay): check for existing row with id = key → claim-first pattern.
  // 2. No key (online submit): 1-minute time-window check as before (prevents double-click / form resubmit).
  const idk = (p.idempotency_key ?? '').trim() || null
  if (idk) {
    // Offline path: check if this key was already claimed (another successful replay applied the adjustment).
    const { data: existing } = await supabase.from('pos_stock_adjustments').select('id').eq('id', idk).maybeSingle()
    if (existing?.id) return { ok: true, adjustment_id: idk, delta, on_hand_before: before, new_on_hand: before, reason, idempotent: true, staff_name: p.staffName }
    // Claim the key by inserting the audit row with the explicit UUID. If a concurrent replay races here
    // and gets the unique violation, it will see the row on its own check above and return idempotent.
    const { data: claimedRow, error: claimErr } = await supabase.from('pos_stock_adjustments').insert({
      id: idk, business_id: p.businessId, product_id: p.productId, outlet_id: outletId,
      adjustment_qty: delta, reason, adjusted_by: p.staffName, staff_id: p.staffId,
    }).select('id').maybeSingle()
    if (claimErr || !claimedRow?.id) {
      // Claim failed — concurrent replay beat us; treat as idempotent.
      return { ok: true, adjustment_id: idk, delta, on_hand_before: before, new_on_hand: before, reason, idempotent: true, staff_name: p.staffName }
    }
    // Claim succeeded — now apply the stock delta.
    const newOnHand = outletId ? await adjustOutletStock(supabase, { businessId: p.businessId, outletId, productId: p.productId, delta }) : null
    if (newOnHand === null && outletId) {
      // Delta failed (RPC error or outlet missing) — release the claim so next retry can attempt the full operation.
      await supabase.from('pos_stock_adjustments').delete().eq('id', idk)
      return { ok: false, error: 'no_change' }
    }
    return { ok: true, adjustment_id: idk, delta, on_hand_before: before, new_on_hand: newOnHand, reason, idempotent: false, staff_name: p.staffName }
  }

  // Online path: 1-minute time-window guard (prevents double-click / form resubmit).
  const minuteAgo = new Date(Date.now() - 60_000).toISOString()
  const { data: dup } = await supabase.from('pos_stock_adjustments').select('id')
    .eq('business_id', p.businessId).eq('product_id', p.productId).eq('adjusted_by', p.staffName)
    .eq('adjustment_qty', delta).gte('created_at', minuteAgo).limit(1).maybeSingle()
  if (dup?.id) return { ok: true, adjustment_id: dup.id as string, delta, on_hand_before: before, new_on_hand: before, reason, idempotent: true, staff_name: p.staffName }

  // Attributed audit row (the SAME rail count-accept + waste use). This row does NOT move stock.
  const { data: row } = await supabase.from('pos_stock_adjustments').insert({
    business_id: p.businessId, product_id: p.productId, outlet_id: outletId,
    adjustment_qty: delta, reason, adjusted_by: p.staffName, staff_id: p.staffId,
  }).select('id').maybeSingle()

  // THE SINGLE stock mutation (atomic, never negative).
  const newOnHand = outletId ? await adjustOutletStock(supabase, { businessId: p.businessId, outletId, productId: p.productId, delta }) : null

  return { ok: true, adjustment_id: (row?.id as string) ?? null, delta, on_hand_before: before, new_on_hand: newOnHand, reason, idempotent: false, staff_name: p.staffName }
}

function aestStartIso(): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
  return new Date(`${day}T00:00:00+10:00`).toISOString()
}

/** Today's adjustments (all reasons in the rail) enriched with product name + cost-value impact. */
export async function recentAdjustmentsToday(supabase: SupabaseClient, businessId: string, outletId: string | null) {
  const { data } = await supabase.from('pos_stock_adjustments')
    .select('id, product_id, adjustment_qty, reason, adjusted_by, created_at')
    .eq('business_id', businessId).gte('created_at', aestStartIso()).order('created_at', { ascending: false }).limit(50)
  const rows = data ?? []
  const ids = Array.from(new Set(rows.map(r => r.product_id as string).filter(Boolean)))
  const [{ data: prods }, costMap] = await Promise.all([
    ids.length ? supabase.from('pos_products').select('id, name').in('id', ids) : Promise.resolve({ data: [] }),
    resolveCostBatch(supabase, businessId, outletId).catch(() => new Map()),
  ])
  const nameMap = new Map((prods ?? []).map((p: { id: string; name: string }) => [p.id, p.name]))
  return rows.map(r => {
    const cost = (costMap.get(r.product_id as string)?.cost) ?? null
    const delta = Number(r.adjustment_qty) || 0
    return {
      id: r.id as string, product_id: r.product_id as string,
      product_name: nameMap.get(r.product_id as string) ?? 'Item',
      delta, reason: (r.reason as string | null) ?? 'other',
      adjusted_by: (r.adjusted_by as string | null) ?? 'Staff', created_at: r.created_at as string,
      value_dollars: cost != null ? Math.round(delta * cost * 100) / 100 : null,
    }
  })
}

/** GroundTruth: today's adjustment count + net value (signed $) → inventory_ops (RULE 9). */
export async function adjustGroundTruth(supabase: SupabaseClient, businessId: string): Promise<{ adjustments_today: number; adjustments_net_value: number }> {
  const { data } = await supabase.from('pos_stock_adjustments').select('product_id, adjustment_qty').eq('business_id', businessId).gte('created_at', aestStartIso()).limit(500)
  const rows = data ?? []
  const outletId = await resolveOutletId(supabase, businessId, null)
  const costMap = await resolveCostBatch(supabase, businessId, outletId).catch(() => new Map())
  let net = 0
  for (const r of rows) {
    const cost = costMap.get(r.product_id as string)?.cost
    if (cost != null) net += (Number(r.adjustment_qty) || 0) * cost
  }
  return { adjustments_today: rows.length, adjustments_net_value: Math.round(net * 100) / 100 }
}
