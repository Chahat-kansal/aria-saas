export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { withErrorCapture } from '@/lib/api/with-error-capture'

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

  let businessId: string
  try {
    const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
    businessId = parsed.business_id
  } catch {
    return NextResponse.redirect(appUrl + '/dashboard/integrations?error=slack_invalid_state')
  }

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

  const { error: dbErr } = await supabaseAdmin.from('businesses').update({
    slack_access_token: accessToken,
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
