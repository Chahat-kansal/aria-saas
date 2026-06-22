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
  if (delta < 0) {
    await supabase.rpc('decrement_numeric', { p_table: 'pos_outlet_inventory', p_id: rowId, p_column: 'items_on_hand', p_amount: Math.abs(delta) })
  } else {
    await supabase.rpc('increment_numeric', { p_table: 'pos_outlet_inventory', p_id: rowId, p_column: 'items_on_hand', p_amount: delta })
  }
  await supabase.from('pos_outlet_inventory').update({ updated_at: new Date().toISOString() }).eq('id', rowId)
  const { data: after } = await supabase.from('pos_outlet_inventory').select('items_on_hand').eq('id', rowId).maybeSingle()
  return after ? Number(after.items_on_hand) : null
}
