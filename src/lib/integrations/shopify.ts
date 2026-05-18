import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'

const SHOPIFY_API_VERSION = '2024-01'

function shopifyBase(storeUrl: string): string {
  const url = storeUrl.replace(/\/$/, '')
  return url.startsWith('http') ? url : `https://${url}`
}

async function shopifyGet(storeUrl: string, token: string, path: string): Promise<unknown> {
  const r = await fetch(`${shopifyBase(storeUrl)}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
  })
  if (!r.ok) throw new Error(`Shopify API ${path} returned ${r.status}`)
  return r.json()
}

export function getShopifyOAuthUrl(shop: string, state: string): string {
  const clientId = process.env.SHOPIFY_CLIENT_ID ?? ''
  const redirectUri = encodeURIComponent(process.env.SHOPIFY_REDIRECT_URI ?? '')
  const scopes = 'read_products,read_customers,read_orders,read_inventory'
  const base = shopifyBase(shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`)
  return `${base}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`
}

export async function exchangeShopifyCode(shop: string, code: string): Promise<{ access_token: string } | null> {
  const r = await fetch(`${shopifyBase(shop)}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  })
  if (!r.ok) return null
  return r.json()
}

export async function syncShopifyProducts(businessId: string, storeUrl: string, token: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'shopify', 'product_sync')
  let totalSynced = 0

  try {
    const allProducts: object[] = []
    let hasMore = true
    let sinceId: string | null = null

    while (hasMore) {
      const params = new URLSearchParams({ limit: '250' })
      if (sinceId) params.set('since_id', sinceId)
      const res = await shopifyGet(storeUrl, token, `/products.json?${params}`) as Record<string, unknown>
      const products = (res.products as unknown[]) ?? []
      hasMore = products.length === 250

      for (const p of products) {
        const prod = p as Record<string, unknown>
        const variants = (prod.variants as unknown[]) ?? []
        const firstVariant = (variants[0] ?? {}) as Record<string, unknown>
        sinceId = String(prod.id)

        // Shopify prices are DOLLARS already (strings like "9.99")
        allProducts.push({
          business_id: businessId,
          name: String(prod.title ?? 'Unknown'),
          description: prod.body_html ? String(prod.body_html).replace(/<[^>]+>/g, '') : null,
          category: prod.product_type ? String(prod.product_type) : null,
          brand: prod.vendor ? String(prod.vendor) : null,
          price: Number(firstVariant.price) || 0,
          cost_price: Number(firstVariant.compare_at_price) || 0,
          sku: firstVariant.sku ? String(firstVariant.sku) : null,
          barcode: firstVariant.barcode ? String(firstVariant.barcode) : null,
          shopify_product_id: String(prod.id),
          shopify_variant_id: String(firstVariant.id ?? ''),
          image_url: (prod.image as Record<string, unknown>)?.src
            ? String((prod.image as Record<string, unknown>).src) : null,
          tags: prod.tags ? String(prod.tags).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          source: 'shopify',
          is_active: prod.status === 'active',
          track_inventory: firstVariant.inventory_management === 'shopify',
          updated_at: new Date().toISOString(),
        })
      }

      if (!hasMore) break
    }

    for (let i = 0; i < allProducts.length; i += 250) {
      await supabaseAdmin.from('pos_products')
        .upsert(allProducts.slice(i, i + 250), { onConflict: 'business_id,shopify_product_id', ignoreDuplicates: false })
    }

    totalSynced = allProducts.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

export async function syncShopifyCustomers(businessId: string, storeUrl: string, token: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'shopify', 'customer_sync')
  let totalSynced = 0

  try {
    const allCustomers: object[] = []
    let hasMore = true
    let sinceId: string | null = null

    while (hasMore) {
      const params = new URLSearchParams({ limit: '250' })
      if (sinceId) params.set('since_id', sinceId)
      const res = await shopifyGet(storeUrl, token, `/customers.json?${params}`) as Record<string, unknown>
      const customers = (res.customers as unknown[]) ?? []
      hasMore = customers.length === 250

      for (const c of customers) {
        const cu = c as Record<string, unknown>
        sinceId = String(cu.id)
        allCustomers.push({
          business_id: businessId,
          name: [cu.first_name, cu.last_name].filter(Boolean).join(' ') || 'Unknown',
          email: cu.email ? String(cu.email) : null,
          phone: cu.phone ? String(cu.phone) : null,
          // Shopify total_spent is already DOLLARS
          total_spent: Number(cu.total_spent) || 0,
          visit_count: Number(cu.orders_count) || 0,
          shopify_customer_id: String(cu.id),
          source: 'shopify',
          marketing_consent: Boolean(cu.accepts_marketing),
          updated_at: new Date().toISOString(),
        })
      }

      if (!hasMore) break
    }

    for (let i = 0; i < allCustomers.length; i += 250) {
      await supabaseAdmin.from('pos_customers')
        .upsert(allCustomers.slice(i, i + 250), { onConflict: 'business_id,shopify_customer_id', ignoreDuplicates: false })
    }

    totalSynced = allCustomers.length
    await logSyncComplete(eventId, totalSynced)
    return totalSynced
  } catch (e) {
    await logSyncComplete(eventId, totalSynced, String(e))
    throw e
  }
}

export async function runShopifyFullSync(businessId: string): Promise<{ products: number; customers: number }> {
  const { data: conn } = await supabaseAdmin.from('shopify_connections')
    .select('store_url, access_token').eq('business_id', businessId).maybeSingle()
  if (!conn?.access_token) throw new Error('No Shopify connection found')

  await supabaseAdmin.from('shopify_connections').update({ sync_status: 'syncing' }).eq('business_id', businessId)

  try {
    const [products, customers] = await Promise.all([
      syncShopifyProducts(businessId, String(conn.store_url), String(conn.access_token)),
      syncShopifyCustomers(businessId, String(conn.store_url), String(conn.access_token)),
    ])

    await supabaseAdmin.from('shopify_connections').update({
      sync_status: 'connected', last_synced_at: new Date().toISOString(), sync_error: null,
    }).eq('business_id', businessId)

    return { products, customers }
  } catch (e) {
    await supabaseAdmin.from('shopify_connections').update({
      sync_status: 'error', sync_error: String(e),
    }).eq('business_id', businessId)
    throw e
  }
}
