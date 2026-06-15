import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'
import { encryptFieldSafe, decryptFieldSafe } from '@/lib/encryption'

// ── SEC-5 — Square tokens live ENCRYPTED in pos_oauth_integrations (integration_key='square').
//    Single read/write helpers so the 6+ consumers don't each re-implement table + crypto. ──
export const SQUARE_KEY = 'square' as const

export type SquareTokens = {
  integration_id: string
  access_token: string | null
  refresh_token: string | null
  merchant_id: string | null
  location_id: string | null
  token_expires_at: string | null
  status: string | null
}

/** Read + decrypt the Square tokens for a business from the encrypted store. Null if not connected. */
export async function getSquareTokens(businessId: string): Promise<SquareTokens | null> {
  const { data } = await supabaseAdmin
    .from('pos_oauth_integrations')
    .select('id, access_token_encrypted, refresh_token_encrypted, external_account_id, config, token_expires_at, status')
    .eq('business_id', businessId)
    .eq('integration_key', SQUARE_KEY)
    .maybeSingle()
  if (!data) return null
  const cfg = (data.config as Record<string, unknown> | null) ?? null
  return {
    integration_id: data.id as string,
    access_token: decryptFieldSafe(data.access_token_encrypted as string | null, businessId),
    refresh_token: decryptFieldSafe(data.refresh_token_encrypted as string | null, businessId),
    merchant_id: (data.external_account_id as string | null) ?? null,
    location_id: (cfg?.location_id as string | null) ?? null,
    token_expires_at: (data.token_expires_at as string | null) ?? null,
    status: (data.status as string | null) ?? null,
  }
}

/** Encrypt + persist Square tokens to the encrypted store (used by the OAuth callback). */
export async function writeSquareTokens(businessId: string, integrationId: string, t: {
  access_token: string; refresh_token: string; token_expires_at?: string | null
  merchant_id?: string | null; location_id?: string | null; scopes?: string[] | null
}): Promise<void> {
  await supabaseAdmin.from('pos_oauth_integrations').update({
    status: 'connected',
    access_token_encrypted: encryptFieldSafe(t.access_token, businessId),
    refresh_token_encrypted: encryptFieldSafe(t.refresh_token, businessId),
    token_expires_at: t.token_expires_at ?? null,
    external_account_id: t.merchant_id ?? null,
    ...(t.location_id ? { config: { location_id: t.location_id } } : {}),
    ...(t.scopes ? { scopes: t.scopes } : {}),
    auth_state_token: null, // consume the CSRF token
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq('id', integrationId)
}

/** Update the Square integration sync status on the encrypted store. */
export async function setSquareSyncStatus(businessId: string, status: string, error?: string | null): Promise<void> {
  await supabaseAdmin.from('pos_oauth_integrations').update({
    status,
    last_sync_at: new Date().toISOString(),
    ...(error !== undefined ? { last_error: error } : {}),
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_key', SQUARE_KEY)
}

const SQUARE_BASE = process.env.SQUARE_ENVIRONMENT === 'production'
  ? 'https://connect.squareup.com'
  : 'https://connect.squareupsandbox.com'

export function getSquareOAuthUrl(state: string): string {
  const appId = process.env.SQUARE_APPLICATION_ID ?? ''
  const redirectUri = encodeURIComponent(process.env.SQUARE_REDIRECT_URI ?? '')
  const scopes = [
    'MERCHANT_PROFILE_READ', 'ITEMS_READ', 'CUSTOMERS_READ',
    'ORDERS_READ', 'PAYMENTS_READ', 'INVENTORY_READ',
  ].join('+')
  return `${SQUARE_BASE}/oauth2/authorize?client_id=${appId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`
}

export async function exchangeSquareCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_at: string; merchant_id: string
} | null> {
  const r = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Square-Version': '2024-01-17' },
    body: JSON.stringify({
      client_id: process.env.SQUARE_APPLICATION_ID,
      client_secret: process.env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.SQUARE_REDIRECT_URI,
    }),
  })
  if (!r.ok) return null
  const d = await r.json() as Record<string, unknown>
  return {
    access_token: String(d.access_token ?? ''),
    refresh_token: String(d.refresh_token ?? ''),
    expires_at: String(d.expires_at ?? ''),
    merchant_id: String(d.merchant_id ?? ''),
  }
}

async function squareGet(path: string, token: string): Promise<unknown> {
  const r = await fetch(`${SQUARE_BASE}/v2${path}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Square-Version': '2024-01-17' },
  })
  if (!r.ok) throw new Error(`Square API ${path} returned ${r.status}`)
  return r.json()
}

async function squarePost(path: string, token: string, body: object): Promise<unknown> {
  const r = await fetch(`${SQUARE_BASE}/v2${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Square-Version': '2024-01-17',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`Square API ${path} returned ${r.status}`)
  return r.json()
}

export async function syncSquareProducts(businessId: string, token: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'square', 'catalog_sync')
  let cursor: string | undefined
  let totalSynced = 0
  const allItems: object[] = []

  try {
    do {
      const body: Record<string, unknown> = {
        object_types: ['ITEM'], include_deleted_objects: false, include_related_objects: true,
      }
      if (cursor) body.cursor = cursor
      const res = await squarePost('/catalog/search', token, body) as Record<string, unknown>
      const objects = (res.objects as unknown[]) ?? []
      cursor = res.cursor as string | undefined

      for (const obj of objects) {
        const item = obj as Record<string, unknown>
        if (item.type !== 'ITEM') continue
        const itemData = item.item_data as Record<string, unknown>
        const variations = (itemData?.variations as unknown[]) ?? []

        for (const v of variations) {
          const variation = v as Record<string, unknown>
          const varData = variation.item_variation_data as Record<string, unknown>
          const priceMoney = varData?.price_money as Record<string, unknown>
          allItems.push({
            business_id: businessId,
            square_item_id: String(item.id),
            square_variation_id: String(variation.id),
            name: String(itemData?.name ?? 'Unknown'),
            description: itemData?.description ? String(itemData.description) : null,
            category: null,
            price_cents: Number(priceMoney?.amount) || 0,
            sku: varData?.sku ? String(varData.sku) : null,
            barcode: null,
            track_inventory: true,
            current_stock: 0,
            last_updated_at: new Date().toISOString(),
          })
        }
      }
    } while (cursor)

    for (let i = 0; i < allItems.length; i += 250) {
      await supabaseAdmin.from('square_items')
        .upsert(allItems.slice(i, i + 250), { onConflict: 'business_id,square_item_id', ignoreDuplicates: false })
    }

    await syncSquareItemsToPosProducts(businessId)
    totalSynced = allItems.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

async function syncSquareItemsToPosProducts(businessId: string): Promise<void> {
  const { data: items } = await supabaseAdmin.from('square_items').select('*').eq('business_id', businessId)
  if (!items?.length) return

  const products = items.map(item => ({
    business_id: businessId,
    name: String(item.name),
    description: item.description ?? null,
    category: item.category ?? null,
    // CRITICAL: price_cents (CENTS) → price (DOLLARS)
    price: (Number(item.price_cents) || 0) / 100,
    cost_price: (Number(item.cost_cents) || 0) / 100,
    sku: item.sku ?? null,
    barcode: item.barcode ?? null,
    stock_quantity: Number(item.current_stock) || 0,
    track_inventory: Boolean(item.track_inventory),
    image_url: item.image_url ?? null,
    square_item_id: String(item.square_item_id),
    square_variation_id: item.square_variation_id ?? null,
    source: 'square',
    is_active: true,
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < products.length; i += 250) {
    await supabaseAdmin.from('pos_products')
      .upsert(products.slice(i, i + 250), { onConflict: 'business_id,square_item_id', ignoreDuplicates: false })
  }
}

export async function syncSquareCustomers(businessId: string, token: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'square', 'customer_sync')
  let cursor: string | undefined
  let totalSynced = 0

  try {
    const allCustomers: object[] = []
    do {
      const params = new URLSearchParams({ limit: '100' })
      if (cursor) params.set('cursor', cursor)
      const res = await squareGet(`/customers?${params}`, token) as Record<string, unknown>
      const customers = (res.customers as unknown[]) ?? []
      cursor = res.cursor as string | undefined

      for (const c of customers) {
        const cu = c as Record<string, unknown>
        allCustomers.push({
          business_id: businessId,
          square_customer_id: String(cu.id),
          name: [cu.given_name, cu.family_name].filter(Boolean).join(' ') || 'Unknown',
          email: cu.email_address ? String(cu.email_address) : null,
          phone: cu.phone_number ? String(cu.phone_number) : null,
          first_visit_at: cu.created_at ?? null,
          last_visit_at: cu.updated_at ?? null,
          visit_count: 0,
          total_spent_cents: 0,
          churn_risk: 'low',
        })
      }
    } while (cursor)

    for (let i = 0; i < allCustomers.length; i += 250) {
      await supabaseAdmin.from('square_customers')
        .upsert(allCustomers.slice(i, i + 250), { onConflict: 'business_id,square_customer_id', ignoreDuplicates: false })
    }

    await syncSquareCustomersToPosCustomers(businessId)
    totalSynced = allCustomers.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

async function syncSquareCustomersToPosCustomers(businessId: string): Promise<void> {
  const { data: customers } = await supabaseAdmin.from('square_customers').select('*').eq('business_id', businessId)
  if (!customers?.length) return

  const posCustomers = customers.map(c => ({
    business_id: businessId,
    name: String(c.name ?? 'Unknown'),
    email: c.email ?? null,
    phone: c.phone ?? null,
    // CRITICAL: total_spent_cents (CENTS) → total_spent (DOLLARS)
    total_spent: (Number(c.total_spent_cents) || 0) / 100,
    visit_count: Number(c.visit_count) || 0,
    last_visit_at: c.last_visit_at ?? null,
    square_customer_id: String(c.square_customer_id),
    source: 'square',
    marketing_consent: false,
    updated_at: new Date().toISOString(),
  }))

  for (let i = 0; i < posCustomers.length; i += 250) {
    await supabaseAdmin.from('pos_customers')
      .upsert(posCustomers.slice(i, i + 250), { onConflict: 'business_id,square_customer_id', ignoreDuplicates: false })
  }
}

export async function syncSquareSales(businessId: string, token: string, monthsBack = 12): Promise<number> {
  const eventId = await logSyncStart(businessId, 'square', 'sales_sync')
  let cursor: string | undefined
  let totalSynced = 0

  try {
    const since = new Date()
    since.setMonth(since.getMonth() - monthsBack)
    const allSales: object[] = []

    do {
      const body: Record<string, unknown> = {
        location_ids: [],
        query: {
          filter: {
            date_time_filter: { created_at: { start_at: since.toISOString() } },
            state_filter: { states: ['COMPLETED'] },
          },
        },
        limit: 500,
      }
      if (cursor) body.cursor = cursor
      const res = await squarePost('/orders/search', token, body) as Record<string, unknown>
      const orders = (res.orders as unknown[]) ?? []
      cursor = res.cursor as string | undefined

      for (const o of orders) {
        const order = o as Record<string, unknown>
        const totalMoney = order.total_money as Record<string, unknown>
        const taxMoney = order.total_tax_money as Record<string, unknown>
        const discountMoney = order.total_discount_money as Record<string, unknown>
        allSales.push({
          business_id: businessId,
          square_order_id: String(order.id),
          total_cents: Number(totalMoney?.amount) || 0,
          tax_cents: Number(taxMoney?.amount) || 0,
          discount_cents: Number(discountMoney?.amount) || 0,
          line_items: (order.line_items as unknown[]) ?? [],
          payment_method: 'card',
          sold_at: order.created_at ?? new Date().toISOString(),
          location_id: order.location_id ? String(order.location_id) : null,
        })
      }
    } while (cursor)

    for (let i = 0; i < allSales.length; i += 250) {
      await supabaseAdmin.from('square_sales')
        .upsert(allSales.slice(i, i + 250), { onConflict: 'business_id,square_order_id', ignoreDuplicates: false })
    }

    await syncSquareSalesToPosSales(businessId)
    totalSynced = allSales.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

async function syncSquareSalesToPosSales(businessId: string): Promise<void> {
  const { data: sales } = await supabaseAdmin.from('square_sales').select('*').eq('business_id', businessId)
  if (!sales?.length) return

  const posSales = sales.map(s => ({
    business_id: businessId,
    // CRITICAL: total_cents (CENTS) → total_amount (DOLLARS)
    total_amount: (Number(s.total_cents) || 0) / 100,
    payment_method: s.payment_method ?? 'card',
    customer_name: s.customer_name ?? null,
    customer_phone: s.customer_phone ?? null,
    status: 'completed',
    square_order_id: String(s.square_order_id),
    source: 'square',
    created_at: s.sold_at,
  }))

  for (let i = 0; i < posSales.length; i += 250) {
    await supabaseAdmin.from('pos_sales')
      .upsert(posSales.slice(i, i + 250), { onConflict: 'business_id,square_order_id', ignoreDuplicates: false })
  }
}

export async function runSquareFullSync(businessId: string): Promise<{
  products: number; customers: number; sales: number
}> {
  // SEC-5 — read the decrypted token from the encrypted pos_oauth_integrations store
  const tokens = await getSquareTokens(businessId)
  if (!tokens?.access_token) throw new Error('No Square connection found')

  const token = tokens.access_token
  await setSquareSyncStatus(businessId, 'syncing')

  try {
    const [products, customers, sales] = await Promise.all([
      syncSquareProducts(businessId, token),
      syncSquareCustomers(businessId, token),
      syncSquareSales(businessId, token, 12),
    ])

    await setSquareSyncStatus(businessId, 'connected', null)
    await supabaseAdmin.from('businesses').update({ square_connected: true }).eq('id', businessId)

    return { products, customers, sales }
  } catch (e) {
    await setSquareSyncStatus(businessId, 'error', String(e))
    throw e
  }
}
