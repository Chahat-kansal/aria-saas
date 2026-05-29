import Anthropic from '@anthropic-ai/sdk'

export interface MarketPriceResult {
  source_name: string
  source_url: string
  shelf_price: number    // dollars
  confidence: 'high' | 'medium' | 'low'
  search_query: string
}

// SSRF allowlist — only known Australian retailer domains
const ALLOWED_DOMAINS = new Set([
  'www.danmurphys.com.au',
  'danmurphys.com.au',
  'bws.com.au',
  'www.bws.com.au',
  'www.liquorland.com.au',
  'liquorland.com.au',
  'www.coles.com.au',
  'coles.com.au',
  'www.woolworths.com.au',
  'woolworths.com.au',
  'www.costco.com.au',
  'costco.com.au',
  'www.amazon.com.au',
  'amazon.com.au',
  'www.ubereats.com',
  'ubereats.com',
  'www.menulog.com.au',
  'menulog.com.au',
  'www.iga.com.au',
  'iga.com.au',
  'www.chemistwarehouse.com.au',
  'chemistwarehouse.com.au',
])

const SOURCE_NAMES: Record<string, string> = {
  'www.danmurphys.com.au': "Dan Murphy's",
  'danmurphys.com.au': "Dan Murphy's",
  'bws.com.au': 'BWS',
  'www.bws.com.au': 'BWS',
  'www.liquorland.com.au': 'Liquorland',
  'liquorland.com.au': 'Liquorland',
  'www.coles.com.au': 'Coles',
  'coles.com.au': 'Coles',
  'www.woolworths.com.au': 'Woolworths',
  'woolworths.com.au': 'Woolworths',
  'www.costco.com.au': 'Costco',
  'costco.com.au': 'Costco',
  'www.amazon.com.au': 'Amazon AU',
  'amazon.com.au': 'Amazon AU',
  'www.ubereats.com': 'Uber Eats',
  'ubereats.com': 'Uber Eats',
  'www.menulog.com.au': 'Menulog',
  'menulog.com.au': 'Menulog',
}

const RETAILER_SEARCH_URLS: Record<string, string[]> = {
  liquor: [
    'https://www.danmurphys.com.au/search?searchTerm={query}',
    'https://bws.com.au/search/{query}',
    'https://www.liquorland.com.au/liquor/search?searchTerm={query}',
  ],
  cafe: [
    'https://www.coles.com.au/search?q={query}',
    'https://www.woolworths.com.au/shop/search/products?searchTerm={query}',
    'https://www.costco.com.au/search?q={query}',
  ],
  retail: [
    'https://www.coles.com.au/search?q={query}',
    'https://www.woolworths.com.au/shop/search/products?searchTerm={query}',
    'https://www.amazon.com.au/s?k={query}',
  ],
  bakery: [
    'https://www.coles.com.au/search?q={query}',
    'https://www.woolworths.com.au/shop/search/products?searchTerm={query}',
  ],
  restaurant: [
    'https://www.ubereats.com/au/feed?q={query}',
    'https://www.menulog.com.au/search?term={query}',
  ],
  convenience: [
    'https://www.coles.com.au/search?q={query}',
    'https://www.woolworths.com.au/shop/search/products?searchTerm={query}',
  ],
  warehouse: [
    'https://www.costco.com.au/search?q={query}',
    'https://www.amazon.com.au/s?k={query}',
  ],
}

const UA = 'Mozilla/5.0 (compatible; AriaBot/1.0)'
const MAX_HTML_BYTES = 50 * 1024   // 50KB — price data is near the top
const POLITE_DELAY_MS = 2000
const SAME_DOMAIN_DELAY_MS = 5000

function isAllowedUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_DOMAINS.has(u.hostname)
  } catch { return false }
}

async function fetchCapped(url: string): Promise<string | null> {
  if (!isAllowedUrl(url)) return null
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    const ct = (res.headers.get('content-type') ?? '').toLowerCase()
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) return null
    const reader = res.body?.getReader()
    if (!reader) { const t = await res.text(); return t.slice(0, MAX_HTML_BYTES) }
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        total += value.length
        chunks.push(value)
        if (total >= MAX_HTML_BYTES) { await reader.cancel().catch(() => {}); break }
      }
    }
    const merged = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
    let off = 0
    for (const c of chunks) { merged.set(c, off); off += c.length }
    return new TextDecoder('utf-8').decode(merged)
  } catch { return null }
}

interface HaikuPriceResult { found: boolean; price: number | null; product_name: string | null }

async function extractPriceWithHaiku(productName: string, html: string): Promise<HaikuPriceResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    // Trim HTML to ~12KB for Haiku — keeps cost down
    const snippet = html.slice(0, 12000)
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `Extract the price of "${productName}" from this search result HTML.\nReturn JSON: { "found": true/false, "price": number_or_null, "product_name": string_or_null }\nIf multiple results, return the lowest price for the most closely matching product.\nIf no clear match, return { "found": false }.\nOnly return JSON, nothing else.\n\n${snippet}`,
      }],
    })
    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as HaikuPriceResult
    return parsed
  } catch { return null }
}

// Strategy B — Google Custom Search fallback
async function googleCustomSearch(productName: string): Promise<MarketPriceResult[]> {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX
  if (!apiKey || !cx) return []

  try {
    const q = encodeURIComponent(`${productName} price australia`)
    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${q}&num=5`
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json() as { items?: Array<{ link: string; snippet: string; displayLink: string }> }
    const results: MarketPriceResult[] = []
    const priceRegex = /\$[\d,]+\.?\d*/g

    for (const item of (data.items ?? [])) {
      const hostname = (() => { try { return new URL(item.link).hostname } catch { return '' } })()
      const sourceName = SOURCE_NAMES[hostname]
      if (!sourceName) continue
      const matches = item.snippet.match(priceRegex)
      if (!matches) continue
      for (const m of matches) {
        const price = parseFloat(m.replace(/[$,]/g, ''))
        if (price > 0 && price < 10000) {
          results.push({
            source_name: sourceName,
            source_url: item.link,
            shelf_price: price,
            confidence: 'low',
            search_query: `${productName} price australia`,
          })
          break
        }
      }
      if (results.length >= 2) break
    }
    return results
  } catch { return [] }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Search for market prices of a product across Australian retailers.
 * Strategy A: HTML fetch + Haiku extraction (primary, always runs).
 * Strategy B: Google Custom Search (fallback if GOOGLE_CUSTOM_SEARCH_CX set).
 */
export async function searchMarketPrice(
  productName: string,
  productCategory: string,
  industry: string,
  _businessSuburb?: string
): Promise<MarketPriceResult[]> {
  const normalizedIndustry = industry?.toLowerCase() ?? 'retail'
  const templates = RETAILER_SEARCH_URLS[normalizedIndustry] ?? RETAILER_SEARCH_URLS.retail
  const query = encodeURIComponent(productName)
  const results: MarketPriceResult[] = []
  const seenDomains = new Map<string, number>() // domain → last fetch timestamp
  let fetchCount = 0

  // Strategy A
  for (const template of templates.slice(0, 5)) {
    if (results.length >= 5) break
    const url = template.replace('{query}', query)
    if (!isAllowedUrl(url)) continue

    let hostname = ''
    try { hostname = new URL(url).hostname } catch { continue }

    // Polite delays
    const lastFetch = seenDomains.get(hostname)
    const delay = lastFetch
      ? Math.max(0, SAME_DOMAIN_DELAY_MS - (Date.now() - lastFetch))
      : fetchCount > 0 ? POLITE_DELAY_MS : 0
    if (delay > 0) await sleep(delay)

    seenDomains.set(hostname, Date.now())
    fetchCount++

    const html = await fetchCapped(url)
    if (!html) continue

    const parsed = await extractPriceWithHaiku(productName, html)
    if (!parsed?.found || !parsed.price) continue
    if (parsed.price <= 0 || parsed.price >= 10000) continue

    const sourceName = SOURCE_NAMES[hostname] ?? hostname
    // Confidence: high if product_name from Haiku closely matches, medium otherwise
    const confidence: 'high' | 'medium' | 'low' = (() => {
      if (!parsed.product_name) return 'medium'
      const pn = parsed.product_name.toLowerCase()
      const qn = productName.toLowerCase()
      const words = qn.split(/\s+/).filter(w => w.length > 3)
      const matchCount = words.filter(w => pn.includes(w)).length
      if (matchCount >= Math.ceil(words.length * 0.7)) return 'high'
      if (matchCount >= 1) return 'medium'
      return 'low'
    })()

    results.push({
      source_name: sourceName,
      source_url: url,
      shelf_price: parsed.price,
      confidence,
      search_query: productName + (productCategory ? ' ' + productCategory : ''),
    })
  }

  // Strategy B — Google Custom Search fallback
  if (results.length === 0) {
    const googleResults = await googleCustomSearch(productName)
    results.push(...googleResults)
  }

  return results
}
