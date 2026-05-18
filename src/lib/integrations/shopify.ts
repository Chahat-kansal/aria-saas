import { supabaseAdmin } from '@/lib/supabase-admin'
import { logSyncStart, logSyncComplete } from './sync-logger'

function shopifyBase(storeUrl: string): string {
  const url = storeUrl.replace(/\/$/, '')
  return url.startsWith('http') ? url : `https://${url}`
}

// GraphQL helper — REST /products.json and /customers.json are deprecated
// for new public apps from April 1 2025
async function shopifyGraphQL(
  storeUrl: string,
  token: string,
  query: string,
  variables?: object,
): Promise<unknown> {
  const base = shopifyBase(storeUrl)
  const r = await fetch(`${base}/admin/api/2025-01/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!r.ok) throw new Error(`Shopify GraphQL ${r.status}: ${await r.text()}`)
  const json = await r.json() as { data?: unknown; errors?: unknown[] }
  if (json.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`)
  return json.data
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
  let cursor: string | null = null
  let hasMore = true
  let totalSynced = 0

  const QUERY = `
    query Products($cursor: String) {
      products(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id title descriptionHtml productType vendor status tags
            images(first: 1) { edges { node { url } } }
            variants(first: 1) {
              edges {
                node {
                  id sku barcode price compareAtPrice inventoryQuantity
                  inventoryItem { tracked }
                }
              }
            }
          }
        }
      }
    }
  `

  try {
    const allProducts: object[] = []

    while (hasMore) {
      const data = await shopifyGraphQL(storeUrl, token, QUERY,
        cursor ? { cursor } : {}) as Record<string, unknown>

      const products = data?.products as Record<string, unknown>
      const edges = (products?.edges as unknown[]) ?? []
      const pageInfo = products?.pageInfo as Record<string, unknown>
      hasMore = Boolean(pageInfo?.hasNextPage)
      cursor = (pageInfo?.endCursor as string) ?? null

      for (const edge of edges) {
        const node = (edge as Record<string, unknown>).node as Record<string, unknown>
        const varEdges = ((node.variants as Record<string, unknown>)?.edges as unknown[]) ?? []
        const firstVariant = varEdges.length
          ? ((varEdges[0] as Record<string, unknown>).node as Record<string, unknown>)
          : {} as Record<string, unknown>
        const imgEdges = ((node.images as Record<string, unknown>)?.edges as unknown[]) ?? []
        const imageUrl = imgEdges.length
          ? ((imgEdges[0] as Record<string, unknown>).node as Record<string, unknown>)?.url
          : null

        // GraphQL price is STRING like "9.99" — DOLLARS directly, never /100
        const price = Number(firstVariant.price as string ?? '0') || 0
        const compareAtPrice = Number(firstVariant.compareAtPrice as string ?? '0') || 0

        const gid = String(node.id ?? '')
        const shopifyProductId = gid.split('/').pop() ?? gid
        const varGid = String(firstVariant.id ?? '')
        const shopifyVariantId = varGid.split('/').pop() ?? varGid

        allProducts.push({
          business_id: businessId,
          name: String(node.title ?? 'Unknown'),
          description: node.descriptionHtml
            ? String(node.descriptionHtml).replace(/<[^>]+>/g, '').trim() || null
            : null,
          category: node.productType ? String(node.productType) : null,
          brand: node.vendor ? String(node.vendor) : null,
          price,
          cost_price: compareAtPrice,
          sku: firstVariant.sku ? String(firstVariant.sku) : null,
          barcode: firstVariant.barcode ? String(firstVariant.barcode) : null,
          shopify_product_id: shopifyProductId,
          shopify_variant_id: shopifyVariantId,
          image_url: imageUrl ? String(imageUrl) : null,
          tags: Array.isArray(node.tags)
            ? (node.tags as string[])
            : String(node.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean),
          source: 'shopify',
          is_active: node.status === 'ACTIVE',
          track_inventory: Boolean(
            (firstVariant.inventoryItem as Record<string, unknown>)?.tracked
          ),
          stock_quantity: Number(firstVariant.inventoryQuantity) || 0,
          updated_at: new Date().toISOString(),
        })
      }
    }

    for (let i = 0; i < allProducts.length; i += 250) {
      await supabaseAdmin.from('pos_products')
        .upsert(allProducts.slice(i, i + 250) as never[], {
          onConflict: 'business_id,shopify_product_id', ignoreDuplicates: false,
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

export async function syncShopifyCustomers(businessId: string, storeUrl: string, token: string): Promise<number> {
  const eventId = await logSyncStart(businessId, 'shopify', 'customer_sync')
  let cursor: string | null = null
  let hasMore = true
  let totalSynced = 0

  const QUERY = `
    query Customers($cursor: String) {
      customers(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id firstName lastName email phone ordersCount
            totalSpentV2 { amount currencyCode }
            lastOrder { createdAt }
            acceptsMarketing tags
          }
        }
      }
    }
  `

  try {
    const allCustomers: object[] = []

    while (hasMore) {
      const data = await shopifyGraphQL(storeUrl, token, QUERY,
        cursor ? { cursor } : {}) as Record<string, unknown>

      const customers = data?.customers as Record<string, unknown>
      const edges = (customers?.edges as unknown[]) ?? []
      const pageInfo = customers?.pageInfo as Record<string, unknown>
      hasMore = Boolean(pageInfo?.hasNextPage)
      cursor = (pageInfo?.endCursor as string) ?? null

      for (const edge of edges) {
        const node = (edge as Record<string, unknown>).node as Record<string, unknown>
        const totalSpent = node.totalSpentV2 as Record<string, unknown>
        const gid = String(node.id ?? '')
        const shopifyCustomerId = gid.split('/').pop() ?? gid

        // totalSpentV2.amount is STRING like "150.00" — DOLLARS directly
        allCustomers.push({
          business_id: businessId,
          name: [node.firstName, node.lastName].filter(Boolean).join(' ') || 'Unknown',
          email: node.email ? String(node.email) : null,
          phone: node.phone ? String(node.phone) : null,
          total_spent: Number(totalSpent?.amount ?? '0') || 0,
          visit_count: Number(node.ordersCount) || 0,
          last_visit_at: node.lastOrder
            ? (node.lastOrder as Record<string, unknown>).createdAt ?? null
            : null,
          shopify_customer_id: shopifyCustomerId,
          source: 'shopify',
          marketing_consent: Boolean(node.acceptsMarketing),
          tags: Array.isArray(node.tags) ? node.tags : [],
          updated_at: new Date().toISOString(),
        })
      }
    }

    for (let i = 0; i < allCustomers.length; i += 250) {
      await supabaseAdmin.from('pos_customers')
        .upsert(allCustomers.slice(i, i + 250) as never[], {
          onConflict: 'business_id,shopify_customer_id', ignoreDuplicates: false,
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
