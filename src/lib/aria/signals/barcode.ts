import { createServerSupabaseClient } from '@/lib/supabase-server'

export interface BarcodeProduct {
  name: string
  brand?: string
  category?: string
  description?: string
  source: string
}

const GO_UPC_KEY = process.env.GO_UPC_API_KEY ?? ''

async function tryGoUPC(barcode: string): Promise<BarcodeProduct | null> {
  if (!GO_UPC_KEY) return null
  try {
    const r = await fetch(`https://api.go-upc.com/barcode/${encodeURIComponent(barcode)}`, {
      headers: { 'Authorization': `Bearer ${GO_UPC_KEY}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j.product?.name) return null
    return { name: j.product.name, brand: j.product.brand, category: j.product.category, source: 'go-upc' }
  } catch { return null }
}

async function tryUPCItemDB(barcode: string): Promise<BarcodeProduct | null> {
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`, {
      signal: AbortSignal.timeout(5_000),
    })
    if (!r.ok) return null
    const j = await r.json()
    const item = j.items?.[0]
    if (!item?.title) return null
    return { name: item.title, brand: item.brand, category: item.category, source: 'upcitemdb' }
  } catch { return null }
}

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct | null> {
  if (!barcode || barcode.length < 6) return null
  const cacheKey = `barcode:${barcode}`
  try {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase.from('aria_signal_cache')
      .select('payload, expires_at').eq('cache_key', cacheKey).maybeSingle()
    if (data && new Date(String(data.expires_at)).getTime() > Date.now()) {
      return data.payload as BarcodeProduct | null
    }
  } catch { /* cache miss */ }

  const result = await tryGoUPC(barcode) ?? await tryUPCItemDB(barcode)
  if (result) {
    try {
      const supabase = createServerSupabaseClient()
      await supabase.from('aria_signal_cache').upsert({
        cache_key: cacheKey, signal_type: 'barcode', payload: result,
        expires_at: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
      }, { onConflict: 'cache_key' })
    } catch { /* non-fatal */ }
  }
  return result
}
