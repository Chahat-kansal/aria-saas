import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'

const KOUNTA_OAUTH_BASE = 'https://my.kounta.com'
const KOUNTA_API_BASE = 'https://api.kounta.com/v1'
const KOUNTA_TOKEN_URL = 'https://api.kounta.com/oauth/token'

export function isKountaConfigured(): boolean {
  return !!(process.env.KOUNTA_CLIENT_ID && process.env.KOUNTA_CLIENT_SECRET)
}

export function getKountaOAuthUrl(state: string): string {
  const clientId = process.env.KOUNTA_CLIENT_ID ?? ''
  const redirectUri = encodeURIComponent(process.env.KOUNTA_REDIRECT_URI ?? '')
  return `${KOUNTA_OAUTH_BASE}/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&state=${state}`
}

export async function exchangeKountaCode(code: string): Promise<{
  access_token: string; refresh_token: string; expires_in: number
} | null> {
  if (!isKountaConfigured()) return null
  const r = await fetch(KOUNTA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.KOUNTA_CLIENT_ID,
      client_secret: process.env.KOUNTA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: process.env.KOUNTA_REDIRECT_URI,
    }),
  })
  if (!r.ok) return null
  return r.json()
}

async function kountaGet(token: string, path: string): Promise<unknown> {
  const r = await fetch(`${KOUNTA_API_BASE}${path}.json`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!r.ok) throw new Error(`Kounta API ${path} returned ${r.status}`)
  return r.json()
}

export async function syncKountaProducts(businessId: string, token: string, companyId: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'kounta', 'product_sync')
  let page = 1
  let totalSynced = 0
  const allProducts: object[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const res = await kountaGet(token, `/companies/${companyId}/products?page=${page}&per_page=100`) as unknown[]
      if (!Array.isArray(res) || res.length === 0) { hasMore = false; break }

      for (const p of res) {
        const prod = p as Record<string, unknown>
        // CRITICAL: Kounta prices are INTEGER CENTS → /100 = DOLLARS
        const priceCents = Number(prod.price_including_tax ?? prod.price ?? 0)
        const costCents = Number(prod.cost ?? 0)

        allProducts.push({
          business_id: businessId,
          name: String(prod.name ?? 'Unknown'),
          description: prod.description ? String(prod.description) : null,
          category: prod.category ? String(prod.category) : null,
          price: priceCents / 100,
          cost_price: costCents / 100,
          sku: prod.code ? String(prod.code) : null,
          barcode: prod.barcode ? String(prod.barcode) : null,
          lightspeed_product_id: String(prod.id ?? ''),
          source: 'kounta',
          is_active: prod.active !== false,
          track_inventory: prod.count_of_stock_on_hand !== undefined && prod.count_of_stock_on_hand !== null,
          stock_quantity: Math.round(Number(prod.count_of_stock_on_hand ?? 0)),
          updated_at: new Date().toISOString(),
        })
      }

      hasMore = res.length === 100
      page++
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

export async function syncKountaCustomers(businessId: string, token: string, companyId: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'kounta', 'customer_sync')
  let page = 1
  let totalSynced = 0
  const allCustomers: object[] = []

  try {
    let hasMore = true
    while (hasMore) {
      const res = await kountaGet(token, `/companies/${companyId}/customers?page=${page}&per_page=100`) as unknown[]
      if (!Array.isArray(res) || res.length === 0) { hasMore = false; break }

      for (const c of res) {
        const cu = c as Record<string, unknown>
        allCustomers.push({
          business_id: businessId,
          name: [cu.first_name, cu.last_name].filter(Boolean).join(' ') || 'Unknown',
          email: cu.email ? String(cu.email) : null,
          phone: cu.mobile_phone ? String(cu.mobile_phone) : (cu.phone ? String(cu.phone) : null),
          lightspeed_customer_id: String(cu.id ?? ''),
          source: 'kounta',
          marketing_consent: false,
          updated_at: new Date().toISOString(),
        })
      }

      hasMore = res.length === 100
      page++
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

export async function runKountaFullSync(businessId: string): Promise<{ products: number; customers: number }> {
  if (!isKountaConfigured()) {
    throw new Error('Kounta credentials not yet configured. Awaiting developer certification.')
  }

  const { data: conn } = await supabaseAdmin.from('lightspeed_connections')
    .select('access_token, kounta_company_id')
    .eq('business_id', businessId).eq('integration_type', 'kounta').maybeSingle()
  if (!conn?.access_token || !conn.kounta_company_id) throw new Error('No Kounta connection found')

  await supabaseAdmin.from('lightspeed_connections').update({
    sync_status: 'syncing', updated_at: new Date().toISOString(),
  }).eq('business_id', businessId).eq('integration_type', 'kounta')

  try {
    const [products, customers] = await Promise.all([
      syncKountaProducts(businessId, conn.access_token as string, conn.kounta_company_id as string),
      syncKountaCustomers(businessId, conn.access_token as string, conn.kounta_company_id as string),
    ])

    await supabaseAdmin.from('lightspeed_connections').update({
      sync_status: 'connected',
      last_synced_at: new Date().toISOString(),
      sync_error: null,
      updated_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('integration_type', 'kounta')

    return { products, customers }
  } catch (e) {
    await supabaseAdmin.from('lightspeed_connections').update({
      sync_status: 'error', sync_error: String(e), updated_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('integration_type', 'kounta')
    throw e
  }
}
