import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'

const LS_OAUTH_BASE = 'https://secure.retail.lightspeed.app'
const LS_TOKEN_URL = 'https://cloud.lightspeedhq.com/oauth/access_token'
const LS_SCOPES = 'products:read customers:read sales:read inventory:read'

export function getLightspeedXOAuthUrl(domainPrefix: string, state: string): string {
  const clientId = process.env.LIGHTSPEED_X_CLIENT_ID ?? ''
  const redirectUri = encodeURIComponent(process.env.LIGHTSPEED_X_REDIRECT_URI ?? '')
  const scopes = encodeURIComponent(LS_SCOPES)
  return `${LS_OAUTH_BASE}/connect?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}&scope=${scopes}`
}

export async function exchangeLightspeedXCode(domainPrefix: string, code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
} | null> {
  const r = await fetch(LS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.LIGHTSPEED_X_CLIENT_ID ?? '',
      client_secret: process.env.LIGHTSPEED_X_CLIENT_SECRET ?? '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.LIGHTSPEED_X_REDIRECT_URI ?? '',
    }).toString(),
  })
  if (!r.ok) return null
  return r.json()
}

function lsApiBase(domainPrefix: string): string {
  return `https://${domainPrefix}.retail.lightspeed.app/api/2.0`
}

async function lsGet(domainPrefix: string, token: string, path: string): Promise<unknown> {
  const r = await fetch(`${lsApiBase(domainPrefix)}${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (r.status === 401) throw new Error('LIGHTSPEED_X_UNAUTHORIZED')
  if (!r.ok) throw new Error(`Lightspeed X API ${path} returned ${r.status}`)
  return r.json()
}

export async function refreshLightspeedXToken(businessId: string, refreshToken: string): Promise<string | null> {
  const r = await fetch(LS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.LIGHTSPEED_X_CLIENT_ID ?? '',
      client_secret: process.env.LIGHTSPEED_X_CLIENT_SECRET ?? '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  })
  if (!r.ok) return null
  const data = await r.json() as { access_token: string; expires_in: number }
  const expiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString()
  await supabaseAdmin.from('lightspeed_connections').update({
    access_token: data.access_token,
    token_expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_type', 'x_series')
  return data.access_token
}

async function getValidToken(businessId: string): Promise<{ token: string; domainPrefix: string } | null> {
  const { data: conn } = await supabaseAdmin.from('lightspeed_connections')
    .select('access_token, refresh_token, token_expires_at, domain_prefix, account_id')
    .eq('business_id', businessId).eq('integration_type', 'x_series').maybeSingle()
  if (!conn) return null

  const prefix = (conn.domain_prefix ?? conn.account_id) as string | null
  if (!prefix) return null

  if (conn.token_expires_at) {
    const expiresAt = new Date(conn.token_expires_at as string).getTime()
    if (Date.now() > expiresAt - 300_000 && conn.refresh_token) {
      const newToken = await refreshLightspeedXToken(businessId, conn.refresh_token as string)
      if (newToken) return { token: newToken, domainPrefix: prefix }
    }
  }

  return { token: conn.access_token as string, domainPrefix: prefix }
}

export async function syncLightspeedXProducts(businessId: string): Promise<number> {
  const conn = await getValidToken(businessId)
  if (!conn) throw new Error('No Lightspeed X connection')
  const { token, domainPrefix } = conn

  const eventId = await logSyncStart(businessId, 'lightspeed_x', 'product_sync')
  let after: string | undefined
  let totalSynced = 0
  const allProducts: object[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const params = new URLSearchParams({ page_size: '100' })
      if (after) params.set('after', after)
      const res = await lsGet(domainPrefix, token, `/products?${params}`) as Record<string, unknown>
      const data = (res.data as unknown[]) ?? []
      const cursor = res.cursor as Record<string, unknown>
      after = cursor?.next as string | undefined
      hasMore = !!after && data.length > 0

      for (const p of data) {
        const prod = p as Record<string, unknown>
        // X-Series prices are STRING DOLLARS — Number() directly, never /100
        const price = Number(String(prod.price ?? '0').replace(/[^0-9.]/g, '')) || 0
        const costPrice = Number(String(prod.cost ?? '0').replace(/[^0-9.]/g, '')) || 0

        allProducts.push({
          business_id: businessId,
          name: String(prod.name ?? 'Unknown'),
          description: prod.description ? String(prod.description) : null,
          category: prod.type ? String(prod.type) : null,
          brand: prod.brand ? String(prod.brand) : null,
          supplier_name: prod.supplier_name ? String(prod.supplier_name) : null,
          price,
          cost_price: costPrice,
          sku: prod.sku ? String(prod.sku) : null,
          barcode: prod.barcode ? String(prod.barcode) : null,
          lightspeed_product_id: String(prod.id ?? ''),
          image_url: prod.image ? String(prod.image) : null,
          source: 'lightspeed_x',
          is_active: prod.active !== false,
          track_inventory: Boolean(prod.track_inventory),
          stock_quantity: Math.round(Number(prod.count) || 0),
          reorder_point: prod.reorder_point ? Math.round(Number(prod.reorder_point)) : null,
          updated_at: new Date().toISOString(),
        })
      }
    }

    for (let i = 0; i < allProducts.length; i += 250) {
      await supabaseAdmin.from('pos_products')
        .upsert(allProducts.slice(i, i + 250) as never[], {
          onConflict: 'business_id,lightspeed_product_id', ignoreDuplicates: false,
        })
    }

    totalSynced = allProducts.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

export async function syncLightspeedXCustomers(businessId: string): Promise<number> {
  const conn = await getValidToken(businessId)
  if (!conn) throw new Error('No Lightspeed X connection')
  const { token, domainPrefix } = conn

  const eventId = await logSyncStart(businessId, 'lightspeed_x', 'customer_sync')
  let after: string | undefined
  let totalSynced = 0
  const allCustomers: object[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const params = new URLSearchParams({ page_size: '100' })
      if (after) params.set('after', after)
      const res = await lsGet(domainPrefix, token, `/customers?${params}`) as Record<string, unknown>
      const data = (res.data as unknown[]) ?? []
      const cursor = res.cursor as Record<string, unknown>
      after = cursor?.next as string | undefined
      hasMore = !!after && data.length > 0

      for (const c of data) {
        const cu = c as Record<string, unknown>
        allCustomers.push({
          business_id: businessId,
          name: [cu.first_name, cu.last_name].filter(Boolean).join(' ') || 'Unknown',
          email: cu.email ? String(cu.email) : null,
          phone: cu.phone ? String(cu.phone) : null,
          total_spent: Number(String(cu.balance ?? '0').replace(/[^0-9.]/g, '')) || 0,
          lightspeed_customer_id: String(cu.id ?? ''),
          source: 'lightspeed_x',
          marketing_consent: false,
          updated_at: new Date().toISOString(),
        })
      }
    }

    for (let i = 0; i < allCustomers.length; i += 250) {
      await supabaseAdmin.from('pos_customers')
        .upsert(allCustomers.slice(i, i + 250) as never[], {
          onConflict: 'business_id,lightspeed_customer_id', ignoreDuplicates: false,
        })
    }

    totalSynced = allCustomers.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

export async function syncLightspeedXSales(businessId: string, monthsBack = 12): Promise<number> {
  const conn = await getValidToken(businessId)
  if (!conn) throw new Error('No Lightspeed X connection')
  const { token, domainPrefix } = conn

  const eventId = await logSyncStart(businessId, 'lightspeed_x', 'sales_sync')
  const since = new Date()
  since.setMonth(since.getMonth() - monthsBack)
  let after: string | undefined
  let totalSynced = 0
  const allSales: object[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const params = new URLSearchParams({ page_size: '100', since: since.toISOString() })
      if (after) params.set('after', after)
      const res = await lsGet(domainPrefix, token, `/sales?${params}`) as Record<string, unknown>
      const data = (res.data as unknown[]) ?? []
      const cursor = res.cursor as Record<string, unknown>
      after = cursor?.next as string | undefined
      hasMore = !!after && data.length > 0

      for (const s of data) {
        const sale = s as Record<string, unknown>
        // X-Series totals are DOLLARS — never /100
        const totalAmount = Number(String(sale.total_price ?? '0').replace(/[^0-9.]/g, '')) || 0
        const taxAmount = Number(String(sale.tax_total ?? '0').replace(/[^0-9.]/g, '')) || 0

        allSales.push({
          business_id: businessId,
          total_amount: totalAmount,
          payment_method: 'card',
          status: 'completed',
          lightspeed_order_id: String(sale.id ?? ''),
          source: 'lightspeed_x',
          created_at: sale.sale_date ?? new Date().toISOString(),
        })
      }
    }

    for (let i = 0; i < allSales.length; i += 250) {
      await supabaseAdmin.from('pos_sales')
        .upsert(allSales.slice(i, i + 250) as never[], {
          onConflict: 'business_id,lightspeed_order_id', ignoreDuplicates: false,
        })
    }

    totalSynced = allSales.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

export async function runLightspeedXFullSync(businessId: string): Promise<{
  products: number; customers: number; sales: number
}> {
  await supabaseAdmin.from('lightspeed_connections').update({
    sync_status: 'syncing', updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_type', 'x_series')

  try {
    const [products, customers, sales] = await Promise.all([
      syncLightspeedXProducts(businessId),
      syncLightspeedXCustomers(businessId),
      syncLightspeedXSales(businessId, 12),
    ])

    await supabaseAdmin.from('lightspeed_connections').update({
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('integration_type', 'x_series')

    return { products, customers, sales }
  } catch (e) {
    await supabaseAdmin.from('lightspeed_connections').update({
      sync_status: 'error', sync_error: String(e), updated_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('integration_type', 'x_series')
    throw e
  }
}
