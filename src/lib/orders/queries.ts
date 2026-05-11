import type { PurchaseOrder, PurchaseOrderLine, ReorderSchedule, MarketPriceResult } from './types'

type SB = ReturnType<typeof import('@/lib/supabase-server').createServerSupabaseClient>

export async function getPurchaseOrders(
  supabase: SB, businessId: string, status?: string
): Promise<PurchaseOrder[]> {
  let q = supabase
    .from('pos_purchase_orders')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  if (error?.code === '42P01') return [] // table not yet migrated
  return (data ?? []) as PurchaseOrder[]
}

export async function getPurchaseOrder(supabase: SB, id: string, businessId: string): Promise<PurchaseOrder | null> {
  const { data: order, error: oErr } = await supabase
    .from('pos_purchase_orders')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (oErr?.code === '42P01' || !order) return null

  const { data: lines } = await supabase
    .from('pos_purchase_order_lines')
    .select('*')
    .eq('order_id', id)
    .order('sort_order')

  return { ...(order as PurchaseOrder), lines: (lines ?? []) as PurchaseOrderLine[] }
}

export async function createPurchaseOrder(
  supabase: SB, businessId: string, source: string, createdBy: string
): Promise<PurchaseOrder | null> {
  const { data: numData } = await supabase.rpc('generate_po_number', { p_business_id: businessId })
  const orderNumber = numData ?? `PO-${Date.now()}`

  const { data, error } = await supabase
    .from('pos_purchase_orders')
    .insert({ business_id: businessId, order_number: orderNumber, status: 'draft', source, created_by: createdBy })
    .select()
    .single()
  if (error) return null
  return data as PurchaseOrder
}

export async function updatePurchaseOrder(
  supabase: SB, id: string, businessId: string, patch: Partial<PurchaseOrder>
): Promise<PurchaseOrder | null> {
  const { data, error } = await supabase
    .from('pos_purchase_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', businessId)
    .select().single()
  if (error) return null
  return data as PurchaseOrder
}

export async function deletePurchaseOrder(supabase: SB, id: string, businessId: string): Promise<boolean> {
  const { data: order } = await supabase
    .from('pos_purchase_orders').select('status').eq('id', id).eq('business_id', businessId).maybeSingle()
  if (!order || order.status !== 'draft') return false
  const { error } = await supabase.from('pos_purchase_orders').delete().eq('id', id).eq('business_id', businessId)
  return !error
}

export async function addOrderLine(
  supabase: SB, orderId: string, businessId: string, line: Partial<PurchaseOrderLine>
): Promise<PurchaseOrderLine | null> {
  const { data, error } = await supabase
    .from('pos_purchase_order_lines')
    .insert({ unit: 'case', ...line, order_id: orderId, business_id: businessId })
    .select().single()
  if (error) {
    console.error('[addOrderLine] insert failed:', error.message)
    return null
  }
  return data as PurchaseOrderLine
}

export async function updateOrderLine(
  supabase: SB, id: string, businessId: string, patch: Partial<PurchaseOrderLine>
): Promise<PurchaseOrderLine | null> {
  const { data, error } = await supabase
    .from('pos_purchase_order_lines')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', businessId)
    .select().single()
  if (error) return null
  return data as PurchaseOrderLine
}

export async function removeOrderLine(supabase: SB, id: string, businessId: string): Promise<boolean> {
  const { error } = await supabase
    .from('pos_purchase_order_lines').delete().eq('id', id).eq('business_id', businessId)
  return !error
}

export async function getReorderSchedule(supabase: SB, businessId: string): Promise<ReorderSchedule | null> {
  const { data, error } = await supabase
    .from('pos_reorder_schedules').select('*').eq('business_id', businessId).maybeSingle()
  if (error?.code === '42P01') return null
  return data as ReorderSchedule | null
}

export async function upsertReorderSchedule(
  supabase: SB, businessId: string, schedule: Partial<ReorderSchedule>
): Promise<ReorderSchedule | null> {
  const { data, error } = await supabase
    .from('pos_reorder_schedules')
    .upsert({ ...schedule, business_id: businessId, updated_at: new Date().toISOString() }, { onConflict: 'business_id' })
    .select().single()
  if (error) return null
  return data as ReorderSchedule
}

export async function getMarketPrices(supabase: SB, productId: string): Promise<MarketPriceResult[]> {
  const { data } = await supabase
    .from('pos_market_price_cache')
    .select('source_name,source_url,shelf_price,fetched_at')
    .eq('product_id', productId)
    .gt('expires_at', new Date().toISOString())
  return (data ?? []).map(r => ({ ...r, is_cached: true })) as MarketPriceResult[]
}

export async function getPurchaseHistory(
  supabase: SB, productId: string, businessId: string, limit = 5
): Promise<{ price: number; created_at: string; order_number: string }[]> {
  const { data } = await supabase
    .from('pos_purchase_order_lines')
    .select('confirmed_price,created_at,pos_purchase_orders!inner(order_number)')
    .eq('product_id', productId)
    .eq('business_id', businessId)
    .not('confirmed_price', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map((r: any) => ({
    price: r.confirmed_price,
    created_at: r.created_at,
    order_number: r.pos_purchase_orders?.order_number ?? '',
  }))
}
