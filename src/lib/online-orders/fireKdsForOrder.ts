import { supabaseAdmin } from '@/lib/supabase-admin'

type KdsItem = {
  product_id?: string
  product_name?: string
  quantity?: number
  modifiers?: Array<{ name: string }>
  config?: {
    removed?: Array<{ name: string }>
    added?: Array<{ name: string; priceCents?: number }>
  }
  note?: string
}

/**
 * Inserts a pos_kds_orders row for an online order.
 * Safe to call from the Stripe webhook (auto-accept) or from the PATCH accept flow.
 * Idempotent: bails silently if a KDS row for this sale already exists.
 */
export async function fireKdsForOrder(orderId: string, businessId: string): Promise<void> {
  const { data: ord } = await supabaseAdmin
    .from('pos_online_orders')
    .select('order_number, items, sale_id, outlet_id, notes, special_instructions')
    .eq('id', orderId)
    .maybeSingle()

  if (!ord) return

  const items = (ord.items ?? []) as KdsItem[]
  if (!items.length) return

  const orderNum = (ord as { order_number?: string | null }).order_number ?? ''
  const saleId = (ord as { sale_id?: string | null }).sale_id ?? null
  const orderNotes =
    (ord as { notes?: string | null }).notes ??
    (ord as { special_instructions?: string | null }).special_instructions ??
    null

  // Idempotency guard — bail if a KDS row already exists for this sale
  if (saleId) {
    const { data: existingKds } = await supabaseAdmin
      .from('pos_kds_orders')
      .select('id')
      .eq('sale_id', saleId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (existingKds) return
  }

  // Dietary flags per product
  const productIds = [...new Set(items.map(i => i.product_id).filter((id): id is string => !!id))]
  const dietaryMap: Record<string, string[]> = {}
  if (productIds.length > 0) {
    const { data: prods } = await supabaseAdmin
      .from('pos_products')
      .select('id, is_gluten_free, is_vegan, is_vegetarian')
      .in('id', productIds)
    for (const p of (prods ?? [])) {
      const prod = p as { id: string; is_gluten_free: boolean | null; is_vegan: boolean | null; is_vegetarian: boolean | null }
      const tags: string[] = []
      if (prod.is_gluten_free) tags.push('⚠ GLUTEN FREE')
      if (prod.is_vegan) tags.push('⚠ VEGAN')
      else if (prod.is_vegetarian) tags.push('⚠ VEGETARIAN')
      if (tags.length) dietaryMap[prod.id] = tags
    }
  }

  const now = new Date().toISOString()

  const kdsItems = items.map(item => {
    const pName = item.product_name ?? 'Item'
    const removed = item.config?.removed ?? []
    const added = item.config?.added ?? []
    const mods = item.modifiers ?? []
    const modLines: string[] = []
    for (const d of (dietaryMap[item.product_id ?? ''] ?? [])) modLines.push(d)
    for (const r of removed) modLines.push('NO ' + r.name.toUpperCase())
    for (const a of added) modLines.push('+' + a.name)
    for (const m of mods) modLines.push(m.name)
    if (item.note) modLines.push('NOTE: ' + item.note)
    return {
      name: pName,
      qty: item.quantity ?? 1,
      modifiers: modLines,
      ...(item.note ? { special_instructions: item.note } : {}),
    }
  })

  await supabaseAdmin.from('pos_kds_orders').insert({
    business_id: businessId,
    sale_id: saleId,
    table_number: '#' + orderNum + ' ONLINE',
    items: kdsItems,
    status: 'new',
    priority: 1,
    notes: orderNotes,
    created_at: now,
  })
}