import type { MarketPriceResult } from './types'

interface SourceConfig {
  name: string
  buildUrl: (term: string) => string
  parse: (data: any) => { price: number; url: string | null } | null
}

const SOURCES: SourceConfig[] = [
  {
    name: "Dan Murphy's",
    buildUrl: (term) =>
      `https://api.danmurphys.com.au/apis/ui/v3/search?q=${encodeURIComponent(term)}&inStockOnly=false&limit=3`,
    parse: (data) => {
      const product = data?.products?.[0] ?? data?.items?.[0]
      if (!product) return null
      const price = product.price ?? product.nowPrice ?? product.priceValue
      if (!price) return null
      return { price: Number(price), url: product.url ? `https://www.danmurphys.com.au${product.url}` : null }
    },
  },
  {
    name: 'BWS',
    buildUrl: (term) =>
      `https://api.bws.com.au/apis/ui/v3/search?q=${encodeURIComponent(term)}&inStockOnly=false&limit=3`,
    parse: (data) => {
      const product = data?.products?.[0] ?? data?.items?.[0]
      if (!product) return null
      const price = product.price ?? product.nowPrice ?? product.priceValue
      if (!price) return null
      return { price: Number(price), url: product.url ? `https://www.bws.com.au${product.url}` : null }
    },
  },
  {
    name: 'Liquorland',
    buildUrl: (term) =>
      `https://www.liquorland.com.au/api/2.0/page/search?SearchTerm=${encodeURIComponent(term)}&PageSize=3`,
    parse: (data) => {
      const products = data?.Products ?? data?.products ?? []
      const product = products[0]
      if (!product) return null
      const price = product.Price ?? product.price ?? product.NowPrice
      if (!price) return null
      return { price: Number(price), url: product.Url ? `https://www.liquorland.com.au${product.Url}` : null }
    },
  },
  {
    name: 'First Choice',
    buildUrl: (term) =>
      `https://www.firstchoiceliquor.com.au/api/2.0/page/search?SearchTerm=${encodeURIComponent(term)}&PageSize=3`,
    parse: (data) => {
      const products = data?.Products ?? data?.products ?? []
      const product = products[0]
      if (!product) return null
      const price = product.Price ?? product.price ?? product.NowPrice
      if (!price) return null
      return { price: Number(price), url: product.Url ? `https://www.firstchoiceliquor.com.au${product.Url}` : null }
    },
  },
]

async function fetchSource(
  source: SourceConfig,
  searchTerm: string,
  signal?: AbortSignal
): Promise<{ name: string; shelf_price: number; source_url: string | null } | null> {
  try {
    const res = await fetch(source.buildUrl(searchTerm), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; AriaOS retail price check)',
      },
      signal,
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const data = await res.json()
    const result = source.parse(data)
    if (!result) return null
    return { name: source.name, shelf_price: result.price, source_url: result.url }
  } catch (e) {
    console.error(`[market-prices] ${source.name} fetch failed:`, e)
    return null
  }
}

export async function fetchMarketPrices(
  supabase: any,
  productId: string,
  businessId: string,
  barcode: string | null,
  productName: string
): Promise<MarketPriceResult[]> {
  // 1. Check cache
  const { data: cached } = await supabase
    .from('pos_market_price_cache')
    .select('source_name,source_url,shelf_price,fetched_at')
    .eq('product_id', productId)
    .gt('expires_at', new Date().toISOString())
  if (cached?.length) {
    return cached.map((r: any) => ({ ...r, is_cached: true }))
  }

  // 2. Fetch from all sources (prefer barcode for accuracy)
  const searchTerm = barcode ?? productName
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)

  const settled = await Promise.allSettled(
    SOURCES.map(s => fetchSource(s, searchTerm, controller.signal))
  )
  clearTimeout(timeout)

  const results: MarketPriceResult[] = []
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled' || !outcome.value) continue
    const { name, shelf_price, source_url } = outcome.value
    results.push({ source_name: name, source_url, shelf_price, fetched_at: now, is_cached: false })

    // 3. Cache the result — best effort
    supabase.from('pos_market_price_cache').upsert(
      { product_id: productId, business_id: businessId, barcode, source_name: name, source_url, shelf_price, fetched_at: now, expires_at: expires },
      { onConflict: 'product_id,source_name' }
    ).then(() => {}).catch(() => {})
  }

  return results
}
