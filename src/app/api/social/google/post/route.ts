export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function refreshGoogleToken(refresh_token: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID     ?? process.env.GOOGLE_BUSINESS_CLIENT_ID     ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? '',
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json() as { access_token?: string }
  return data.access_token ?? null
}

async function _POST(req: Request) {
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { business_id, post_id, caption, topic_type = 'STANDARD' } = await req.json() as {
    business_id?: string; post_id?: string; caption?: string; topic_type?: string
  }

  if (!business_id || !caption) {
    return NextResponse.json({ error: 'business_id and caption required' }, { status: 400 })
  }

  // Verify business ownership
  const { data: biz } = await supabase.from('businesses')
    .select('id').eq('id', business_id).eq('user_id', user.id).maybeSingle()
  if (!biz) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get Google Business connection
  const { data: conn } = await supabase.from('social_connections')
    .select('platform_account_id, platform_page_id, platform_account_name, access_token')
    .eq('business_id', business_id)
    .eq('platform', 'google_business')
    .eq('is_active', true)
    .maybeSingle()

  if (!conn) {
    return NextResponse.json({
      error: 'not_connected',
      message: 'Connect your Google Business Profile first in Social → Connected Accounts',
    }, { status: 400 })
  }

  // Refresh to get a live access_token
  const access_token = await refreshGoogleToken(conn.access_token)
  if (!access_token) {
    return NextResponse.json({
      error: 'token_refresh_failed',
      message: 'Could not refresh Google token. Reconnect your Google Business Profile.',
    }, { status: 401 })
  }

  // Resolve location name — prefer stored platform_page_id, else fetch fresh
  let locationName = conn.platform_page_id as string | null
  if (!locationName && conn.platform_account_id) {
    const locRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${conn.platform_account_id}/locations`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    )
    const locData = await locRes.json() as { locations?: Array<{ name?: string }> }
    locationName = locData.locations?.[0]?.name ?? null

    // Cache it for next time
    if (locationName) {
      await supabase.from('social_connections')
        .update({ platform_page_id: locationName })
        .eq('business_id', business_id)
        .eq('platform', 'google_business')
    }
  }

  if (!locationName) {
    return NextResponse.json({
      error: 'no_location',
      message: 'No Google Business location found. Make sure your account has a verified location.',
    }, { status: 400 })
  }

  // Create Local Post on Google Business Profile
  const postRes = await fetch(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        languageCode: 'en-AU',
        summary:      caption.slice(0, 1500), // Google's character limit
        topicType:    topic_type,             // STANDARD | EVENT | OFFER | PRODUCT
      }),
    }
  )

  const postData = await postRes.json() as {
    name?: string; searchUrl?: string; error?: { message?: string }
  }

  if (!postRes.ok) {
    console.error('[google/post] localPost failed:', JSON.stringify(postData))
    return NextResponse.json({
      error: postData.error?.message ?? 'Post failed',
      details: postData,
    }, { status: 400 })
  }

  // Mark social_posts record as published if post_id provided
  if (post_id) {
    await supabase.from('social_posts').update({
      status:           'published',
      published_at:     new Date().toISOString(),
      platform_post_id: postData.name ?? null,
    }).eq('id', post_id)
  }

  return NextResponse.json({
    ok:             true,
    google_post_id: postData.name,
    post_url:       postData.searchUrl ?? null,
  })
}

export const POST = withErrorCapture('social/google/post', _POST)