export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { business_id } = body as { business_id?: string }
  if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })

  const { data: biz } = await supabase
    .from('businesses')
    .select('id, name, trading_name, address, city, phone, abn, industry, google_place_id, google_average_rating, google_total_reviews, website')
    .eq('id', business_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const fields = ['name', 'address', 'city', 'phone', 'industry', 'website', 'abn', 'google_place_id'] as const
  const filled = fields.filter(f => biz[f] != null && String(biz[f]).trim() !== '').length
  const score = Math.round((filled / fields.length) * 100)

  const gbpListed = !!biz.google_place_id
  const reviewCount = biz.google_total_reviews ?? null
  const reviewAvg = biz.google_average_rating ?? null

  const issues: Array<{ field: string; message: string }> = []
  if (!biz.google_place_id) issues.push({ field: 'google_place_id', message: 'Google Place ID not connected — link your Google Business Profile' })
  if (!biz.phone) issues.push({ field: 'phone', message: 'Phone number missing from business profile' })
  if (!biz.website) issues.push({ field: 'website', message: 'Website URL not set on business profile' })
  if (!biz.address || !biz.city) issues.push({ field: 'address', message: 'Business address incomplete' })
  if ((reviewCount ?? 0) < 5) issues.push({ field: 'reviews', message: 'Fewer than 5 Google reviews — encourage customers to leave reviews' })

  const checklist = [
    { item: 'Business name set', ok: !!(biz.name || biz.trading_name) },
    { item: 'Address set', ok: !!(biz.address && biz.city) },
    { item: 'Phone number set', ok: !!biz.phone },
    { item: 'Industry / category set', ok: !!biz.industry },
    { item: 'Website linked', ok: !!biz.website },
    { item: 'Google Place ID connected', ok: gbpListed },
    { item: 'Has Google reviews', ok: (reviewCount ?? 0) > 0 },
    { item: 'Rating 4.0 or above', ok: (reviewAvg ?? 0) >= 4.0 },
  ]

  const payload = {
    business_id,
    gbp_completeness: score,
    gbp_listed: gbpListed,
    review_count: reviewCount,
    review_avg: reviewAvg,
    map_pack_rank: null,
    citations_total: null,
    citations_consistent: null,
    review_velocity_30d: null,
    checklist,
    scanned_at: new Date().toISOString(),
  }

  const { error } = await supabaseAdmin
    .from('seo_local')
    .upsert(payload, { onConflict: 'business_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, score, gbp_listed: gbpListed, review_count: reviewCount, review_avg: reviewAvg, issues, checklist })
}

export const POST = withErrorCapture('seo/local', _POST)
