import type { createServerSupabaseClient } from '@/lib/supabase-server'

interface FireOptions {
  business_id: string
  outlet_id: string | null
  sale_id: string
  table_label: string | null
}

// KDS-FIX-1 — root cause of pos_kds_tickets silently receiving zero new rows since 2026-07-02:
// this function used to trust client-supplied item identity (the terminal sent `id: product.id`
// for each cart line, not the real pos_sale_items.id). That value was written straight into
// sale_item_id, which carries a real FK constraint (pos_kds_tickets_sale_item_id_fkey ->
// pos_sale_items.id) — every insert failed, invisibly: the route returned HTTP 200 with the
// failure only in a JSON `errors` array nobody read, called from a `fetch(...).catch(() => {})`
// that only catches network failures, never inspects the response body or status.
// Fix: never trust client identity for a DB write — re-query the real, already-created
// sale_items server-side by sale_id, exactly like the already-correct pattern in
// src/app/api/pos/sales/route.ts. Also now idempotent (skips if tickets already exist for this
// sale_id) so it's safe to call from multiple trigger points without creating duplicates.
export async function fireKdsTickets(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  opts: FireOptions,
): Promise<{ fired_count: number; errors: string[] }> {
  const errors: string[] = []
  let fired_count = 0

  const { data: existing } = await supabase
    .from('pos_kds_tickets')
    .select('id')
    .eq('sale_id', opts.sale_id)
    .limit(1)
  if (existing && existing.length > 0) return { fired_count, errors }

  const { data: saleItems } = await supabase
    .from('pos_sale_items')
    .select('id, product_id, quantity, item_notes, seat_number, course')
    .eq('sale_id', opts.sale_id)
    .eq('business_id', opts.business_id)
  if (!saleItems?.length) return { fired_count, errors }

  const productIds = [...new Set(saleItems.map(i => i.product_id).filter((x): x is string => !!x))]
  if (productIds.length === 0) return { fired_count, errors }

  const { data: products } = await supabase
    .from('pos_products')
    .select('id, kds_station, prep_time_seconds')
    .in('id', productIds)
    .eq('business_id', opts.business_id)

  const productMap = new Map(
    (products ?? []).map(p => [String(p.id), p as Record<string, unknown>])
  )

  const ticketsToInsert: Array<Record<string, unknown>> = []
  for (const item of saleItems) {
    if (!item.product_id) continue
    const product = productMap.get(item.product_id)
    if (!product) continue

    const station = String(product.kds_station ?? '').trim() || 'kitchen'
    const prep_time = Number(product.prep_time_seconds) || null

    ticketsToInsert.push({
      business_id: opts.business_id,
      outlet_id: opts.outlet_id,
      sale_id: opts.sale_id,
      sale_item_id: item.id,
      station,
      course: item.course ?? null,
      seat_number: item.seat_number ?? null,
      table_label: opts.table_label,
      status: 'fired',
      prep_time_seconds: prep_time,
      quantity: Number(item.quantity) || 1,
      notes: item.item_notes ?? null,
    })
  }

  if (ticketsToInsert.length === 0) return { fired_count, errors }

  const { error, data: inserted } = await supabase
    .from('pos_kds_tickets')
    .insert(ticketsToInsert)
    .select('id')

  if (error) {
    errors.push(error.message)
  } else {
    fired_count = inserted?.length ?? 0
  }

  return { fired_count, errors }
}
