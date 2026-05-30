import { createServerSupabaseClient } from '@/lib/supabase-server'

interface SaleItemForFire {
  id: string
  product_id: string | null
  quantity: number
  notes: string | null
  seat_number?: number | null
  course?: number | null
}

interface FireOptions {
  business_id: string
  outlet_id: string | null
  sale_id: string
  table_label: string | null
  items: SaleItemForFire[]
}

export async function fireKdsTickets(opts: FireOptions): Promise<{ fired_count: number; errors: string[] }> {
  const errors: string[] = []
  let fired_count = 0
  if (!opts.items.length) return { fired_count, errors }

  const supabase = createServerSupabaseClient()
  const productIds = opts.items.map(i => i.product_id).filter((x): x is string => !!x)
  if (productIds.length === 0) return { fired_count, errors }

  const { data: products } = await supabase
    .from('pos_products')
    .select('id, name, kds_station, prep_time_seconds')
    .in('id', productIds)
    .eq('business_id', opts.business_id)

  const productMap = new Map(
    (products ?? []).map(p => [String(p.id), p as Record<string, unknown>])
  )

  const ticketsToInsert: Array<Record<string, unknown>> = []
  for (const item of opts.items) {
    if (!item.product_id) continue
    const product = productMap.get(item.product_id)
    if (!product) continue
    if (product.kds_skip_routing) continue

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
      notes: item.notes ?? null,
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
