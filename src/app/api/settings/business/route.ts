export const dynamic = 'force-dynamic'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function getBid(supabase: ReturnType<typeof createServerSupabaseClient>, userId: string): Promise<string | null> {
  const { data: active } = await supabase.from('user_active_business').select('business_id').eq('user_id', userId).maybeSingle()
  if (active?.business_id) return active.business_id as string
  const { data } = await supabase.from('businesses').select('id').eq('user_id', userId).eq('is_active', true).order('created_at', { ascending: true }).limit(1).maybeSingle()
  return data?.id ?? null
}

async function _GET() {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ business: null })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, industry, industry_subtype, abn, city, address, business_state, postcode, country, lat, lng, place_id, formatted_address, phone, google_place_id, google_average_rating, google_total_reviews, google_reviews_last_synced, facebook_page_id, yelp_url, review_auto_request_enabled, review_request_min_spend_cents, review_request_cooldown_days, google_review_link, booking_link_slug, slug, weekly_revenue_target')
    .eq('id', bid)
    .maybeSingle()

  return NextResponse.json({ business: biz ?? null })
}

export const GET = withErrorCapture('settings/business', _GET)

async function _PATCH(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const bid = await getBid(supabase, user.id)
  if (!bid) return NextResponse.json({ error: 'No business' }, { status: 400 })

  const body = await req.json()
  const payload: Record<string, unknown> = {}
  if (body.name       !== undefined) payload.name        = body.name
  if (body.abn        !== undefined) payload.abn         = body.abn
  if (body.city       !== undefined) payload.city        = body.city
  if (body.address    !== undefined) payload.address     = body.address
  if (body.business_state !== undefined) payload.business_state = body.business_state
  if (body.postcode   !== undefined) payload.postcode    = body.postcode
  // ADDRESS-1 — structured lat/lng/place_id/formatted_address from Geoapify autocomplete.
  if (body.lat        !== undefined) payload.lat         = body.lat === null || body.lat === '' ? null : Number(body.lat)
  if (body.lng        !== undefined) payload.lng         = body.lng === null || body.lng === '' ? null : Number(body.lng)
  if (body.place_id   !== undefined) payload.place_id    = body.place_id || null
  if (body.formatted_address !== undefined) payload.formatted_address = body.formatted_address || null
  if (body.phone      !== undefined) payload.phone       = body.phone
  if (body.industry   !== undefined) payload.industry    = body.industry
  if (body.industry_subtype !== undefined) payload.industry_subtype = body.industry_subtype || null
  if (body.google_place_id     !== undefined) payload.google_place_id     = body.google_place_id || null
  if (body.facebook_page_id    !== undefined) payload.facebook_page_id    = body.facebook_page_id || null
  if (body.yelp_url            !== undefined) payload.yelp_url            = body.yelp_url || null
  // FIELD-MISMATCH FIX — this UI toggle previously wrote auto_review_requests,
  // but /api/reviews/auto-request (the actual sender) reads
  // review_auto_request_enabled. The toggle had zero functional effect.
  if (body.review_auto_request_enabled !== undefined) payload.review_auto_request_enabled = !!body.review_auto_request_enabled
  if (body.google_review_link  !== undefined) payload.google_review_link  = body.google_review_link || null
  if (body.booking_link_slug   !== undefined) {
    const s = String(body.booking_link_slug || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    payload.booking_link_slug = s || null
  }
  // I2 GOAL-AWARE — weekly revenue target (numeric, >= 0, max 9,999,999)
  if (body.weekly_revenue_target !== undefined) {
    const n = Number(body.weekly_revenue_target)
    if (!Number.isFinite(n) || n < 0 || n > 9_999_999) {
      return NextResponse.json({ error: 'weekly_revenue_target must be a number between 0 and 9,999,999' }, { status: 400 })
    }
    payload.weekly_revenue_target = Math.round(n * 100) / 100
  }

  if (Object.keys(payload).length === 0) return NextResponse.json({ ok: true })

  const { error } = await supabaseAdmin.from('businesses').update(payload).eq('id', bid)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, ...(payload.weekly_revenue_target !== undefined ? { weekly_revenue_target: payload.weekly_revenue_target } : {}) })
}

export const PATCH = withErrorCapture('settings/business', _PATCH)