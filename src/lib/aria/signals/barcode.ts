import { supabaseAdmin } from '@/lib/supabase-admin'
import type { BarcodeProduct } from '../types'

// ─────────────────────────────────────────────────────────────────────
// Availability checks
// ─────────────────────────────────────────────────────────────────────

const GO_UPC_KEY = process.env.GO_UPC_API_KEY ?? ''
const GO_UPC_ENABLED = !!GO_UPC_KEY
export const isGoUpcAvailable = () => GO_UPC_ENABLED

// UPCitemDB free trial requires no key — always available as final fallback
export const isBarcodeLookupAvailable = () => true

// ─────────────────────────────────────────────────────────────────────
// Provider 1 — Go-UPC (paid, preferred: best AU liquor/retail coverage)
// ─────────────────────────────────────────────────────────────────────

async function lookupGoUpc(code: string): Promise<BarcodeProduct | null> {
  if (!GO_UPC_ENABLED) return null
  try {
    const r = await fetch(`https://go-upc.com/api/v1/code/${encodeURIComponent(code)}`, {
      headers: { 'Authorization': `Bearer ${GO_UPC_KEY}` },
      signal: AbortSignal.timeout(7000),
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j?.product?.name) return null
    return {
      name: String(j.product.name),
      brand: j.product.brand ? String(j.product.brand) : undefined,
      category: j.product.category ? String(j.product.category) : undefined,
      image_url: j.product.imageUrl ? String(j.product.imageUrl) : undefined,
      source: 'go-upc',
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────
// Provider 2 — UPCitemDB free trial (final fallback, 100/day per IP, no key)
// ─────────────────────────────────────────────────────────────────────

async function lookupUpcItemDb(code: string): Promise<BarcodeProduct | null> {
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(7000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const item = j.items?.[0]
    if (!item?.title) return null
    return {
      name: String(item.title),
      brand: item.brand ? String(item.brand) : undefined,
      category: item.category ? String(item.category) : undefined,
      image_url: item.images?.[0] ? String(item.images[0]) : undefined,
      source: 'upcitemdb',
    }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public entry: tries providers in priority order, caches success 30 days
// ─────────────────────────────────────────────────────────────────────

export async function lookupBarcode(code: string): Promise<BarcodeProduct | null> {
  if (!code || code.trim().length < 6) return null
  const cleaned = code.trim()
  const cacheKey = `barcode:${cleaned}`

  // Cache check (cached results are fastest path)
  try {
    const { data: cached } = await supabaseAdmin.from('aria_signal_cache')
      .select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
    if (cached && new Date(String(cached.expires_at)).getTime() > Date.now()) {
      return cached.payload as BarcodeProduct
    }
  } catch (e) { console.error('[silent-catch]', e) }

  let result: BarcodeProduct | null = null

  // 1. Go-UPC if configured (preferred — best AU alcohol/retail data)
  if (GO_UPC_ENABLED) {
    result = await lookupGoUpc(cleaned)
  }

  // 2. UPCitemDB free trial fallback (no key needed, 100/day per IP)
  if (!result) {
    result = await lookupUpcItemDb(cleaned)
  }

  // Cache successful lookup for 30 days (saves quota + reduces latency)
  if (result) {
    try {
      await supabaseAdmin.from('aria_signal_cache').upsert({
        cache_key: cacheKey,
        signal_type: 'barcode',
        payload: result,
        expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      }, { onConflict: 'cache_key' })
    } catch (e) { console.error('[silent-catch]', e) }
  }

  return result
}
