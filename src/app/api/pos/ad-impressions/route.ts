export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// PUBLIC endpoint — called from customer display + kiosk, no auth required
// Validates the campaign belongs to the claimed business before logging
export async function POST(req: Request) {
  try {
    const { campaign_id, business_id } = await req.json() as { campaign_id?: string; business_id?: string }
    if (!campaign_id || !business_id) {
      return NextResponse.json({ error: 'campaign_id and business_id required' }, { status: 400 })
    }
    const { data: campaign } = await supabaseAdmin.from('ad_campaigns')
      .select('id').eq('id', campaign_id).eq('business_id', business_id).eq('status', 'active').maybeSingle()
    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found or not active' }, { status: 404 })
    }
    await supabaseAdmin.from('ad_impressions').insert({ campaign_id, business_id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[ad-impressions] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// Public GET — returns active campaigns for a business (for display rotation)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const business_id = searchParams.get('business_id')
    if (!business_id) return NextResponse.json({ error: 'business_id required' }, { status: 400 })
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabaseAdmin.from('ad_campaigns')
      .select('id, ad_title, ad_body, ad_image_url, advertiser_name')
      .eq('business_id', business_id)
      .eq('status', 'active')
      .or(`start_date.is.null,start_date.lte.${today}`)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .limit(10)
    return NextResponse.json({ campaigns: data ?? [] })
  } catch (err) {
    console.error('[ad-impressions GET] error', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
