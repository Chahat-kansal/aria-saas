export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
import { withErrorCapture } from '@/lib/api/with-error-capture'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code        = searchParams.get('code')
  const business_id = searchParams.get('state')
  const error       = searchParams.get('error')
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error || !code || !business_id) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/social?error=${encodeURIComponent(error ?? 'google_auth_failed')}`
    )
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_BUSINESS_CLIENT_ID ?? ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_BUSINESS_CLIENT_SECRET ?? ''

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  `${appUrl}/api/social/google/callback`,
      grant_type:    'authorization_code',
    }),
  })
  const tokens = await tokenRes.json() as {
    access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string
  }

  if (!tokens.access_token) {
    return NextResponse.redirect(
      `${appUrl}/dashboard/social?error=${encodeURIComponent(tokens.error_description ?? 'google_token_failed')}`
    )
  }

  // Get Google user profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json() as { id?: string; name?: string; email?: string }

  // Get Google Business accounts
  const bizRes = await fetch(
    'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  const bizData = await bizRes.json() as { accounts?: Array<{ name?: string; accountName?: string }> }
  const account = bizData.accounts?.[0]

  // Get first location (needed for posting)
  let locationName: string | null = null
  if (account?.name) {
    const locRes = await fetch(
      `https://mybusiness.googleapis.com/v4/${account.name}/locations`,
      { headers: { Authorization: `Bearer ${tokens.access_token}` } }
    )
    const locData = await locRes.json() as { locations?: Array<{ name?: string }> }
    locationName = locData.locations?.[0]?.name ?? null
  }

  const supabase = createServerSupabaseClient()

  // Upsert connection — store the long-lived refresh_token in access_token column
  // (refresh_token is used at post-time to obtain a fresh access_token)
  const credentialToStore = tokens.refresh_token ?? tokens.access_token

  await supabase.from('social_connections').upsert({
    business_id,
    platform:              'google_business',
    platform_account_id:   account?.name ?? profile.id ?? business_id,
    platform_account_name: account?.accountName ?? profile.name ?? null,
    platform_page_id:      locationName,
    account_handle:        profile.email ?? null,
    access_token:          credentialToStore,
    token_expires_at:      tokens.refresh_token
      ? null // refresh tokens don't expire
      : tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
    is_active:       true,
    connected_at:    new Date().toISOString(),
    last_synced_at:  new Date().toISOString(),
  }, { onConflict: 'business_id,platform' })

  return NextResponse.redirect(`${appUrl}/dashboard/social?connected=google`)
}

export const GET = withErrorCapture('social/google/callback', _GET)