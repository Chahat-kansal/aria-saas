export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { geminiFlash } from '@/lib/gemini'
import { checkGeminiRateLimit } from '@/lib/gemini-rate-limiter'

const INDUSTRY_DEFAULTS: Record<string, string[]> = {
  liquor:      ['Dan Murphy\'s', 'BWS', 'Liquorland', 'First Choice Liquor', 'Vintage Cellars'],
  cafe:        ['Gloria Jean\'s', 'The Coffee Club', 'Muffin Break', 'Starbucks'],
  restaurant:  ['Nando\'s', 'Grill\'d', 'Hungry Jack\'s', 'Red Rooster'],
  retail:      ['Woolworths', 'Coles', 'IGA', 'Aldi'],
  pharmacy:    ['Chemist Warehouse', 'Priceline', 'Terry White Chemmart'],
  supermarket: ['Woolworths', 'Coles', 'IGA', 'Aldi'],
  bakery:      ['Bakers Delight', 'Brumby\'s Bakery'],
  convenience: ['7-Eleven', 'Night Owl', 'IGA Express'],
}

async function checkCompetitorPrices(
  competitorName: string, suburb: string, industry: string, businessId: string
) {
  try {
    const prompt = `Search the web for current prices at "${competitorName}" in ${suburb}, Australia.
For a ${industry} business, what are their current prices for their most popular products?
Are they running any current promotions or specials?
Return ONLY valid JSON:
{
  "found": true,
  "sample_prices": [{"product": "string", "price": number}],
  "current_promotions": "description or null",
  "price_level": "budget|mid|premium"
}`
    const result = await geminiFlash.generateContent(prompt)
    const text = result.response.text().replace(/```json|```/g, '').trim()
    const data = JSON.parse(text)

    // Persist sample prices into competitor_price_cache
    if (data && data.found && Array.isArray(data.sample_prices)) {
      const expiresAt = new Date(Date.now() + 7 * 86400_000).toISOString()
      const rows = (data.sample_prices as Array<{ product: string; price: number }>)
        .slice(0, 5)
        .map(sp => ({
          business_id: businessId,
          competitor_name: competitorName,
          product_name: sp.product,
          competitor_price_cents: Math.round((sp.price ?? 0) * 100),
          source: 'gemini',
          confidence: 'ai_grounded',
          searched_at: new Date().toISOString(),
          expires_at: expiresAt,
        }))
      if (rows.length > 0) await supabaseAdmin.from('competitor_price_cache').insert(rows)
    }
    return data
  } catch {
    return null
  }
}

async function _GET(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const business_id = searchParams.get('business_id')
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
  const { data: watches } = await supabaseAdmin.from('aria_competitor_watches')
    .select('id,competitor_name,competitor_url,is_active')
    .eq('business_id', business_id).order('created_at', { ascending: true })
  // Auto-seed if no watches exist yet
  if ((watches ?? []).length === 0) {
    const { data: biz } = await supabaseAdmin
      .from('businesses').select('industry,lat,lng,suburb,city').eq('id', business_id).maybeSingle()
    const industry = (biz?.industry as string ?? 'default').toLowerCase()
    const toInsert: string[] = []

    // 1. Nearby search via Google Places if lat/lng available
    const placesKey = process.env.GOOGLE_PLACES_API_KEY
    if (placesKey && biz?.lat && biz?.lng) {
      try {
        const industryType: Record<string, string> = {
          cafe: 'cafe', restaurant: 'restaurant', liquor: 'liquor_store',
          retail: 'store', pharmacy: 'pharmacy', bakery: 'bakery', supermarket: 'supermarket',
        }
        const placeType = industryType[industry] ?? 'store'
        const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${biz.lat},${biz.lng}&radius=3000&type=${placeType}&key=${placesKey}`
        const res = await fetch(url)
        const data = await res.json() as { results?: Array<{ name: string; vicinity: string; website?: string }> }
        for (const place of (data.results ?? []).slice(0, 8)) {
          if (!toInsert.includes(place.name)) toInsert.push(place.name)
        }
      } catch { /* fall through to chain defaults */ }
    }

    // 2. Always add national chain defaults for this industry
    const chains = INDUSTRY_DEFAULTS[industry] ?? []
    for (const chain of chains) {
      if (!toInsert.includes(chain)) toInsert.push(chain)
    }

    if (toInsert.length > 0) {
      const rows = toInsert.map(name => ({
        business_id, competitor_name: name, is_active: true,
        created_at: new Date().toISOString(),
      }))
      const { data: seeded } = await supabaseAdmin
        .from('aria_competitor_watches')
        .insert(rows)
        .select('id,competitor_name,competitor_url,is_active')
      return NextResponse.json({ 
        watches: seeded ?? [], 
        auto_seeded: true,
        source: placesKey && biz?.lat ? 'google_places+chains' : 'chains_only'
      })
    }
  }
  const activeWatches = (watches ?? []).filter((w: any) => w.is_active)
  if (activeWatches.length > 0) {
    const allowed = await checkGeminiRateLimit().catch(() => false)
    if (allowed) {
      const { data: biz } = await supabaseAdmin
        .from('businesses').select('industry, suburb, city').eq('id', business_id).maybeSingle()
      const suburb = (biz?.suburb as string | null) ?? (biz?.city as string | null) ?? 'Melbourne'
      const industry = (biz?.industry as string | null) ?? 'retail'
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString()

      let checked = 0
      for (const w of activeWatches.slice(0, 3)) {
        if (checked >= 3) break
        // Skip if checked recently
        const { count } = await supabaseAdmin.from('competitor_price_cache')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', business_id)
          .eq('competitor_name', w.competitor_name)
          .gte('searched_at', sevenDaysAgo)
        if ((count ?? 0) > 0) continue
        await checkCompetitorPrices(w.competitor_name as string, suburb, industry, business_id)
        checked++
      }
    }
  }

  return NextResponse.json({ watches: watches ?? [] })
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { business_id, competitor_name, competitor_url } = await req.json()
  if (!business_id || !competitor_name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  const { data } = await supabaseAdmin.from('aria_competitor_watches').insert({
    business_id, competitor_name, competitor_url: competitor_url || null,
    is_active: true, created_at: new Date().toISOString(),
  }).select('id').single()
  return NextResponse.json({ ok: true, id: data?.id })
}

async function _DELETE(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await supabaseAdmin.from('aria_competitor_watches').update({ is_active: false }).eq('id', id)
  return NextResponse.json({ ok: true })
}

export const GET = withErrorCapture('aria/competitor-watches', _GET)
export const POST = withErrorCapture('aria/competitor-watches', _POST)
export const DELETE = withErrorCapture('aria/competitor-watches', _DELETE)
