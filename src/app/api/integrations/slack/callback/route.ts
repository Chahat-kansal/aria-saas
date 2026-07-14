export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { withErrorCapture } from '@/lib/api/with-error-capture'
import { redeemOAuthState } from '@/lib/integrations/oauth-state'
import { writeSlackToken, SLACK_KEY } from '@/lib/integrations/slack'

async function _GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  if (error) {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_' + error)
  }
  if (!code || !stateRaw) {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_missing_params')
  }

  // CONNECTOR-VAULT-1a — state is now a random token looked up server-side (never decoded/trusted),
  // checked for expiry, and re-verified against the CURRENT session's business access — not just
  // whatever business_id was embedded in the client-supplied value.
  const supabase = createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const redeemed = await redeemOAuthState(stateRaw, SLACK_KEY, user?.id)
  if (!redeemed) {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_invalid_state')
  }
  const { businessId, integrationId } = redeemed

  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_not_configured')
  }

  const redirectUri = appUrl + '/api/integrations/slack/callback'

  const tokenRes = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
  })

  const tokenData = await tokenRes.json() as Record<string, unknown>
  if (!tokenData.ok) {
    const errCode = (tokenData.error as string) ?? 'unknown'
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_' + errCode)
  }

  const accessToken = tokenData.access_token as string
  const teamId = (tokenData.team as Record<string, unknown>)?.id as string ?? ''
  const teamName = (tokenData.team as Record<string, unknown>)?.name as string ?? ''

  // CONNECTOR-VAULT-1a — the credential itself is now encrypted in pos_oauth_integrations; the
  // non-secret display columns stay on businesses exactly as before.
  await writeSlackToken(businessId, integrationId, accessToken)

  const { error: dbErr } = await supabaseAdmin.from('businesses').update({
    slack_team_id: teamId,
    slack_team_name: teamName,
    slack_connected: true,
  }).eq('id', businessId)

  if (dbErr) {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_db_error')
  }

  return NextResponse.redirect(appUrl + '/dashboard/integrations?connected=slack')
}

export const GET = withErrorCapture('integrations/slack/callback', _GET)
