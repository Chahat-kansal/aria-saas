export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const state    = searchParams.get('state') // business_id
  const error    = searchParams.get('error')
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=${error ?? 'oauth_failed'}`)
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${appUrl}/login`)

  const { data: biz } = await supabase.from('businesses')
    .select('id, name').eq('id', state).eq('user_id', user.id).maybeSingle()
  if (!biz) {
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=invalid_business`)
  }

  try {
    // Exchange code for short-lived token
    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.INSTAGRAM_APP_ID ?? process.env.META_APP_ID ?? '',
        client_secret: process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET ?? '',
        grant_type:    'authorization_code',
        redirect_uri:  `${appUrl}/api/integrations/instagram/callback`,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[instagram/callback] token exchange failed', tokenData)
      return NextResponse.redirect(`${appUrl}/dashboard/social?error=token_failed`)
    }

    // Upgrade to long-lived token (60 days)
    const longRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET ?? process.env.META_APP_SECRET}&access_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    const accessToken = longData.access_token ?? tokenData.access_token
    const expiresIn   = longData.expires_in ?? 3600

    // Fetch profile
    const profileRes = await fetch(
      `https://graph.instagram.com/v25.0/me?fields=id,username,account_type,followers_count,profile_picture_url&access_token=${accessToken}`
    )
    const profile = await profileRes.json()

    await supabase.from('social_connections').upsert({
      business_id:           biz.id,
      platform:              'instagram',
      platform_account_id:   profile.id,
      platform_account_name: profile.username,
      account_handle:        `@${profile.username}`,
      profile_picture:       profile.profile_picture_url ?? null,
      follower_count:        profile.followers_count ?? 0,
      access_token:          accessToken,
      token_expires_at:      new Date(Date.now() + expiresIn * 1000).toISOString(),
      is_active:             true,
      last_synced_at:        new Date().toISOString(),
    }, { onConflict: 'business_id,platform' })

    return NextResponse.redirect(`${appUrl}/dashboard/social?connected=instagram`)
  } catch (err: any) {
    console.error('[instagram/callback]', err)
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=unexpected`)
  }
}

export const GET = withErrorCapture('integrations/instagram/callback', _GET)