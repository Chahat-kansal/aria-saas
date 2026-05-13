export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code   = searchParams.get('code')
  const state  = searchParams.get('state') // business_id
  const error  = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

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
    const appId     = process.env.META_APP_ID ?? process.env.FACEBOOK_APP_ID ?? ''
    const appSecret = process.env.META_APP_SECRET ?? process.env.FACEBOOK_APP_SECRET ?? ''
    const redirectUri = `${appUrl}/api/integrations/facebook/callback`

    // Exchange code for short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`
    )
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[facebook/callback] token failed', tokenData)
      return NextResponse.redirect(`${appUrl}/dashboard/social?error=token_failed`)
    }

    // Exchange for long-lived token (~60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v25.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
    )
    const longData   = await longRes.json()
    const userToken  = longData.access_token ?? tokenData.access_token
    const expiresAt  = new Date(Date.now() + (longData.expires_in ?? 5184000) * 1000).toISOString()

    // Get managed Pages (with linked Instagram)
    const pagesRes = await fetch(
      `https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,profile_picture_url,followers_count}&access_token=${userToken}`
    )
    const pagesData = await pagesRes.json()
    if (!pagesData.data?.length) {
      return NextResponse.redirect(`${appUrl}/dashboard/social?error=no_pages`)
    }

    const page = pagesData.data[0]

    // Save Facebook Page connection
    await supabase.from('social_connections').upsert({
      business_id:           biz.id,
      platform:              'facebook',
      platform_account_id:   page.id,
      platform_account_name: page.name,
      platform_page_id:      page.id,
      access_token:          page.access_token,
      token_expires_at:      expiresAt,
      is_active:             true,
      last_synced_at:        new Date().toISOString(),
    }, { onConflict: 'business_id,platform' })

    // If Instagram Business is linked to this Page, save it too
    if (page.instagram_business_account) {
      const ig = page.instagram_business_account
      await supabase.from('social_connections').upsert({
        business_id:           biz.id,
        platform:              'instagram',
        platform_account_id:   ig.id,
        instagram_account_id:  ig.id,
        platform_account_name: ig.username,
        account_handle:        `@${ig.username}`,
        profile_picture:       ig.profile_picture_url ?? null,
        follower_count:        ig.followers_count ?? 0,
        platform_page_id:      page.id,
        access_token:          page.access_token,
        token_expires_at:      expiresAt,
        is_active:             true,
        last_synced_at:        new Date().toISOString(),
      }, { onConflict: 'business_id,platform' })
    }

    return NextResponse.redirect(`${appUrl}/dashboard/social?connected=facebook`)
  } catch (err: any) {
    console.error('[facebook/callback]', err)
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=unexpected`)
  }
}

export const GET = withErrorCapture('integrations/facebook/callback', _GET)