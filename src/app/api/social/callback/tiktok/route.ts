export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state') // business_id
  const error = searchParams.get('error')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !state) {
    return NextResponse.redirect(appUrl + '/dashboard/social?error=' + encodeURIComponent(error ?? 'missing_code'))
  }

  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(appUrl + '/dashboard/social?error=not_authenticated')

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY ?? '',
        client_secret: process.env.TIKTOK_CLIENT_SECRET ?? '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: appUrl + '/api/social/callback/tiktok',
      }),
    })
    const tokenData = await tokenRes.json()
    if (tokenData.error) throw new Error(tokenData.error_description)

    const { access_token, open_id, expires_in } = tokenData.data

    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url', {
      headers: { Authorization: 'Bearer ' + access_token },
    })
    const userData = await userRes.json()
    const displayName = userData.data?.user?.display_name ?? 'TikTok Account'

    const expiresAt = new Date(Date.now() + (expires_in * 1000)).toISOString()

    await supabase.from('social_connections').upsert({
      business_id: state,
      platform: 'tiktok',
      platform_account_id: open_id,
      platform_account_name: displayName,
      access_token,
      token_expires_at: expiresAt,
      is_active: true,
    }, { onConflict: 'business_id,platform' })

    return NextResponse.redirect(appUrl + '/dashboard/social?connected=tiktok')
  } catch (e: any) {
    return NextResponse.redirect(appUrl + '/dashboard/social?error=' + encodeURIComponent(e.message))
  }
}

export const GET = withErrorCapture('social/callback/tiktok', _GET)
