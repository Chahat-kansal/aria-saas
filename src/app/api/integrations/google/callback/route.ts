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
    const redirectUri = `${appUrl}/api/integrations/google/callback`

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_BUSINESS_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? '',
        redirect_uri:  redirectUri,
        grant_type:    'authorization_code',
      }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) {
      console.error('[google/callback] token failed', tokens)
      return NextResponse.redirect(`${appUrl}/dashboard/social?error=token_failed`)
    }

    // Get Google user info
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userInfoRes.json()

    let accountId    = userInfo.id
    let locationId:   string | null = null
    let locationName: string | null = userInfo.name

    // Try Business Profile API — graceful if not approved yet
    try {
      const accountsRes = await fetch(
        'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      )
      const accountsData = await accountsRes.json()
      if (accountsData.accounts?.length) {
        accountId = accountsData.accounts[0].name.replace('accounts/', '')
        const locRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${accountId}/locations?readMask=name,title`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        )
        const locData = await locRes.json()
        if (locData.locations?.length) {
          locationId   = locData.locations[0].name
          locationName = locData.locations[0].title ?? locationName
        }
      }
    } catch { /* Business Profile API not approved yet — save anyway */ }

    await supabase.from('social_connections').upsert({
      business_id:           biz.id,
      platform:              'google_business',
      platform_account_id:   accountId,
      platform_account_name: locationName,
      platform_page_id:      locationId,
      profile_picture:       userInfo.picture ?? null,
      access_token:          tokens.access_token,
      token_expires_at:      tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      is_active:             true,
      last_synced_at:        new Date().toISOString(),
    }, { onConflict: 'business_id,platform' })

    return NextResponse.redirect(`${appUrl}/dashboard/social?connected=google`)
  } catch (err: any) {
    console.error('[google/callback]', err)
    return NextResponse.redirect(`${appUrl}/dashboard/social?error=unexpected`)
  }
}

export const GET = withErrorCapture('integrations/google/callback', _GET)