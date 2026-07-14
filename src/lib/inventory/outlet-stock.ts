import type { SupabaseClient } from '@supabase/supabase-js'

// INV-DECREMENT-FIX phase 2 — pos_outlet_inventory.items_on_hand is the CANONICAL sellable-stock field
// (per-outlet, multi-location correct). This is the single place sale/void/refund paths adjust it. The
// row is keyed UNIQUE(business_id, product_id, outlet_id). decrement/increment go through the atomic
// numeric RPCs (decrement floors at 0 — never negative). Returns the post-adjust items_on_hand so callers
// can record it as the movement's running balance (the canonical figure, not the stock_quantity cache).

/**
 * Resolve the outlet a sale belongs to. Rule (documented): the sale's own outlet_id when present, else
 * the business's default outlet, else the first active outlet, else any outlet. Single-outlet businesses
 * (e.g. Sip) resolve to their one outlet; multi-outlet sales must carry outlet_id to land in the right one.
 */
export async function resolveOutletId(supabase: SupabaseClient, businessId: string, providedOutletId?: string | null): Promise<string | null> {
  if (providedOutletId) return providedOutletId
  const { data } = await supabase.from('pos_outlets')
    .select('id, is_default, is_active, created_at')
    .eq('business_id', businessId)
    .order('is_default', { ascending: false })
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function ensureRow(supabase: SupabaseClient, businessId: string, productId: string, outletId: string): Promise<string | null> {
  const sel = () => supabase.from('pos_outlet_inventory').select('id')
    .eq('business_id', businessId).eq('product_id', productId).eq('outlet_id', outletId).maybeSingle()
  let { data } = await sel()
  if (data?.id) return data.id as string
  // Create the per-outlet row if missing (new product / new outlet). UNIQUE guards a concurrent create.
  await supabase.from('pos_outlet_inventory')
    .insert({ business_id: businessId, product_id: productId, outlet_id: outletId, items_on_hand: 0 })
    .then(() => {}, () => {})
  ;({ data } = await sel())
  return (data?.id as string | undefined) ?? null
}

/**
 * Adjust items_on_hand for one (business, product, outlet) by `delta` (negative = sale, positive =
 * void/refund restore). Atomic + never negative. Returns the post-adjust items_on_hand, or null if the
 * outlet/product couldn't be resolved.
 */
export async function adjustOutletStock(
  supabase: SupabaseClient,
  params: { businessId: string; outletId: string | null; productId: string; delta: number },
): Promise<number | null> {
  const { businessId, outletId, productId, delta } = params
  if (!outletId || !productId || !delta) return null
  const rowId = await ensureRow(supabase, businessId, productId, outletId)
  if (!rowId) return null
  // INVENTORY-DECREMENT-FIX-1 — this RPC result was never checked; a failure here (e.g. a locked row,
  // a transient RPC error) silently produced a wrong post-adjust items_on_hand with zero visibility.
  const { error: rpcErr } = delta < 0
    ? await supabase.rpc('decrement_numeric', { p_table: 'pos_outlet_inventory', p_id: rowId, p_column: 'items_on_hand', p_amount: Math.abs(delta) })
    : await supabase.rpc('increment_numeric', { p_table: 'pos_outlet_inventory', p_id: rowId, p_column: 'items_on_hand', p_amount: delta })
  if (rpcErr) console.error('[adjustOutletStock] numeric RPC failed:', { businessId, productId, outletId, delta, error: rpcErr.message })
  await supabase.from('pos_outlet_inventory').update({ updated_at: new Date().toISOString() }).eq('id', rowId)
  const { data: after } = await supabase.from('pos_outlet_inventory').select('items_on_hand').eq('id', rowId).maybeSingle()
  return after ? Number(after.items_on_hand) : null
}

/**
 * ASK-ARIA-CONSOLIDATE-2 (RC1) — ATOMIC absolute SET of items_on_hand to `target` (floored at 0). Unlike a
 * read-compute-delta-add, this is a single locked UPDATE (set_numeric RPC), so two concurrent "set 50" both
 * land on 50 — no lost update. Returns { previous, new } (previous is a best-effort pre-read for the audit
 * delta; the SET itself does not depend on it). Returns null if the outlet/product can't be resolved.
 */
export async function setOutletStock(
  supabase: SupabaseClient,
  params: { businessId: string; outletId: string | null; productId: string; target: number },
): Promise<{ previous: number; new: number } | null> {
  const { businessId, outletId, productId } = params
  if (!outletId || !productId) return null
  const target = Math.max(0, Math.round(Number(params.target) || 0))
  const rowId = await ensureRow(supabase, businessId, productId, outletId)
  if (!rowId) return null
  const { data: before } = await supabase.from('pos_outlet_inventory').select('items_on_hand').eq('id', rowId).maybeSingle()
  const previous = before ? Number(before.items_on_hand) || 0 : 0
  const { data: newVal } = await supabase.rpc('set_numeric', { p_table: 'pos_outlet_inventory', p_id: rowId, p_column: 'items_on_hand', p_value: target })
  await supabase.from('pos_outlet_inventory').update({ updated_at: new Date().toISOString() }).eq('id', rowId)
  return { previous, new: newVal != null ? Number(newVal) : target }
}
